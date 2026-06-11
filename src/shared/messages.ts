/**
 * Message contract between the extension host and the webview panel.
 * Kept minimal for v1 (quick-ask companion).
 */

export type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  /** assistant only: still streaming/settling. */
  pending?: boolean;
}

/** host -> webview */
export type HostToWebview =
  | { type: 'state'; status: PanelStatus; detail?: string }
  | { type: 'message'; message: ChatMessage }
  | { type: 'partial'; id: string; text: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id?: string; text: string };

/** webview -> host */
export type WebviewToHost =
  | { type: 'send'; text: string }
  | { type: 'cancel' }
  | { type: 'newConversation' }
  | { type: 'openTerminal'; prompt?: string }
  | { type: 'runDiagnostics' };

export type PanelStatus =
  | 'checking'
  | 'missing-cli'
  | 'onboarding'
  | 'ready'
  | 'running'
  | 'error'
  | 'handoff-recommended';
