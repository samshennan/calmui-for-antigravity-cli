import * as vscode from 'vscode';
import type { AgyTransport } from '../transport/AgyTransport';
import type { WebviewToHost, HostToWebview } from '../shared/messages';

/**
 * Webview view provider for the CalmUI panel.
 *
 * STATUS: scaffold. Wires the webview <-> transport message bridge and renders
 * the bundled webview. The actual UI states (onboarding, running, handoff card)
 * are built in Phases 1–3 — see .planning/2026-06-11-build-plan.md.
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private turn = 0;

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

    void this.refreshState();
  }

  private async refreshState(): Promise<void> {
    this.post({ type: 'state', status: 'checking' });
    const a = await this.transport.checkAvailability(false);
    this.post(
      a.found
        ? { type: 'state', status: 'ready', detail: a.version }
        : { type: 'state', status: 'missing-cli', detail: a.detail },
    );
  }

  private async handle(m: WebviewToHost): Promise<void> {
    switch (m.type) {
      case 'send': {
        const id = `a${++this.turn}`;
        this.post({
          type: 'message',
          message: { id, role: 'assistant', text: '', pending: true },
        });
        this.post({ type: 'state', status: 'running' });
        try {
          const res = await this.transport.sendPrompt(m.text, {}, (clean) =>
            this.post({ type: 'partial', id, text: clean }),
          );
          this.post({ type: 'partial', id, text: res.text });
          this.post({ type: 'done', id });
          this.post({ type: 'state', status: 'ready' });
        } catch (err) {
          this.post({
            type: 'error',
            id,
            text: err instanceof Error ? err.message : String(err),
          });
          this.post({ type: 'state', status: 'handoff-recommended' });
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
        void this.refreshState();
        break;
      case 'runDiagnostics':
        void vscode.commands.executeCommand('calmui-agy.runDiagnostics');
        break;
    }
  }

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
