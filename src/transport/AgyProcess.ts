import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { normalizeDrip } from './ansi';
import type {
  AgyTransport,
  AgyAvailability,
  AgyModel,
  AgySendOptions,
  AgyResult,
} from './AgyTransport';

/**
 * node-pty-backed implementation of AgyTransport.
 *
 * STATUS: Phase 0.5 complete. `checkAvailability` with auth probe and `sendPrompt`
 * with full pty wiring are now implemented. node-pty is a dependency; tested to
 * load without ABI errors on Windows.
 *
 * See 2026-06-11-build-plan.md Phase 0.5 and 2026-06-11-spike-results.md.
 */
export class AgyProcess implements AgyTransport {
  private agyPath: string;
  private resolvedBinary: string | null = null;
  private ptyProc: { kill(): void } | null = null;

  constructor(agyPath = 'agy') {
    this.agyPath = agyPath;
  }

  /**
   * Resolve agyPath to an absolute executable path. node-pty (conpty) on
   * Windows does not search PATH or apply PATHEXT, so spawning a bare 'agy'
   * fails with "File not found" even when the shell finds it fine.
   */
  private async resolveBinary(): Promise<string> {
    if (this.resolvedBinary) return this.resolvedBinary;
    if (path.isAbsolute(this.agyPath)) {
      this.resolvedBinary = this.agyPath;
      return this.resolvedBinary;
    }
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const out = await this.runCapture([finder, this.agyPath]).catch(() => '');
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const exe = lines.find((l) => /\.exe$/i.test(l)) ?? lines[0];
    this.resolvedBinary = exe || this.agyPath;
    return this.resolvedBinary;
  }

  async checkAvailability(probe: boolean): Promise<AgyAvailability> {
    const version = await this.runCapture([this.agyPath, '--version']).catch(
      () => null,
    );
    if (version == null) {
      return {
        found: false,
        detail:
          'agy not found on PATH. Install with: irm https://antigravity.google/cli/install.ps1 | iex — then fully quit and reopen the editor so PATH refreshes.',
      };
    }
    const avail: AgyAvailability = {
      found: true,
      resolvedPath: await this.resolveBinary(),
      version: version.trim(),
    };
    if (probe) {
      try {
        const result = await this.sendPrompt(
          'Reply with exactly: CALMUI_PROBE_OK',
          { cwd: process.cwd() },
        );
        avail.authedProbeOk =
          result.text.trim() === 'CALMUI_PROBE_OK' && result.exitCode === 0;
        if (!avail.authedProbeOk) {
          avail.detail = `Probe response was not recognized. Got: "${result.text.trim()}" (exit ${result.exitCode}).`;
        }
      } catch (e) {
        avail.authedProbeOk = false;
        avail.detail = `Probe error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return avail;
  }

  async sendPrompt(
    prompt: string,
    options: AgySendOptions,
    onPartial?: (cleanedSoFar: string) => void,
  ): Promise<AgyResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pty: any;
    try {
      // Lazy require so the extension still loads if the native module is absent.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pty = require('node-pty');
    } catch {
      throw new Error(
        'CalmUI: the agy transport (node-pty) is not installed yet. Use "CalmUI: Open Antigravity Terminal" to run this prompt in the terminal.',
      );
    }

    const args = ['-p', prompt];
    if (options.model) args.push('--model', options.model);
    if (options.printTimeoutSeconds)
      args.push('--print-timeout', `${options.printTimeoutSeconds}s`);
    if (options.conversationId)
      args.push('--conversation', options.conversationId);
    for (const dir of options.includeDirectories ?? [])
      args.push('--add-dir', dir);

    // conpty needs an absolute path, and can only CreateProcess real
    // executables — route .cmd/.bat shims through cmd.exe.
    let bin = await this.resolveBinary();
    let spawnArgs = args;
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
      spawnArgs = ['/c', bin, ...args];
      bin = process.env.ComSpec ?? 'cmd.exe';
    }

    // Record the current log size so we only scan the region appended during
    // this spawn — avoids returning an old conversation ID from a previous run.
    const logOffset = this.logSize();

    // Defensive: a hard ceiling above --print-timeout.
    const effectiveTimeoutSec = options.printTimeoutSeconds ?? 120;
    const ceilingMs = effectiveTimeoutSec * 1000 + 15000;

    return await new Promise<AgyResult>((resolve, reject) => {
      let raw = '';
      // The exit and timeout paths can both fire (a slow kill, a delayed exit).
      // Settle exactly once and tear down regardless of which wins.
      let settled = false;
      const proc = pty.spawn(bin, spawnArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: options.cwd ?? process.cwd(),
        env: process.env,
      });
      this.ptyProc = proc;
      const t = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          proc.kill();
        } catch {
          /* noop */
        }
        this.ptyProc = null;
        reject(
          new Error(
            `CalmUI: agy timed out after ${effectiveTimeoutSec}s. ` +
              `Raise the 'calmui-agy.printTimeoutSeconds' setting, or continue in the terminal.`,
          ),
        );
      }, ceilingMs);
      proc.onData((d: string) => {
        raw += d;
        if (onPartial) onPartial(normalizeDrip(raw));
      });
      proc.onExit(({ exitCode }: { exitCode: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        this.ptyProc = null;
        const conversationId = this.parseConversationId(logOffset);
        resolve({
          text: normalizeDrip(raw),
          conversationId,
          exitCode,
        });
      });
    });
  }

  cancel(): void {
    this.ptyProc?.kill();
    this.ptyProc = null;
  }

  async listModels(): Promise<AgyModel[]> {
    const output =
      (await this.runPtyCapture(['models'], 10000).catch(() => '')) ||
      (await this.runCapture([this.agyPath, 'models']).catch(() => ''));
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label) => ({ label, value: label }));
  }

  openInteractiveTerminal(prompt?: string): void {
    const term = vscode.window.createTerminal({ name: 'Antigravity (agy)' });
    term.show();
    // Prefill only — never auto-run; the user presses Enter.
    term.sendText(prompt ? `${this.agyPath} -i ${quote(prompt)}` : this.agyPath, false);
  }

  dispose(): void {
    this.cancel();
  }

  /** Return the current byte length of the cli.log file, or 0 if absent. */
  private logSize(): number {
    try {
      const logPath = path.join(
        os.homedir(),
        '.gemini',
        'antigravity-cli',
        'cli.log',
      );
      return fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Parse the "Created conversation <id>" line appended to cli.log after the
   * snapshot at `offsetBytes`. Returns undefined if no new line exists (e.g.
   * continuing an existing conversation via --conversation) OR if more than one
   * distinct id appears in the region — a second agy process writing to the same
   * global log concurrently would otherwise bind us to the wrong conversation.
   */
  private parseConversationId(offsetBytes: number): string | undefined {
    // Cap the scanned region so a large concurrent append can't force an
    // unbounded allocation in the extension host.
    const MAX_SCAN_BYTES = 64 * 1024;
    try {
      const logPath = path.join(
        os.homedir(),
        '.gemini',
        'antigravity-cli',
        'cli.log',
      );
      if (!fs.existsSync(logPath)) {
        return undefined;
      }
      const stat = fs.statSync(logPath);
      let start = offsetBytes;
      let length = stat.size - offsetBytes;
      if (length <= 0) {
        return undefined;
      }
      if (length > MAX_SCAN_BYTES) {
        // Scan the tail of the appended range; the id line is logged near the
        // start of a run, so this trades multi-turn on huge logs for safety.
        start = stat.size - MAX_SCAN_BYTES;
        length = MAX_SCAN_BYTES;
      }
      const buf = Buffer.alloc(length);
      const fd = fs.openSync(logPath, 'r');
      try {
        fs.readSync(fd, buf, 0, length, start);
      } finally {
        fs.closeSync(fd);
      }
      const region = buf.toString('utf-8');
      const re = /Created conversation ([a-f0-9-]+)/gi;
      const ids = new Set<string>();
      let last: string | undefined;
      let m: RegExpExecArray | null;
      while ((m = re.exec(region)) !== null) {
        ids.add(m[1]);
        last = m[1];
      }
      if (ids.size === 0) return undefined;
      if (ids.size > 1) return undefined; // ambiguous — don't bind the wrong id
      return last;
    } catch {
      return undefined;
    }
  }

  private runCapture(cmd: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const [bin, ...args] = cmd;
      const p = spawn(bin, args, { shell: process.platform === 'win32' });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d.toString()));
      p.stderr.on('data', (d) => (err += d.toString()));
      p.on('error', reject);
      p.on('close', (code) =>
        code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`)),
      );
    });
  }

  private async runPtyCapture(args: string[], timeoutMs: number): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pty: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pty = require('node-pty');
    } catch {
      return '';
    }

    let bin = await this.resolveBinary();
    let spawnArgs = args;
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
      spawnArgs = ['/c', bin, ...args];
      bin = process.env.ComSpec ?? 'cmd.exe';
    }

    return await new Promise<string>((resolve) => {
      let raw = '';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(normalizeDrip(raw));
      };
      const proc = pty.spawn(bin, spawnArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: process.cwd(),
        env: process.env,
      });
      const t = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          /* noop */
        }
        finish();
      }, timeoutMs);
      proc.onData((d: string) => {
        raw += d;
      });
      proc.onExit(() => {
        finish();
      });
    });
  }
}

function quote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}
