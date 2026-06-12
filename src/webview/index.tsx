import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { marked } from 'marked';
import type { ChatMessage, HostToWebview, PanelStatus } from '../shared/messages';

declare const acquireVsCodeApi: () => { postMessage: (m: unknown) => void };
const vscodeApi = acquireVsCodeApi();

// ─── marked configuration ────────────────────────────────────────────────────

marked.setOptions({ breaks: true, gfm: true });

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text: string): string {
  return marked.parse(escapeHtml(text), { breaks: true, gfm: true }) as string;
}

// ─── shared style tokens ────────────────────────────────────────────────────

const S = {
  root: {
    fontFamily: 'var(--vscode-font-family)',
    fontSize: 13,
    color: 'var(--vscode-foreground)',
    padding: '12px 14px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
    minHeight: '100vh',
    boxSizing: 'border-box' as const,
  },
  muted: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: 12,
  },
  hero: {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.3px',
    margin: 0,
  },
  btn: (primary = true) => ({
    background: primary
      ? 'var(--vscode-button-background)'
      : 'var(--vscode-button-secondaryBackground, var(--vscode-input-background))',
    color: primary
      ? 'var(--vscode-button-foreground)'
      : 'var(--vscode-button-secondaryForeground, var(--vscode-foreground))',
    border: primary ? 'none' : '1px solid var(--vscode-input-border)',
    borderRadius: 3,
    padding: '5px 10px',
    fontSize: 12,
    cursor: 'pointer',
    lineHeight: 1.5,
  }),
  card: {
    background: 'var(--vscode-editor-inactiveSelectionBackground, var(--vscode-input-background))',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 4,
    padding: '10px 12px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 3,
    padding: '6px 8px',
    fontSize: 13,
    fontFamily: 'var(--vscode-font-family)',
    resize: 'vertical' as const,
    outline: 'none',
  },
  row: {
    display: 'flex' as const,
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  divider: {
    borderTop: '1px solid var(--vscode-input-border)',
    margin: '4px 0',
  },
};

// ─── markdown styles injected once ──────────────────────────────────────────

const MARKDOWN_CSS = `
.calm-md p { margin: 0 0 6px 0; }
.calm-md p:last-child { margin-bottom: 0; }
.calm-md ul, .calm-md ol { margin: 0 0 6px 0; padding-left: 18px; }
.calm-md li { margin-bottom: 2px; line-height: 1.5; }
.calm-md code {
  font-family: var(--vscode-editor-font-family, monospace);
  background: var(--vscode-textCodeBlock-background, var(--vscode-input-background));
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.calm-md pre {
  font-family: var(--vscode-editor-font-family, monospace);
  background: var(--vscode-textCodeBlock-background, var(--vscode-input-background));
  padding: 8px 10px;
  border-radius: 3px;
  overflow-x: auto;
  margin: 0 0 6px 0;
  font-size: 12px;
}
.calm-md pre code {
  padding: 0;
  background: transparent;
}
.calm-md a {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}
.calm-md a:hover { text-decoration: underline; }
.calm-md blockquote {
  margin: 0 0 6px 0;
  padding: 2px 0 2px 10px;
  border-left: 3px solid var(--vscode-input-border);
  color: var(--vscode-descriptionForeground);
}
.calm-md h1, .calm-md h2, .calm-md h3, .calm-md h4 {
  margin: 6px 0 4px 0;
  font-weight: 600;
}
`;

function MarkdownStyles() {
  return <style>{MARKDOWN_CSS}</style>;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function HeroTitle() {
  return <h1 style={S.hero}>CalmUI</h1>;
}

function OpenTerminalBtn({ input }: { input: string }) {
  return (
    <button
      style={S.btn(false)}
      onClick={() => vscodeApi.postMessage({ type: 'openTerminal', prompt: input || undefined })}
    >
      Open in Terminal
    </button>
  );
}

function PromptBox({
  input,
  setInput,
  onSend,
  disabled,
  hint,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={3}
        style={S.textarea}
        placeholder={hint ?? 'Ask agy a quick question… (Enter to send)'}
        disabled={disabled}
      />
      <div style={S.row}>
        <button style={S.btn(true)} onClick={onSend} disabled={disabled || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

function SetupStrip() {
  const steps = ['Install agy', 'Sign in', 'Ask anything'];
  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
      {steps.map((label, i) => {
        const isActive = i === 2;
        const isDone = i < 2;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
                borderRadius: 3,
                background: isActive
                  ? 'var(--vscode-button-background)'
                  : 'var(--vscode-input-background)',
                color: isActive
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-descriptionForeground)',
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                border: '1px solid var(--vscode-input-border)',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: isActive
                    ? 'var(--vscode-button-foreground)'
                    : isDone
                    ? 'var(--vscode-button-background)'
                    : 'var(--vscode-input-border)',
                  color: isActive
                    ? 'var(--vscode-button-background)'
                    : isDone
                    ? 'var(--vscode-button-foreground)'
                    : 'var(--vscode-descriptionForeground)',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {isDone ? '✓' : i + 1}
              </span>
              {label}
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  width: 16,
                  height: 1,
                  background: 'var(--vscode-input-border)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── state panels ────────────────────────────────────────────────────────────

function MissingCLIPanel({ input }: { input: string }) {
  return (
    <>
      <HeroTitle />
      <p style={{ ...S.muted, margin: 0 }}>
        <strong style={{ color: 'var(--vscode-foreground)' }}>agy not found.</strong>{' '}
        Install the Antigravity CLI to get started.
      </p>
      <div style={S.card}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Install steps</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
          <li>Download and install the Antigravity CLI (<code>agy</code>)</li>
          <li>Ensure <code>agy</code> is on your <code>PATH</code></li>
          <li>Fully quit and reopen VS Code</li>
        </ol>
        <p style={{ ...S.muted, margin: 0, fontStyle: 'italic' }}>
          After installing: fully quit and reopen the editor.
        </p>
      </div>
      <div style={S.row}>
        <button
          style={S.btn(true)}
          onClick={() => vscodeApi.postMessage({ type: 'runDiagnostics' })}
        >
          Run Diagnostics
        </button>
        <OpenTerminalBtn input={input} />
      </div>
    </>
  );
}

function OnboardingPanel({
  input,
  setInput,
  onSend,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      <HeroTitle />
      <p style={{ ...S.muted, margin: 0 }}>
        Best for quick asks — fire a question and get an answer without leaving your editor.
      </p>
      <SetupStrip />
      <div style={S.card}>
        <div style={{ fontSize: 12 }}>
          <strong>For full agent sessions</strong>, open the Antigravity terminal.
        </div>
        <div>
          <OpenTerminalBtn input={input} />
        </div>
      </div>
      <div style={S.divider} />
      <PromptBox
        input={input}
        setInput={setInput}
        onSend={onSend}
        hint="Ask a quick question… (Enter to send)"
      />
    </>
  );
}

function TranscriptView({
  messages,
  errorIds,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {messages.map((m) => {
        const isError = errorIds.has(m.id);
        return (
          <div
            key={m.id}
            style={{
              background:
                m.role === 'user'
                  ? 'var(--vscode-input-background)'
                  : 'transparent',
              border:
                m.role === 'user'
                  ? '1px solid var(--vscode-input-border)'
                  : 'none',
              borderRadius: 3,
              padding: m.role === 'user' ? '6px 8px' : '2px 0',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--vscode-descriptionForeground)',
                marginBottom: 3,
              }}
            >
              {m.role === 'user' ? 'You' : 'agy'}
            </div>
            {m.role === 'user' || isError ? (
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {m.text}
              </div>
            ) : m.pending && !m.text ? (
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ opacity: 0.5 }}>thinking…</span>
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <div
                  className='calm-md'
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
                />
                {m.pending && <span style={{ opacity: 0.5 }}>▋</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReadyPanel({
  messages,
  errorIds,
  input,
  setInput,
  onSend,
  onNewConversation,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onNewConversation: () => void;
}) {
  return (
    <>
      {messages.length === 0 ? (
        <p style={{ ...S.muted, margin: 0 }}>Send a prompt to get started.</p>
      ) : (
        <>
          <TranscriptView messages={messages} errorIds={errorIds} />
          <div style={S.row}>
            <button style={S.btn(false)} onClick={onNewConversation}>
              New conversation
            </button>
          </div>
        </>
      )}
      <PromptBox input={input} setInput={setInput} onSend={onSend} />
    </>
  );
}

function RunningPanel({
  messages,
  errorIds,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
}) {
  return (
    <>
      <TranscriptView messages={messages} errorIds={errorIds} />
      <div style={S.row}>
        <span style={S.muted}>Running…</span>
        <button
          style={S.btn(false)}
          onClick={() => vscodeApi.postMessage({ type: 'cancel' })}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function ErrorPanel({
  messages,
  errorIds,
  input,
  setInput,
  onSend,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      {messages.length > 0 && <TranscriptView messages={messages} errorIds={errorIds} />}
      <div style={S.card}>
        <div style={{ fontSize: 12, color: 'var(--vscode-errorForeground, #f48771)' }}>
          Something went wrong. You can retry here or continue in the full Antigravity terminal.
        </div>
        <div style={S.row}>
          <button
            style={S.btn(true)}
            onClick={() => vscodeApi.postMessage({ type: 'runDiagnostics' })}
          >
            Run Diagnostics
          </button>
          <OpenTerminalBtn input={input} />
        </div>
      </div>
      <PromptBox input={input} setInput={setInput} onSend={onSend} hint="Try again…" />
    </>
  );
}

function HandoffPanel({
  messages,
  errorIds,
  input,
  setInput,
  onSend,
  onNewConversation,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onNewConversation: () => void;
}) {
  return (
    <>
      {messages.length > 0 && <TranscriptView messages={messages} errorIds={errorIds} />}
      <div style={S.card}>
        <div style={{ fontSize: 12 }}>
          <strong>This looks like a longer task.</strong> For best results, continue in the
          full Antigravity terminal where agy can take multi-step actions.
        </div>
        <div style={S.row}>
          <OpenTerminalBtn input={input} />
          <button style={S.btn(false)} onClick={onNewConversation}>
            New conversation
          </button>
        </div>
      </div>
      <PromptBox
        input={input}
        setInput={setInput}
        onSend={onSend}
        hint="Or ask a quick follow-up…"
      />
    </>
  );
}

function CheckingPanel() {
  return <p style={S.muted}>Checking for agy…</p>;
}

// ─── root app ────────────────────────────────────────────────────────────────

function App() {
  const [status, setStatus] = useState<PanelStatus>('checking');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');

  useEffect(() => {
    const onMsg = (e: MessageEvent<HostToWebview>) => {
      const m = e.data;
      if (m.type === 'state') {
        setStatus(m.status);
      } else if (m.type === 'message') {
        setMessages((prev) => [...prev, m.message]);
      } else if (m.type === 'partial') {
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, text: m.text } : x)),
        );
      } else if (m.type === 'done') {
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, pending: false } : x)),
        );
      } else if (m.type === 'error') {
        if (m.id) {
          setMessages((prev) => {
            const exists = prev.some((x) => x.id === m.id);
            if (exists) {
              return prev.map((x) => {
                if (x.id !== m.id) return x;
                const warningText = x.text
                  ? `${x.text}\n⚠ ${m.text}`
                  : `⚠ ${m.text}`;
                return { ...x, pending: false, text: warningText };
              });
            }
            const newId = `e${Date.now()}`;
            setErrorIds((ids) => new Set(ids).add(newId));
            return [
              ...prev,
              { id: newId, role: 'assistant' as const, text: `⚠ ${m.text}` },
            ];
          });
          setErrorIds((ids) => new Set(ids).add(m.id!));
        } else {
          const newId = `e${Date.now()}`;
          setErrorIds((ids) => new Set(ids).add(newId));
          setMessages((prev) => [
            ...prev,
            { id: newId, role: 'assistant' as const, text: `⚠ ${m.text}` },
          ]);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: `u${Date.now()}`, role: 'user' as const, text },
    ]);
    vscodeApi.postMessage({ type: 'send', text });
    setInput('');
  };

  const newConversation = () => {
    setMessages([]);
    setErrorIds(new Set());
    vscodeApi.postMessage({ type: 'newConversation' });
  };

  let panel: React.ReactNode;
  switch (status) {
    case 'checking':
      panel = <CheckingPanel />;
      break;
    case 'missing-cli':
      panel = <MissingCLIPanel input={input} />;
      break;
    case 'onboarding':
      panel = (
        <OnboardingPanel input={input} setInput={setInput} onSend={send} />
      );
      break;
    case 'ready':
      panel = (
        <ReadyPanel
          messages={messages}
          errorIds={errorIds}
          input={input}
          setInput={setInput}
          onSend={send}
          onNewConversation={newConversation}
        />
      );
      break;
    case 'running':
      panel = <RunningPanel messages={messages} errorIds={errorIds} />;
      break;
    case 'error':
      panel = (
        <ErrorPanel
          messages={messages}
          errorIds={errorIds}
          input={input}
          setInput={setInput}
          onSend={send}
        />
      );
      break;
    case 'handoff-recommended':
      panel = (
        <HandoffPanel
          messages={messages}
          errorIds={errorIds}
          input={input}
          setInput={setInput}
          onSend={send}
          onNewConversation={newConversation}
        />
      );
      break;
    default:
      panel = <CheckingPanel />;
  }

  return (
    <main style={S.root}>
      <MarkdownStyles />
      {panel}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
