import * as vscode from 'vscode';
import { AgyProcess } from './transport/AgyProcess';
import { ChatPanelProvider } from './providers/ChatPanelProvider';
import { runDiagnostics } from './diagnostics';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('calmui-agy');
  const agyPath = config.get<string>('agyPath', 'agy');

  const output = vscode.window.createOutputChannel('CalmUI');
  const log = (line: string) => output.appendLine(line);

  const transport = new AgyProcess(agyPath, log);
  const provider = new ChatPanelProvider(context, transport, log);

  context.subscriptions.push(
    output,
    transport,
    vscode.window.registerWebviewViewProvider('calmui-agy.chatView', provider),
    vscode.commands.registerCommand('calmui-agy.focusChat', () =>
      vscode.commands.executeCommand('calmui-agy.chatView.focus'),
    ),
    vscode.commands.registerCommand('calmui-agy.runDiagnostics', () =>
      runDiagnostics(transport, agyPath),
    ),
    vscode.commands.registerCommand('calmui-agy.openInTerminal', (prompt?: string) =>
      transport.openInteractiveTerminal(prompt),
    ),
  );
}

export function deactivate(): void {
  /* transport disposed via subscriptions */
}
