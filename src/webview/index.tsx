import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { marked } from 'marked';
import type { ChatMessage, ConversationMeta, HostToWebview, ModelChoice, PanelStatus } from '../shared/messages';

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
    padding: '0',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minHeight: '100vh',
    boxSizing: 'border-box' as const,
  },
  scrollArea: {
    padding: '12px 14px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
    flex: 1,
    overflowY: 'auto' as const,
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

// ─── icon button ─────────────────────────────────────────────────────────────

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type='button'
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 4,
        cursor: 'pointer',
        color: 'var(--vscode-foreground)',
        opacity: hovered ? 1 : 0.7,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── icon SVGs ───────────────────────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
      <circle cx='8' cy='8' r='6.5' />
      <polyline points='8,4.5 8,8 10.5,10' />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
      <rect x='2' y='2' width='12' height='12' rx='2' />
      <line x1='8' y1='5.5' x2='8' y2='10.5' />
      <line x1='5.5' y1='8' x2='10.5' y2='8' />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
      <circle cx='8' cy='8' r='2.5' />
      <path d='M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M12.6 3.4l-.85.85M4.25 11.75l-.85.85' />
    </svg>
  );
}

// ─── top bar ─────────────────────────────────────────────────────────────────

function TopBar({
  onHistory,
  onNewChat,
}: {
  onHistory: () => void;
  onNewChat: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px 6px 14px',
        borderBottom: '1px solid var(--vscode-input-border)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.2px' }}>CalmUI</span>
      <div style={{ display: 'flex', gap: 2 }}>
        <IconBtn title='History' onClick={onHistory}>
          <ClockIcon />
        </IconBtn>
        <IconBtn title='New conversation' onClick={onNewChat}>
          <NewChatIcon />
        </IconBtn>
      </div>
    </div>
  );
}

// ─── bottom bar ──────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function BottomBar({
  modelItems,
  modelCurrent,
  usage,
}: {
  modelItems: ModelChoice[];
  modelCurrent: string;
  usage: { usedTokens: number; maxTokens: number } | null;
}) {
  const [localModel, setLocalModel] = useState(modelCurrent);

  // Sync when host pushes a new current value
  useEffect(() => {
    setLocalModel(modelCurrent);
  }, [modelCurrent]);

  const hasCurrentInItems = modelItems.some((m) => m.value === localModel);

  const handleChange = (value: string) => {
    setLocalModel(value);
    vscodeApi.postMessage({ type: 'setModel', model: value });
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px 4px 14px',
        borderTop: '1px solid var(--vscode-input-border)',
        fontSize: 11,
        color: 'var(--vscode-descriptionForeground)',
        flexShrink: 0,
      }}
    >
      <select
        aria-label='Active model'
        value={localModel}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
          color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground))',
          border: '1px solid var(--vscode-dropdown-border, var(--vscode-input-border))',
          borderRadius: 3,
          fontSize: 11,
          padding: '2px 4px',
          maxWidth: 170,
          cursor: 'pointer',
        }}
      >
        {!hasCurrentInItems && localModel !== '' && (
          <option value={localModel}>{localModel}</option>
        )}
        {modelItems.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <IconBtn title='Settings' onClick={() => vscodeApi.postMessage({ type: 'openSettings' })}>
        <GearIcon />
      </IconBtn>
      {usage !== null && (
        <span
          title='Estimated context usage'
          style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          ≈{formatTokens(usage.usedTokens)} / {formatTokens(usage.maxTokens)}
        </span>
      )}
    </div>
  );
}

// ─── history view ─────────────────────────────────────────────────────────────

function relativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function HistoryView({
  conversations,
  activeConversationId,
  onBack,
  onSelect,
}: {
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        style={{
          ...S.btn(false),
          alignSelf: 'flex-start',
          marginBottom: 4,
          fontSize: 12,
        }}
        onClick={onBack}
      >
        ← Back
      </button>
      {conversations.length === 0 ? (
        <p style={{ ...S.muted, margin: 0 }}>No conversations yet.</p>
      ) : (
        conversations.map((c) => {
          const isActive = c.id === activeConversationId;
          return (
            <HistoryItem
              key={c.id}
              conversation={c}
              isActive={isActive}
              onSelect={onSelect}
            />
          );
        })
      )}
    </div>
  );
}

function HistoryItem({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: ConversationMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={() => onSelect(conversation.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 8,
        borderRadius: 3,
        cursor: 'pointer',
        background: isActive
          ? 'var(--vscode-list-activeSelectionBackground)'
          : hovered
          ? 'var(--vscode-list-hoverBackground)'
          : 'transparent',
        color: isActive
          ? 'var(--vscode-list-activeSelectionForeground, var(--vscode-foreground))'
          : 'var(--vscode-foreground)',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {conversation.title}
      </span>
      <span style={{ ...S.muted, fontSize: 11 }}>{relativeTime(conversation.updatedAt)}</span>
    </div>
  );
}

// ─── sub-components ─────────────────────────────────────────────────────────

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
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      {messages.length === 0 ? (
        <p style={{ ...S.muted, margin: 0 }}>Send a prompt to get started.</p>
      ) : (
        <TranscriptView messages={messages} errorIds={errorIds} />
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
        <div style={{ fontSize: 12 }}>
          <strong>This looks like a longer task.</strong> For best results, continue in the
          full Antigravity terminal where agy can take multi-step actions.
        </div>
        <div style={S.row}>
          <OpenTerminalBtn input={input} />
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

// States that show the composer (and thus the bottom bar)
const SHOWS_BOTTOM_BAR = new Set<PanelStatus>([
  'onboarding',
  'ready',
  'running',
  'error',
  'handoff-recommended',
]);

function App() {
  const [status, setStatus] = useState<PanelStatus>('checking');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');

  // History / conversations
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Models
  const [modelItems, setModelItems] = useState<ModelChoice[]>([]);
  const [modelCurrent, setModelCurrent] = useState('');

  // Usage
  const [usage, setUsage] = useState<{ usedTokens: number; maxTokens: number } | null>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent<HostToWebview>) => {
      const m = e.data;
      switch (m.type) {
        case 'state':
          setStatus(m.status);
          break;
        case 'message':
          setMessages((prev) => [...prev, m.message]);
          break;
        case 'partial':
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, text: m.text } : x)),
          );
          break;
        case 'done':
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, pending: false } : x)),
          );
          break;
        case 'error':
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
          break;
        case 'hydrate':
          setMessages(m.messages);
          setErrorIds(new Set());
          setActiveConversationId(m.conversationId ?? null);
          setHistoryOpen(false);
          break;
        case 'conversations':
          setConversations(m.items);
          break;
        case 'models':
          setModelItems(m.items);
          setModelCurrent(m.current);
          break;
        case 'usage':
          setUsage({ usedTokens: m.usedTokens, maxTokens: m.maxTokens });
          break;
        default: {
          // exhaustive guard — TypeScript will error if a variant is unhandled
          const _: never = m;
          void _;
          break;
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    // The host posts the user message back — it owns the transcript mirror.
    vscodeApi.postMessage({ type: 'send', text });
    setInput('');
  };

  const newConversation = () => {
    setMessages([]);
    setErrorIds(new Set());
    setHistoryOpen(false);
    vscodeApi.postMessage({ type: 'newConversation' });
  };

  const openHistory = () => {
    setHistoryOpen(true);
    vscodeApi.postMessage({ type: 'listConversations' });
  };

  const toggleHistory = () => {
    if (historyOpen) {
      setHistoryOpen(false);
    } else {
      openHistory();
    }
  };

  const selectConversation = (id: string) => {
    vscodeApi.postMessage({ type: 'switchConversation', id });
    setHistoryOpen(false);
  };

  // Main panel content (replaces main area when history is open)
  let panelContent: React.ReactNode;

  if (historyOpen) {
    panelContent = (
      <HistoryView
        conversations={conversations}
        activeConversationId={activeConversationId}
        onBack={() => setHistoryOpen(false)}
        onSelect={selectConversation}
      />
    );
  } else {
    switch (status) {
      case 'checking':
        panelContent = <CheckingPanel />;
        break;
      case 'missing-cli':
        panelContent = <MissingCLIPanel input={input} />;
        break;
      case 'onboarding':
        panelContent = (
          <OnboardingPanel input={input} setInput={setInput} onSend={send} />
        );
        break;
      case 'ready':
        panelContent = (
          <ReadyPanel
            messages={messages}
            errorIds={errorIds}
            input={input}
            setInput={setInput}
            onSend={send}
          />
        );
        break;
      case 'running':
        panelContent = <RunningPanel messages={messages} errorIds={errorIds} />;
        break;
      case 'error':
        panelContent = (
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
        panelContent = (
          <HandoffPanel
            messages={messages}
            errorIds={errorIds}
            input={input}
            setInput={setInput}
            onSend={send}
          />
        );
        break;
      default: {
        const _: never = status;
        void _;
        panelContent = <CheckingPanel />;
      }
    }
  }

  const showBottomBar = SHOWS_BOTTOM_BAR.has(status);

  return (
    <main style={S.root}>
      <MarkdownStyles />
      <TopBar onHistory={toggleHistory} onNewChat={newConversation} />
      <div style={S.scrollArea}>{panelContent}</div>
      {showBottomBar && (
        <BottomBar
          modelItems={modelItems}
          modelCurrent={modelCurrent}
          usage={usage}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
