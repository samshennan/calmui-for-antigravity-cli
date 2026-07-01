import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { AgyTransport } from '../transport/AgyTransport';
import type { ChatMessage, ConversationMeta, HostToWebview, ModelChoice, WebviewToHost } from '../shared/messages';
import {
  isPermissionHelpQuestion,
  exportConversationMarkdown,
  dedupeConversations,
  buildPanelHtml,
} from './chatHelpers';

const CONV_STORE_KEY = 'calmui.conversations';
const MAX_CONVERSATIONS = 50;
const MAX_CONTEXT_TOKENS = 1048576;
const PERMISSION_HELP =
  'CalmUI does not ask for file-edit or command-run permissions inside the side panel. ' +
  'The panel is a quick-ask surface over `agy -p`: it can answer questions, but it does not drive agy approval cards, does not edit files, and never passes `--dangerously-skip-permissions`.\n\n' +
  'When you need edits, commands, or agy approval prompts, use the terminal handoff button. It opens an Antigravity terminal with `agy` prefilled; you press Enter there, then agy owns the normal terminal approval flow.';

const MODEL_CHOICES: ModelChoice[] = [
  { label: 'Default (agy)', value: '' },
  { label: 'Gemini 3.5 Flash · Low', value: 'gemini-3.5-flash-low' },
  { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
  { label: 'Gemini 3.5 Flash · High', value: 'gemini-3.5-flash-high' },
  { label: 'Gemini 3.1 Pro', value: 'gemini-3.1-pro' },
];

interface StoredConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private turn = 0;
  /** The agy conversation ID for the current thread; undefined = fresh. */
  private conversationId: string | undefined;
  /** Host-side mirror of the active transcript. */
  private messages: ChatMessage[] = [];
  /** The turn number of the in-flight prompt, or null when idle. Used as a
   *  single-flight guard and to discard a cancelled/superseded completion. */
  private runningTurn: number | null = null;
  private modelChoices: ModelChoice[] = MODEL_CHOICES;
  /** True once this panel thread has completed at least one turn. Drives the
   *  `-c/--continue` fallback so multi-turn survives a missing conversation id. */
  private threadHasTurns = false;
  /** The user text of the last turn, for the "Retry" affordance. */
  private lastPrompt: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly transport: AgyTransport,
    private readonly log?: (line: string) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      // Restrict what the webview can load to exactly what it needs.
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((m: WebviewToHost) => {
      void this.handle(m);
    });

    // The boot bundle is sent when the webview posts 'webviewReady' —
    // posting here would race the script load and the messages get dropped.
  }

  private async refreshState(): Promise<void> {
    this.post({ type: 'state', status: 'checking' });
    const a = await this.transport.checkAvailability(false);
    if (!a.found) {
      this.post({ type: 'state', status: 'missing-cli', detail: a.detail });
    } else if (this.runningTurn !== null) {
      // A prompt is still in flight (e.g. the webview reloaded mid-stream) —
      // keep the running UI so the eventual completion lands correctly.
      this.post({ type: 'state', status: 'running' });
    } else if (this.messages.length === 0) {
      this.post({ type: 'state', status: 'onboarding', detail: a.version });
    } else {
      this.post({ type: 'state', status: 'ready', detail: a.version });
    }
  }

  private async handle(m: WebviewToHost): Promise<void> {
    switch (m.type) {
      case 'webviewReady':
        this.post(this.modelsMessage());
        void this.refreshModels();
        this.post({ type: 'conversations', items: this.loadMetas() });
        this.post({
          type: 'hydrate',
          messages: [...this.messages],
          conversationId: this.conversationId,
        });
        this.post(this.usageMessage());
        void this.refreshState();
        break;
      case 'send': {
        // Single-flight: ignore a send while one is already running. The webview
        // guards this too, but a reloaded webview or a race could double-send,
        // which would orphan the first PTY and corrupt the transcript.
        if (this.runningTurn !== null) {
          break;
        }

        const assistantId = `a${++this.turn}`;
        const userId = `u${this.turn}`;
        const myTurn = this.turn;
        this.lastPrompt = m.text;

        // Push user message into host mirror immediately.
        const userMsg: ChatMessage = { id: userId, role: 'user', text: m.text };
        this.messages.push(userMsg);
        this.post({ type: 'message', message: userMsg });

        if (isPermissionHelpQuestion(m.text)) {
          const assistantMsg: ChatMessage = {
            id: assistantId,
            role: 'assistant',
            text: PERMISSION_HELP,
          };
          this.messages.push(assistantMsg);
          this.post({ type: 'message', message: assistantMsg });
          this.post({ type: 'state', status: 'handoff-recommended' });
          this.post(this.usageMessage());
          break;
        }

        // Store the pending placeholder in the mirror so a mid-stream reload
        // (webviewReady) rehydrates it and the eventual completion lands by id.
        const placeholder: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          text: '',
          pending: true,
        };
        this.messages.push(placeholder);
        this.post({ type: 'message', message: { ...placeholder } });
        this.runningTurn = myTurn;
        this.post({ type: 'state', status: 'running' });

        const cfg = vscode.workspace.getConfiguration('calmui-agy');
        const model = cfg.get<string>('model', '');
        const opts = {
          ...(model ? { model } : {}),
          printTimeoutSeconds: cfg.get<number>('printTimeoutSeconds', 120),
          ...(cfg.get<string[]>('includeDirectories', []).length
            ? { includeDirectories: cfg.get<string[]>('includeDirectories', []) }
            : {}),
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          conversationId: this.conversationId,
          // When we have no captured id but the thread already had a turn,
          // continue the most-recent agy conversation instead of resetting.
          continue: this.conversationId === undefined && this.threadHasTurns,
        };

        try {
          const res = await this.transport.sendPrompt(m.text, opts, (clean) => {
            if (this.runningTurn === myTurn) {
              this.post({ type: 'partial', id: assistantId, text: clean });
            }
          });

          // The turn was cancelled or superseded while awaiting — discard it.
          // cancel() has already settled the placeholder and posted state.
          if (this.runningTurn !== myTurn) {
            break;
          }
          this.runningTurn = null;

          if (res.conversationId) {
            this.conversationId = res.conversationId;
          }

          // Empty-response guard: treat as error.
          if (res.text.trim() === '') {
            const errText =
              "agy returned an empty response. If you selected a model, it may be unavailable — try 'Default (agy)'.";
            placeholder.text = errText;
            placeholder.pending = false;
            this.post({ type: 'error', id: assistantId, text: errText });
            this.post({ type: 'state', status: 'handoff-recommended' });
            this.post(this.usageMessage());
            // Don't persist: the assistant side was an error with no real content.
            break;
          }

          placeholder.text = res.text;
          placeholder.pending = false;
          // A real turn completed — subsequent turns should continue the thread.
          this.threadHasTurns = true;

          this.post({ type: 'partial', id: assistantId, text: res.text });
          this.post({ type: 'done', id: assistantId });
          this.post({ type: 'state', status: 'ready' });

          if (this.conversationId) {
            await this.persistConversation(m.text);
            this.post({ type: 'conversations', items: this.loadMetas() });
          }
          this.post(this.usageMessage());
        } catch (err) {
          // Ignore the failure if the turn was cancelled/superseded mid-flight.
          if (this.runningTurn !== myTurn) {
            break;
          }
          this.runningTurn = null;
          const raw = err instanceof Error ? err.message : String(err);
          const isAlreadyFriendly =
            raw.startsWith('CalmUI:') || raw.includes('node-pty');
          const text = isAlreadyFriendly
            ? raw
            : `agy failed: ${raw}. Run Diagnostics for details, or continue in the terminal.`;
          placeholder.text = text;
          placeholder.pending = false;
          this.post({ type: 'error', id: assistantId, text });
          this.post({ type: 'state', status: 'handoff-recommended' });
          this.post(this.usageMessage());
        }
        break;
      }
      case 'cancel': {
        this.transport.cancel();
        // Settle the in-flight placeholder so the spinner stops; the awaited
        // sendPrompt will resolve later but is discarded (runningTurn cleared).
        if (this.runningTurn !== null) {
          const ph = [...this.messages]
            .reverse()
            .find((x) => x.role === 'assistant' && x.pending);
          if (ph) {
            ph.text = ph.text || '_Response cancelled._';
            ph.pending = false;
            this.post({ type: 'partial', id: ph.id, text: ph.text });
            this.post({ type: 'done', id: ph.id });
          }
          this.runningTurn = null;
        }
        this.post({ type: 'state', status: 'ready' });
        this.post(this.usageMessage());
        break;
      }
      case 'openTerminal':
        this.transport.openInteractiveTerminal(m.prompt);
        break;
      case 'newConversation':
        this.conversationId = undefined;
        this.messages = [];
        this.threadHasTurns = false;
        this.lastPrompt = undefined;
        this.post({ type: 'hydrate', messages: [] });
        this.post(this.usageMessage());
        void this.refreshState();
        break;
      case 'switchConversation': {
        const stored = this.loadAll().find((c) => c.id === m.id);
        if (stored) {
          this.conversationId = stored.id;
          this.messages = [...stored.messages];
          this.threadHasTurns = stored.messages.some((x) => x.role === 'assistant');
          this.post({ type: 'hydrate', messages: [...stored.messages], conversationId: stored.id });
          this.post(this.usageMessage());
          this.post({ type: 'state', status: 'ready' });
        }
        break;
      }
      case 'retry': {
        // Re-send the last user prompt after a failed/empty turn. Drop the
        // failed assistant placeholder(s) from the tail so the retry is clean.
        if (this.runningTurn !== null || !this.lastPrompt) break;
        while (
          this.messages.length &&
          this.messages[this.messages.length - 1].role === 'assistant'
        ) {
          this.messages.pop();
        }
        // Also drop the trailing user message; the send handler re-adds it.
        if (
          this.messages.length &&
          this.messages[this.messages.length - 1].role === 'user'
        ) {
          this.messages.pop();
        }
        this.post({ type: 'hydrate', messages: [...this.messages], conversationId: this.conversationId });
        void this.handle({ type: 'send', text: this.lastPrompt });
        break;
      }
      case 'exportConversation': {
        const title =
          this.loadAll().find((c) => c.id === this.conversationId)?.title ??
          this.messages.find((x) => x.role === 'user')?.text?.slice(0, 60) ??
          'CalmUI conversation';
        const md = exportConversationMarkdown(title, this.messages);
        try {
          await vscode.env.clipboard.writeText(md);
          void vscode.window.showInformationMessage(
            'CalmUI: conversation copied to clipboard as Markdown.',
          );
        } catch (e) {
          this.log?.(`[EXPORT] failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        break;
      }
      case 'listConversations':
        this.post({ type: 'conversations', items: this.loadMetas() });
        break;
      case 'setModel': {
        const cfg = vscode.workspace.getConfiguration('calmui-agy');
        const target = vscode.workspace.workspaceFolders
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
        try {
          await cfg.update('model', m.model || undefined, target);
        } catch {
          // best-effort; carry on
        }
        this.post(this.modelsMessage());
        break;
      }
      case 'openSettings':
        void vscode.commands.executeCommand('workbench.action.openSettings', 'calmui-agy');
        break;
      case 'runDiagnostics':
        void vscode.commands.executeCommand('calmui-agy.runDiagnostics');
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  private loadAll(): StoredConversation[] {
    const raw = this.context.workspaceState.get<StoredConversation[]>(CONV_STORE_KEY, []);
    return dedupeConversations(raw);
  }

  private loadMetas(): ConversationMeta[] {
    return this.loadAll().map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  private async persistConversation(firstPrompt: string): Promise<void> {
    if (!this.conversationId) return;

    const all = this.loadAll();
    const existing = all.find((c) => c.id === this.conversationId);
    const rest = all.filter((c) => c.id !== this.conversationId);
    const title = existing?.title ?? (firstPrompt.slice(0, 60) || 'Untitled');

    const updated: StoredConversation = {
      id: this.conversationId,
      title,
      updatedAt: Date.now(),
      messages: [...this.messages],
    };

    // Most-recent-first, capped at MAX_CONVERSATIONS.
    const next = [updated, ...rest].slice(0, MAX_CONVERSATIONS);
    try {
      await this.context.workspaceState.update(CONV_STORE_KEY, next);
    } catch (e) {
      console.error('CalmUI: failed to persist conversation history', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Usage / models helpers
  // ---------------------------------------------------------------------------

  private usageMessage(): HostToWebview & { type: 'usage' } {
    const chars = this.messages.reduce((sum, msg) => sum + msg.text.length, 0);
    return { type: 'usage', usedTokens: Math.round(chars / 4), maxTokens: MAX_CONTEXT_TOKENS };
  }

  private modelsMessage(): HostToWebview & { type: 'models' } {
    const current = vscode.workspace.getConfiguration('calmui-agy').get<string>('model', '') ?? '';
    return { type: 'models', items: this.modelChoices, current };
  }

  private async refreshModels(): Promise<void> {
    const models = await this.transport.listModels().catch(() => []);
    if (models.length === 0) return;
    this.modelChoices = [
      { label: 'Default (agy)', value: '' },
      ...models.map((m) => ({ label: m.label, value: m.value })),
    ];
    this.post(this.modelsMessage());
  }

  // ---------------------------------------------------------------------------

  private post(msg: HostToWebview): void {
    void this.view?.webview.postMessage(msg);
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    // Unpredictable per-render nonce (not Date.now(), which is guessable).
    const nonce = crypto.randomBytes(16).toString('base64');
    return buildPanelHtml(String(script), nonce, webview.cspSource);
  }
}
