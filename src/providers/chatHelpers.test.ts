import { describe, it, expect } from 'vitest';
import {
  isPermissionHelpQuestion,
  dedupeConversations,
  exportConversationMarkdown,
  buildPanelHtml,
} from './chatHelpers';
import type { ChatMessage } from '../shared/messages';

describe('isPermissionHelpQuestion', () => {
  it('fires when the question is about CalmUI/agy own approval behaviour', () => {
    expect(isPermissionHelpQuestion('How does agy handle file edit permissions?')).toBe(true);
    expect(isPermissionHelpQuestion('Do you ask for approval in this panel?')).toBe(true);
    expect(isPermissionHelpQuestion('What permissions does CalmUI need?')).toBe(true);
  });

  it('does NOT hijack generic permission questions (the old false positive)', () => {
    expect(isPermissionHelpQuestion('how do I set file permissions in Linux')).toBe(false);
    expect(isPermissionHelpQuestion('what chmod value gives read/write approval')).toBe(false);
    expect(isPermissionHelpQuestion('explain unix permission bits')).toBe(false);
  });

  it('does not fire on unrelated prompts', () => {
    expect(isPermissionHelpQuestion('refactor this function')).toBe(false);
    expect(isPermissionHelpQuestion('')).toBe(false);
  });
});

describe('dedupeConversations', () => {
  it('keeps the newest entry per id, most-recent-first', () => {
    const out = dedupeConversations([
      { id: 'a', updatedAt: 1 },
      { id: 'b', updatedAt: 5 },
      { id: 'a', updatedAt: 9 },
    ]);
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
    expect(out[0].updatedAt).toBe(9);
  });

  it('drops corrupt/non-object entries', () => {
    const raw = [null, { id: 42 }, { id: 'ok', updatedAt: 1 }] as unknown as {
      id: string;
      updatedAt: number;
    }[];
    const out = dedupeConversations(raw);
    expect(out.map((c) => c.id)).toEqual(['ok']);
  });

  it('handles an empty list', () => {
    expect(dedupeConversations([])).toEqual([]);
  });
});

describe('exportConversationMarkdown', () => {
  const msgs: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'hello' },
    { id: 'a1', role: 'assistant', text: 'hi there' },
    { id: 'a2', role: 'assistant', text: '   ' },
  ];

  it('renders a titled thread and skips empty messages', () => {
    const md = exportConversationMarkdown('My chat', msgs);
    expect(md).toContain('# My chat');
    expect(md).toContain('**You**');
    expect(md).toContain('hello');
    expect(md).toContain('**agy**');
    expect(md).toContain('hi there');
    // the blank assistant message is dropped
    expect(md.match(/\*\*agy\*\*/g)?.length).toBe(1);
  });

  it('falls back to a default title', () => {
    expect(exportConversationMarkdown('', msgs)).toContain('# CalmUI conversation');
  });
});

describe('buildPanelHtml', () => {
  it('embeds the nonce in both the CSP and the script tag', () => {
    const html = buildPanelHtml('https://x/webview.js', 'NONCE123', 'vscode-resource:');
    expect(html).toContain("script-src 'nonce-NONCE123'");
    expect(html).toContain('nonce="NONCE123"');
    expect(html).toContain('src="https://x/webview.js"');
  });

  it('locks down default-src and scopes styles/images to the cspSource', () => {
    const html = buildPanelHtml('s.js', 'n', 'CSP');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('style-src CSP');
    expect(html).toContain('img-src CSP data:');
  });
});
