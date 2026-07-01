/**
 * Pure helpers for ChatPanelProvider — free of `vscode` so the risky logic
 * (permission-help detection, conversation de-dup, HTML/CSP, export) is
 * unit-tested in chatHelpers.test.ts without instantiating the extension host.
 */
import type { ChatMessage } from '../shared/messages';

/**
 * True only when the user is asking about CalmUI/agy's OWN approval behaviour,
 * so we can answer with the built-in permission explainer instead of sending
 * the prompt to agy.
 *
 * Tightened (v0.4.0): the old heuristic fired on any "permission" + "how/what"
 * text, hijacking legitimate questions like "how do I set file permissions in
 * Linux". Now it also requires a self-reference to CalmUI/agy/the panel, so
 * generic permission questions flow through to the model.
 */
export function isPermissionHelpQuestion(text: string): boolean {
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
    q.includes('do you') ||
    q.includes('does');

  // Must be about *this tool*, not permissions in general.
  const aboutThisTool =
    q.includes('calmui') ||
    q.includes('agy') ||
    q.includes('this panel') ||
    q.includes('the panel') ||
    q.includes('side panel') ||
    q.includes('sidebar') ||
    q.includes('you ') ||
    q.startsWith('you') ||
    q.includes('this extension');

  return asksAboutPermission && asksHow && aboutThisTool;
}

/**
 * De-dup persisted conversations by id, keeping the newest `updatedAt`, sorted
 * most-recent-first. Corrupted/legacy state may hold duplicates or non-objects.
 */
export function dedupeConversations<T extends { id: string; updatedAt: number }>(
  raw: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const c of raw) {
    if (!c || typeof c.id !== 'string') continue;
    const prev = byId.get(c.id);
    if (!prev || c.updatedAt > prev.updatedAt) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Render a conversation to Markdown for export/clipboard. */
export function exportConversationMarkdown(
  title: string,
  messages: readonly ChatMessage[],
): string {
  const header = `# ${title || 'CalmUI conversation'}\n`;
  const body = messages
    .filter((m) => m.text.trim() !== '')
    .map((m) => {
      const who = m.role === 'user' ? '**You**' : '**agy**';
      return `${who}\n\n${m.text.trim()}`;
    })
    .join('\n\n---\n\n');
  return `${header}\n${body}\n`;
}

/**
 * Build the webview HTML with a strict CSP. The nonce MUST be unpredictable
 * (crypto random, not Date.now()) and resource roots are restricted by the
 * caller to dist/+media/.
 */
export function buildPanelHtml(
  scriptUri: string,
  nonce: string,
  cspSource: string,
): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CalmUI</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
