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

/** A past conversation the host has persisted (for the history list). */
export interface ConversationMeta {
  id: string;
  title: string;
  /** epoch ms of the last completed turn. */
  updatedAt: number;
}

/** A model the user can pick in the bottom bar. value '' = agy default. */
export interface ModelChoice {
  label: string;
  value: string;
}

/** host -> webview */
export type HostToWebview =
  | { type: 'state'; status: PanelStatus; detail?: string }
  | { type: 'message'; message: ChatMessage }
  | { type: 'partial'; id: string; text: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id?: string; text: string }
  /** Replace the whole transcript (conversation switch / new chat). */
  | { type: 'hydrate'; messages: ChatMessage[]; conversationId?: string }
  /** History list, most recent first. */
  | { type: 'conversations'; items: ConversationMeta[] }
  /** Available models + the currently active value ('' = default). */
  | { type: 'models'; items: ModelChoice[]; current: string }
  /** Estimated context usage for the active conversation (token estimate). */
  | { type: 'usage'; usedTokens: number; maxTokens: number };

/** webview -> host */
export type WebviewToHost =
  /** Sent once the webview script has attached its message listener.
   *  The host replies with the boot bundle (models/conversations/hydrate/usage)
   *  — posting earlier would race the script load and get dropped. */
  | { type: 'webviewReady' }
  | { type: 'send'; text: string }
  | { type: 'cancel' }
  | { type: 'newConversation' }
  | { type: 'switchConversation'; id: string }
  | { type: 'listConversations' }
  | { type: 'setModel'; model: string }
  | { type: 'openSettings' }
  | { type: 'openTerminal'; prompt?: string }
  | { type: 'runDiagnostics' }
  /** Re-send the last user prompt after a failed/empty turn. */
  | { type: 'retry' }
  /** Copy the active conversation to the clipboard as Markdown. */
  | { type: 'exportConversation' };

export type PanelStatus =
  | 'checking'
  | 'missing-cli'
  | 'onboarding'
  | 'ready'
  | 'running'
  | 'error'
  | 'handoff-recommended';
