import type * as vscode from 'vscode';

/**
 * The v1 transport contract for CalmUI for Antigravity CLI.
 *
 * DESIGN (locked 2026-06-11, see .planning/2026-06-11-spike-results.md):
 *  - There is NO ACP / JSON-RPC stdio mode in agy today (issue #31 open).
 *  - `agy -p` authenticates fine (incl. gcp/Vertex) but "drips" its answer to a
 *    TTY; a piped stdout receives 0 bytes. So we run agy inside a pseudo-terminal
 *    (node-pty), capture the dripped output, and strip ANSI -> clean text.
 *  - The SDK is rejected for v1 (requires a consumer GEMINI_API_KEY; will not
 *    reuse gcp/Vertex auth; heavy native deps).
 *
 * Keep this interface deliberately small. When/if agy ships a real bidirectional
 * IDE protocol, add an AcpAgyTransport implementing the same shape — UI unchanged.
 */
export interface AgyAvailability {
  found: boolean;
  /** Resolved absolute path or the bare command actually used. */
  resolvedPath?: string;
  /** Output of `agy --version`, if found. */
  version?: string;
  /** True once a probe prompt round-trips (auth + model reachable). */
  authedProbeOk?: boolean;
  /** Human-readable reason when found === false or probe failed. */
  detail?: string;
}

export interface AgySendOptions {
  /** --model override; omit/empty to use agy default. */
  model?: string;
  /** --add-dir extra read roots (absolute paths). */
  includeDirectories?: string[];
  /** --print-timeout in seconds. */
  printTimeoutSeconds?: number;
  /**
   * Resume an existing agy conversation by id (--conversation <id>) for
   * multi-turn. Omit for a fresh conversation (-p only).
   */
  conversationId?: string;
  /**
   * Continue the most-recent agy conversation (-c/--continue). Used as the
   * multi-turn fallback when we have prior turns in this panel thread but could
   * not confidently capture a conversation id from the shared log. Ignored when
   * `conversationId` is set (explicit id wins — it is unambiguous).
   */
  continue?: boolean;
  /** Working directory for the spawn (defaults to the active workspace root). */
  cwd?: string;
}

export interface AgyResult {
  /** Cleaned assistant text (ANSI stripped, drip normalised). */
  text: string;
  /** Conversation id agy used/created, parsed from the cli.log, if available. */
  conversationId?: string;
  exitCode: number | null;
}

export interface AgyModel {
  label: string;
  value: string;
}

export interface AgyTransport extends vscode.Disposable {
  /** Detect the binary, read --version, optionally run a probe prompt. */
  checkAvailability(probe: boolean): Promise<AgyAvailability>;

  /**
   * Run a single quick-ask prompt to completion. Read-only by contract:
   * v1 never passes --dangerously-skip-permissions and never enables writes.
   * Anything that would edit files / need approvals is escalated to the
   * terminal by the UI layer, not run here.
   *
   * onPartial streams the cleaned, incrementally-settled text for a live feel.
   */
  sendPrompt(
    prompt: string,
    options: AgySendOptions,
    onPartial?: (cleanedSoFar: string) => void,
  ): Promise<AgyResult>;

  /** Cancel the in-flight prompt (kills the pty), if any. */
  cancel(): void;

  /** List models reported by `agy models`; return [] if unavailable. */
  listModels(): Promise<AgyModel[]>;

  /** Open an Antigravity terminal, optionally prefilled with `prompt`. */
  openInteractiveTerminal(prompt?: string): void;
}
