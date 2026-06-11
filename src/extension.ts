import * as vscode from 'vscode';
import { AgyProcess } from './transport/AgyProcess';
import { ChatPanelProvider } from './providers/ChatPanelProvider';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('calmui-agy');
  const agyPath = config.get<string>('agyPath', 'agy');

  const transport = new AgyProcess(agyPath);
  const provider = new ChatPanelProvider(context, transport);

  context.subscriptions.push(
    transport,
    vscode.window.registerWebviewViewProvider('calmui-agy.chatView', provider),
    vscode.commands.registerCommand('calmui-agy.focusChat', () =>
      vscode.commands.executeCommand('calmui-agy.chatView.focus'),
    ),
    vscode.commands.registerCommand('calmui-agy.runDiagnostics', async () => {
      const a = await transport.checkAvailability(false);
      const msg = a.found
        ? `agy ${a.version ?? '(version unknown)'} found at ${a.resolvedPath}.`
        : a.detail ?? 'agy not found.';
      void vscode.window.showInformationMessage(`CalmUI Diagnostics: ${msg}`);
    }),
    vscode.commands.registerCommand('calmui-agy.openInTerminal', () =>
      transport.openInteractiveTerminal(),
    ),
  );
}

export function deactivate(): void {
  /* transport disposed via subscriptions */
}
