import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { normalizeDrip } from './ansi';
import type {
  AgyTransport,
  AgyAvailability,
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
  private ptyProc: { kill(): void } | null = null;

  constructor(agyPath = 'agy') {
    this.agyPath = agyPath;
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
      resolvedPath: this.agyPath,
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

    return await new Promise<AgyResult>((resolve, reject) => {
      let raw = '';
      const proc = pty.spawn(this.agyPath, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: options.cwd ?? process.cwd(),
        env: process.env,
      });
      this.ptyProc = proc;
      proc.onData((d: string) => {
        raw += d;
        if (onPartial) onPartial(normalizeDrip(raw));
      });
      proc.onExit(({ exitCode }: { exitCode: number }) => {
        this.ptyProc = null;
        const conversationId = this.parseConversationId();
        resolve({
          text: normalizeDrip(raw),
          conversationId,
          exitCode,
        });
      });
      // Defensive: a hard ceiling above --print-timeout.
      const ceilingMs = (options.printTimeoutSeconds ?? 120) * 1000 + 15000;
      const t = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          /* noop */
        }
        reject(new Error('CalmUI: agy prompt timed out.'));
      }, ceilingMs);
      proc.onExit(() => clearTimeout(t));
    });
  }

  cancel(): void {
    this.ptyProc?.kill();
    this.ptyProc = null;
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

  private parseConversationId(): string | undefined {
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
      const log = fs.readFileSync(logPath, 'utf-8');
      const match = /Created conversation ([a-f0-9\-]+)/i.exec(log);
      return match ? match[1] : undefined;
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
}

function quote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}
