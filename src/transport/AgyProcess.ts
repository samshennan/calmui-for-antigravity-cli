import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
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
 * STATUS: scaffold. `checkAvailability` is implemented. `sendPrompt` has the pty
 * wiring sketched but node-pty is NOT yet a dependency — Phase 0.5 must add and
 * validate it IN THE EXTENSION HOST (Electron ABI is the #1 risk). Until then
 * sendPrompt throws a clear, user-facing error and the UI offers terminal handoff.
 *
 * See .planning/2026-06-11-build-plan.md Phase 0.5.
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
      // A probe must go through the pty path (plain -p yields 0 bytes). Once
      // sendPrompt is wired in Phase 0.5, run a tiny prompt here and set
      // authedProbeOk based on a non-empty cleaned result.
      avail.authedProbeOk = undefined;
      avail.detail = 'Probe pending node-pty wiring (Phase 0.5).';
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
        resolve({ text: normalizeDrip(raw), exitCode });
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
