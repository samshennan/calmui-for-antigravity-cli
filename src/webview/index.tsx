import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { ChatMessage, HostToWebview, PanelStatus } from '../shared/messages';

declare const acquireVsCodeApi: () => { postMessage: (m: unknown) => void };
const vscodeApi = acquireVsCodeApi();

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
      {steps.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 3,
              background:
                i === 0
                  ? 'var(--vscode-button-background)'
                  : 'var(--vscode-input-background)',
              color:
                i === 0
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-descriptionForeground)',
              fontSize: 11,
              fontWeight: i === 0 ? 600 : 400,
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
                background:
                  i === 0
                    ? 'var(--vscode-button-foreground)'
                    : 'var(--vscode-input-border)',
                color:
                  i === 0
                    ? 'var(--vscode-button-background)'
                    : 'var(--vscode-descriptionForeground)',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {i + 1}
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
      ))}
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

function TranscriptView({ messages }: { messages: ChatMessage[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {messages.map((m) => (
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
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {m.text}
            {m.pending && !m.text ? (
              <span style={{ opacity: 0.5 }}>thinking…</span>
            ) : m.pending ? (
              <span style={{ opacity: 0.5 }}> ▋</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadyPanel({
  messages,
  input,
  setInput,
  onSend,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      {messages.length === 0 ? (
        <p style={{ ...S.muted, margin: 0 }}>Send a prompt to get started.</p>
      ) : (
        <TranscriptView messages={messages} />
      )}
      <PromptBox input={input} setInput={setInput} onSend={onSend} />
    </>
  );
}

function RunningPanel({
  messages,
  input,
}: {
  messages: ChatMessage[];
  input: string;
}) {
  return (
    <>
      <TranscriptView messages={messages} />
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
  input,
  setInput,
  onSend,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      {messages.length > 0 && <TranscriptView messages={messages} />}
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
  input,
  setInput,
  onSend,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      {messages.length > 0 && <TranscriptView messages={messages} />}
      <div style={S.card}>
        <div style={{ fontSize: 12 }}>
          <strong>This looks like a longer task.</strong> For best results, continue in the
          full Antigravity terminal where agy can take multi-step actions.
        </div>
        <div style={S.row}>
          <OpenTerminalBtn input={input} />
          <button
            style={S.btn(false)}
            onClick={() => vscodeApi.postMessage({ type: 'newConversation' })}
          >
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
        setMessages((prev) => [
          ...prev,
          { id: `e${Date.now()}`, role: 'assistant' as const, text: `⚠ ${m.text}` },
        ]);
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
          input={input}
          setInput={setInput}
          onSend={send}
        />
      );
      break;
    case 'running':
      panel = <RunningPanel messages={messages} input={input} />;
      break;
    case 'error':
      panel = (
        <ErrorPanel
          messages={messages}
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
          input={input}
          setInput={setInput}
          onSend={send}
        />
      );
      break;
    default:
      panel = <CheckingPanel />;
  }

  return <main style={S.root}>{panel}</main>;
}

createRoot(document.getElementById('root')!).render(<App />);
