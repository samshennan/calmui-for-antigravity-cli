import * as vscode from 'vscode';
import type { AgyTransport } from '../transport/AgyTransport';
import type { ChatMessage, ConversationMeta, HostToWebview, ModelChoice, WebviewToHost } from '../shared/messages';

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
  private modelChoices: ModelChoice[] = MODEL_CHOICES;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly transport: AgyTransport,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
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
        const assistantId = `a${++this.turn}`;
        const userId = `u${this.turn}`;

        // Push user message into host mirror immediately.
        const userMsg: ChatMessage = { id: userId, role: 'user', text: m.text };
        this.messages.push(userMsg);
        this.post({ type: 'message', message: userMsg });

        if (this.isPermissionHelpQuestion(m.text)) {
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

        this.post({
          type: 'message',
          message: { id: assistantId, role: 'assistant', text: '', pending: true },
        });
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
        };

        try {
          const res = await this.transport.sendPrompt(m.text, opts, (clean) =>
            this.post({ type: 'partial', id: assistantId, text: clean }),
          );

          if (res.conversationId) {
            this.conversationId = res.conversationId;
          }

          // Empty-response guard: treat as error.
          if (res.text.trim() === '') {
            const errText =
              "agy returned an empty response. If you selected a model, it may be unavailable — try 'Default (agy)'.";
            const errMsg: ChatMessage = { id: assistantId, role: 'assistant', text: errText };
            this.messages.push(errMsg);
            this.post({ type: 'error', id: assistantId, text: errText });
            this.post({ type: 'state', status: 'handoff-recommended' });
            this.post(this.usageMessage());
            // Don't persist: the assistant side was an error with no real content.
            break;
          }

          const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', text: res.text };
          this.messages.push(assistantMsg);

          this.post({ type: 'partial', id: assistantId, text: res.text });
          this.post({ type: 'done', id: assistantId });
          this.post({ type: 'state', status: 'ready' });

          if (this.conversationId) {
            this.persistConversation(m.text);
            this.post({ type: 'conversations', items: this.loadMetas() });
          }
          this.post(this.usageMessage());
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          const isAlreadyFriendly =
            raw.startsWith('CalmUI:') || raw.includes('node-pty');
          const text = isAlreadyFriendly
            ? raw
            : `agy failed: ${raw}. Run Diagnostics for details, or continue in the terminal.`;
          const errMsg: ChatMessage = { id: assistantId, role: 'assistant', text };
          this.messages.push(errMsg);
          this.post({ type: 'error', id: assistantId, text });
          this.post({ type: 'state', status: 'handoff-recommended' });
          this.post(this.usageMessage());
        }
        break;
      }
      case 'cancel':
        this.transport.cancel();
        this.post({ type: 'state', status: 'ready' });
        break;
      case 'openTerminal':
        this.transport.openInteractiveTerminal(m.prompt);
        break;
      case 'newConversation':
        this.conversationId = undefined;
        this.messages = [];
        this.post({ type: 'hydrate', messages: [] });
        this.post(this.usageMessage());
        void this.refreshState();
        break;
      case 'switchConversation': {
        const stored = this.loadAll().find((c) => c.id === m.id);
        if (stored) {
          this.conversationId = stored.id;
          this.messages = [...stored.messages];
          this.post({ type: 'hydrate', messages: [...stored.messages], conversationId: stored.id });
          this.post(this.usageMessage());
          this.post({ type: 'state', status: 'ready' });
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
    return this.context.workspaceState.get<StoredConversation[]>(CONV_STORE_KEY, []);
  }

  private loadMetas(): ConversationMeta[] {
    return this.loadAll().map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  private persistConversation(firstPrompt: string): void {
    if (!this.conversationId) return;

    const all = this.loadAll().filter((c) => c.id !== this.conversationId);
    const existing = this.loadAll().find((c) => c.id === this.conversationId);
    const title = existing?.title ?? firstPrompt.slice(0, 60);

    const updated: StoredConversation = {
      id: this.conversationId,
      title,
      updatedAt: Date.now(),
      messages: [...this.messages],
    };

    // Most-recent-first, capped at MAX_CONVERSATIONS.
    const next = [updated, ...all].slice(0, MAX_CONVERSATIONS);
    void this.context.workspaceState.update(CONV_STORE_KEY, next);
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

  private isPermissionHelpQuestion(text: string): boolean {
    const q = text.toLowerCase();
    const asksAboutPermission =
      q.includes('permission') ||
      q.includes('approve') ||
      q.includes('approval') ||
      q.includes('accept edit') ||
      q.includes('file edit') ||
      q.includes('take actions on my files');
    const asksHow =
      q.includes('how') ||
      q.includes('what') ||
      q.includes('does agy') ||
      q.includes('do you ask');
    return asksAboutPermission && asksHow;
  }

  // ---------------------------------------------------------------------------

  private post(msg: HostToWebview): void {
    void this.view?.webview.postMessage(msg);
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const nonce = String(Date.now());
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CalmUI</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
  }
}
