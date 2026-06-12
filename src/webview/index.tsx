import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import type { CSSProperties, ReactNode } from 'react';
import type { ChatMessage, ConversationMeta, HostToWebview, ModelChoice, PanelStatus } from '../shared/messages';

declare const acquireVsCodeApi: () => { postMessage: (m: unknown) => void };
const vscodeApi = acquireVsCodeApi();

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

const css = `
:root {
  --calm-bg: var(--vscode-sideBar-background, var(--vscode-editor-background));
  --calm-fg: var(--vscode-foreground);
  --calm-muted: var(--vscode-descriptionForeground);
  --calm-border: var(--vscode-panel-border, var(--vscode-input-border));
  --calm-input: var(--vscode-input-background);
  --calm-hover: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
  --calm-accent: var(--vscode-button-background);
  --calm-accent-fg: var(--vscode-button-foreground);
}
* { box-sizing: border-box; }
html, body, #root { width: 100%; min-height: 100%; margin: 0; padding: 0; }
body {
  background: var(--calm-bg);
  color: var(--calm-fg);
  font-family: var(--vscode-font-family);
  font-size: 13px;
}
button, textarea, select {
  font-family: var(--vscode-font-family);
  letter-spacing: 0;
}
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--calm-bg);
}
.topbar {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid var(--calm-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--calm-fg);
  font-size: 13px;
  font-weight: 600;
}
.brand-status {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--vscode-charts-green, #73c991);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-charts-green, #73c991) 16%, transparent);
}
.brand-status.running {
  background: var(--vscode-progressBar-background, var(--calm-accent));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-progressBar-background, var(--calm-accent)) 16%, transparent);
}
.brand-status.error {
  background: var(--vscode-errorForeground, #f48771);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-errorForeground, #f48771) 16%, transparent);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
}
.icon-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  color: var(--calm-muted);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
}
.icon-btn:hover {
  color: var(--calm-fg);
  background: var(--calm-hover);
}
.icon-btn.primary {
  color: var(--calm-accent-fg);
  background: var(--calm-accent);
}
.icon-btn.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
.content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px 18px;
  display: flex;
  flex-direction: column;
}
.content.empty {
  justify-content: center;
}
.empty-state {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 20px 8px;
}
.empty-logo {
  width: 78px;
  height: 56px;
  opacity: 0.96;
}
.empty-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
  font-weight: 600;
}
.empty-subtitle {
  margin: -2px 0 8px;
  max-width: 320px;
  color: var(--calm-muted);
  line-height: 1.45;
}
.suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 390px;
}
.suggestion {
  border: 1px solid var(--calm-border);
  border-radius: 999px;
  padding: 6px 10px;
  background: transparent;
  color: var(--calm-muted);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}
.suggestion:hover {
  color: var(--calm-fg);
  background: var(--calm-hover);
}
.transcript {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.message {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.message.user {
  align-items: flex-end;
}
.message-label {
  color: var(--calm-muted);
  font-size: 11px;
  font-weight: 600;
}
.bubble {
  max-width: min(100%, 520px);
  line-height: 1.52;
  overflow-wrap: anywhere;
}
.user .bubble {
  max-width: 86%;
  padding: 7px 10px;
  border-radius: 14px 14px 4px 14px;
  background: var(--vscode-input-background);
  border: 1px solid color-mix(in srgb, var(--calm-border) 78%, transparent);
  white-space: pre-wrap;
}
.assistant .bubble {
  width: 100%;
  padding: 0;
}
.thinking {
  color: var(--calm-muted);
}
.status-card {
  border: 1px solid var(--calm-border);
  border-radius: 8px;
  padding: 12px;
  background: color-mix(in srgb, var(--calm-input) 74%, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
  line-height: 1.5;
}
.status-title {
  font-size: 13px;
  font-weight: 600;
}
.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.text-btn {
  border: 1px solid var(--calm-border);
  border-radius: 6px;
  background: var(--vscode-button-secondaryBackground, var(--calm-input));
  color: var(--vscode-button-secondaryForeground, var(--calm-fg));
  padding: 5px 9px;
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
}
.text-btn.primary {
  border-color: transparent;
  background: var(--calm-accent);
  color: var(--calm-accent-fg);
}
.text-btn:hover {
  filter: brightness(1.08);
}
.history-view {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.history-item {
  width: 100%;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--calm-fg);
  padding: 8px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.history-item:hover {
  background: var(--calm-hover);
}
.history-item.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground, var(--calm-fg));
}
.history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
}
.history-time {
  color: var(--calm-muted);
  font-size: 11px;
}
.composer-shell {
  flex: 0 0 auto;
  border-top: 1px solid var(--calm-border);
  padding: 10px 10px 8px;
  background: var(--calm-bg);
}
.composer {
  border: 1px solid color-mix(in srgb, var(--calm-border) 86%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--calm-input) 92%, transparent);
  overflow: hidden;
}
.prompt {
  display: block;
  width: 100%;
  min-height: 64px;
  max-height: 180px;
  resize: vertical;
  padding: 10px 12px;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--vscode-input-foreground);
  font-size: 13px;
  line-height: 1.45;
}
.prompt::placeholder {
  color: var(--vscode-input-placeholderForeground);
}
.composer-rail {
  min-height: 38px;
  padding: 6px 7px 7px;
  border-top: 1px solid color-mix(in srgb, var(--calm-border) 70%, transparent);
  display: flex;
  align-items: center;
  gap: 6px;
}
.model-select {
  min-width: 0;
  max-width: 164px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--calm-muted);
  font-size: 11px;
  padding: 0 4px;
  cursor: pointer;
}
.model-select:hover {
  color: var(--calm-fg);
  background: var(--calm-hover);
}
.usage {
  color: var(--calm-muted);
  font-size: 11px;
  white-space: nowrap;
}
.spacer {
  flex: 1 1 auto;
  min-width: 4px;
}
.calm-md p { margin: 0 0 8px; }
.calm-md p:last-child { margin-bottom: 0; }
.calm-md ul, .calm-md ol { margin: 0 0 8px; padding-left: 18px; }
.calm-md li { margin-bottom: 3px; line-height: 1.5; }
.calm-md code {
  font-family: var(--vscode-editor-font-family, monospace);
  background: var(--vscode-textCodeBlock-background, var(--vscode-input-background));
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 12px;
}
.calm-md pre {
  font-family: var(--vscode-editor-font-family, monospace);
  background: var(--vscode-textCodeBlock-background, var(--vscode-input-background));
  padding: 9px 10px;
  border-radius: 7px;
  overflow-x: auto;
  margin: 0 0 8px;
  font-size: 12px;
  border: 1px solid var(--calm-border);
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
  margin: 0 0 8px;
  padding: 2px 0 2px 10px;
  border-left: 3px solid var(--calm-border);
  color: var(--calm-muted);
}
.calm-md h1, .calm-md h2, .calm-md h3, .calm-md h4 {
  margin: 8px 0 5px;
  font-weight: 600;
  line-height: 1.25;
}
@media (max-width: 330px) {
  .usage { display: none; }
  .model-select { max-width: 128px; }
  .empty-title { font-size: 16px; }
}
`;

function Styles() {
  return <style>{css}</style>;
}

function IconButton({
  title,
  onClick,
  children,
  primary = false,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type='button'
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`icon-btn${primary ? ' primary' : ''}`}
    >
      {children}
    </button>
  );
}

function ClockIcon() {
  return (
    <svg width='17' height='17' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.45' strokeLinecap='round' strokeLinejoin='round'>
      <circle cx='8' cy='8' r='6.3' />
      <path d='M8 4.6v3.8l2.5 1.6' />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width='17' height='17' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.45' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M3.1 2.6h9.8a1.1 1.1 0 0 1 1.1 1.1v8.6a1.1 1.1 0 0 1-1.1 1.1H3.1A1.1 1.1 0 0 1 2 12.3V3.7a1.1 1.1 0 0 1 1.1-1.1Z' />
      <path d='M8 5.2v5.6M5.2 8h5.6' />
    </svg>
  );
}

function GearIcon() {
  // Codicon-style cog: toothed outer ring + center hole (spokes-only reads as a sun).
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
      <path
        fillRule='evenodd'
        d='M9.1 1.5 9.4 3a5.2 5.2 0 0 1 1.5.87l1.46-.5.95 1.64-1.16 1.06a5.27 5.27 0 0 1 0 1.74l1.16 1.06-.95 1.64-1.46-.5a5.2 5.2 0 0 1-1.5.87l-.3 1.52H7.2L6.9 12.9a5.2 5.2 0 0 1-1.5-.87l-1.46.5L3 10.9l1.16-1.06a5.27 5.27 0 0 1 0-1.74L3 7.04l.95-1.64 1.46.5A5.2 5.2 0 0 1 6.9 5l.3-1.51h1.9ZM8 10.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z'
        transform='translate(-0.1 0.05)'
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M8 12.5V3.5' />
      <path d='M4.5 7 8 3.5 11.5 7' />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width='17' height='17' viewBox='0 0 16 16' fill='currentColor'>
      <rect x='4.2' y='4.2' width='7.6' height='7.6' rx='1.2' />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width='17' height='17' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.45' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M2.3 3.2h11.4v9.6H2.3z' />
      <path d='m4.3 6 2 2-2 2M7.8 10h3.5' />
    </svg>
  );
}

function CalmLogo() {
  return (
    <svg className='empty-logo' viewBox='0 0 579 401' role='img' aria-label='CalmUI logo'>
      <g transform='translate(-141.37 -207.56)'>
        <g transform='matrix(2.002768 0 0 .206369 -434.48 506.07)'>
          <path d='M431.974 207.564c79.72 0 144.443 64.723 144.443 144.443S511.694 496.45 431.974 496.45 287.531 431.727 287.531 352.007s64.722-144.443 144.443-144.443Zm0 43.697c55.603 0 100.746 45.143 100.746 100.746s-45.143 100.746-100.746 100.746-100.746-45.143-100.746-100.746 45.143-100.746 100.746-100.746Z' fill='#1f6b66' />
        </g>
        <circle cx='431.974' cy='352.007' r='144.443' fill='#2e8b85' />
        <g transform='matrix(.7939 0 0 .112824 91.94 534.94)'>
          <circle cx='431.974' cy='352.007' r='144.443' fill='#2e8b85' fillOpacity='.22' />
        </g>
        <circle cx='496.858' cy='297.27' r='42.509' fill='white' />
      </g>
    </svg>
  );
}

function statusClass(status: PanelStatus): string {
  if (status === 'running') return 'running';
  if (status === 'error' || status === 'handoff-recommended' || status === 'missing-cli') return 'error';
  return '';
}

function TopBar({
  status,
  onHistory,
  onNewChat,
}: {
  status: PanelStatus;
  onHistory: () => void;
  onNewChat: () => void;
}) {
  return (
    <header className='topbar'>
      <div className='brand'>
        <span className={`brand-status ${statusClass(status)}`} />
        <span>CalmUI</span>
      </div>
      <div className='toolbar'>
        <IconButton title='Conversation history' onClick={onHistory}>
          <ClockIcon />
        </IconButton>
        <IconButton title='New chat' onClick={onNewChat}>
          <NewChatIcon />
        </IconButton>
      </div>
    </header>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function Composer({
  input,
  setInput,
  onSend,
  running,
  modelItems,
  modelCurrent,
  usage,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  running: boolean;
  modelItems: ModelChoice[];
  modelCurrent: string;
  usage: { usedTokens: number; maxTokens: number } | null;
}) {
  const [localModel, setLocalModel] = useState(modelCurrent);

  useEffect(() => {
    setLocalModel(modelCurrent);
  }, [modelCurrent]);

  const hasCurrentInItems = modelItems.some((m) => m.value === localModel);
  const handleModel = (value: string) => {
    setLocalModel(value);
    vscodeApi.postMessage({ type: 'setModel', model: value });
  };

  return (
    <footer className='composer-shell'>
      <div className='composer'>
        <textarea
          className='prompt'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={3}
          placeholder={running ? 'agy is responding...' : 'Ask agy a quick question...'}
        />
        <div className='composer-rail'>
          <IconButton title='Open in Antigravity terminal' onClick={() => vscodeApi.postMessage({ type: 'openTerminal', prompt: input.trim() || undefined })}>
            <TerminalIcon />
          </IconButton>
          <select
            className='model-select'
            aria-label='Active model'
            value={localModel}
            onChange={(e) => handleModel(e.target.value)}
            title='Active model'
          >
            {!hasCurrentInItems && localModel !== '' && <option value={localModel}>{localModel}</option>}
            {modelItems.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <IconButton title='Settings' onClick={() => vscodeApi.postMessage({ type: 'openSettings' })}>
            <GearIcon />
          </IconButton>
          <span className='spacer' />
          {usage !== null && (
            <span className='usage' title='Estimated context usage'>
              {formatTokens(usage.usedTokens)} / {formatTokens(usage.maxTokens)}
            </span>
          )}
          {running ? (
            <IconButton title='Stop — cancel this response' onClick={() => vscodeApi.postMessage({ type: 'cancel' })} primary>
              <StopIcon />
            </IconButton>
          ) : (
            <IconButton title='Send (Enter)' onClick={onSend} primary disabled={!input.trim()}>
              <SendIcon />
            </IconButton>
          )}
        </div>
      </div>
    </footer>
  );
}

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
    <div className='history-view'>
      <button className='text-btn' style={{ alignSelf: 'flex-start', marginBottom: 6 }} onClick={onBack}>
        Back
      </button>
      {conversations.length === 0 ? (
        <p style={mutedStyle}>No conversations yet.</p>
      ) : (
        conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={`history-item${conversation.id === activeConversationId ? ' active' : ''}`}
            onClick={() => onSelect(conversation.id)}
          >
            <span className='history-title'>{conversation.title}</span>
            <span className='history-time'>{relativeTime(conversation.updatedAt)}</span>
          </button>
        ))
      )}
    </div>
  );
}

const mutedStyle: CSSProperties = {
  color: 'var(--calm-muted)',
  margin: 0,
  lineHeight: 1.5,
};

function OpenTerminalButton({ input }: { input: string }) {
  return (
    <button className='text-btn' onClick={() => vscodeApi.postMessage({ type: 'openTerminal', prompt: input || undefined })}>
      Open in Terminal
    </button>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    'Explain this codebase',
    'Find bugs in the current file',
    'Write tests for selected code',
    'Refactor this to be simpler',
  ];

  return (
    <section className='empty-state'>
      <CalmLogo />
      <h1 className='empty-title'>CalmUI for Antigravity CLI</h1>
      <p className='empty-subtitle'>Ask agy anything about your workspace.</p>
      <div className='suggestions'>
        {suggestions.map((text) => (
          <button key={text} className='suggestion' onClick={() => onSuggestion(text)}>
            {text}
          </button>
        ))}
      </div>
    </section>
  );
}

function MissingCLIPanel({ input }: { input: string }) {
  return (
    <div className='status-card'>
      <div className='status-title'>agy not found</div>
      <div style={mutedStyle}>Install the Antigravity CLI and make sure <code>agy</code> is on your PATH, then fully reopen the editor.</div>
      <div className='status-actions'>
        <button className='text-btn primary' onClick={() => vscodeApi.postMessage({ type: 'runDiagnostics' })}>
          Run Diagnostics
        </button>
        <OpenTerminalButton input={input} />
      </div>
    </div>
  );
}

function OnboardingPanel({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return <EmptyState onSuggestion={onSuggestion} />;
}

function TranscriptView({
  messages,
  errorIds,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
}) {
  return (
    <div className='transcript'>
      {messages.map((m) => {
        const isError = errorIds.has(m.id);
        const roleClass = m.role === 'user' ? 'user' : 'assistant';
        return (
          <article key={m.id} className={`message ${roleClass}`}>
            <div className='message-label'>{m.role === 'user' ? 'You' : 'agy'}</div>
            <div className='bubble'>
              {m.role === 'user' || isError ? (
                <div>{m.text}</div>
              ) : m.pending && !m.text ? (
                <span className='thinking'>Thinking...</span>
              ) : (
                <>
                  <div
                    className='calm-md'
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
                  />
                  {m.pending && <span className='thinking'> Streaming...</span>}
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReadyPanel({
  messages,
  errorIds,
  onSuggestion,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
  onSuggestion: (text: string) => void;
}) {
  return messages.length === 0 ? (
    <EmptyState onSuggestion={onSuggestion} />
  ) : (
    <TranscriptView messages={messages} errorIds={errorIds} />
  );
}

function RunningPanel({
  messages,
  errorIds,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
}) {
  return <TranscriptView messages={messages} errorIds={errorIds} />;
}

function ErrorPanel({
  messages,
  errorIds,
  input,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
  input: string;
}) {
  return (
    <div className='transcript'>
      {messages.length > 0 && <TranscriptView messages={messages} errorIds={errorIds} />}
      <div className='status-card'>
        <div className='status-title'>Something went wrong</div>
        <div style={mutedStyle}>You can retry here or continue in the full Antigravity terminal.</div>
        <div className='status-actions'>
          <button className='text-btn primary' onClick={() => vscodeApi.postMessage({ type: 'runDiagnostics' })}>
            Run Diagnostics
          </button>
          <OpenTerminalButton input={input} />
        </div>
      </div>
    </div>
  );
}

function HandoffPanel({
  messages,
  errorIds,
  input,
}: {
  messages: ChatMessage[];
  errorIds: Set<string>;
  input: string;
}) {
  return (
    <div className='transcript'>
      {messages.length > 0 && <TranscriptView messages={messages} errorIds={errorIds} />}
      <div className='status-card'>
        <div className='status-title'>Continue in the Antigravity terminal</div>
        <div style={mutedStyle}>This looks like a longer task. agy can take multi-step actions from the full terminal.</div>
        <div className='status-actions'>
          <OpenTerminalButton input={input} />
        </div>
      </div>
    </div>
  );
}

function CheckingPanel() {
  return <p style={mutedStyle}>Checking for agy...</p>;
}

const SHOWS_COMPOSER = new Set<PanelStatus>([
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [modelItems, setModelItems] = useState<ModelChoice[]>([]);
  const [modelCurrent, setModelCurrent] = useState('');
  const [usage, setUsage] = useState<{ usedTokens: number; maxTokens: number } | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

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
                    ? `${x.text}\nWarning: ${m.text}`
                    : `Warning: ${m.text}`;
                  return { ...x, pending: false, text: warningText };
                });
              }
              const newId = `e${Date.now()}`;
              setErrorIds((ids) => new Set(ids).add(newId));
              return [
                ...prev,
                { id: newId, role: 'assistant' as const, text: `Warning: ${m.text}` },
              ];
            });
            setErrorIds((ids) => new Set(ids).add(m.id!));
          } else {
            const newId = `e${Date.now()}`;
            setErrorIds((ids) => new Set(ids).add(newId));
            setMessages((prev) => [
              ...prev,
              { id: newId, role: 'assistant' as const, text: `Warning: ${m.text}` },
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
          const _: never = m;
          void _;
          break;
        }
      }
    };
    window.addEventListener('message', onMsg);
    // Listener is attached — ask the host for the boot bundle.
    vscodeApi.postMessage({ type: 'webviewReady' });
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (historyOpen) return;
    const node = contentRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, historyOpen]);

  const send = () => {
    const text = input.trim();
    if (!text || status === 'running') return;
    vscodeApi.postMessage({ type: 'send', text });
    setInput('');
  };

  const fillSuggestion = (text: string) => {
    setInput(text);
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

  let panelContent: ReactNode;
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
        panelContent = <OnboardingPanel onSuggestion={fillSuggestion} />;
        break;
      case 'ready':
        panelContent = <ReadyPanel messages={messages} errorIds={errorIds} onSuggestion={fillSuggestion} />;
        break;
      case 'running':
        panelContent = <RunningPanel messages={messages} errorIds={errorIds} />;
        break;
      case 'error':
        panelContent = <ErrorPanel messages={messages} errorIds={errorIds} input={input} />;
        break;
      case 'handoff-recommended':
        panelContent = <HandoffPanel messages={messages} errorIds={errorIds} input={input} />;
        break;
      default: {
        const _: never = status;
        void _;
        panelContent = <CheckingPanel />;
      }
    }
  }

  const emptyContent = !historyOpen && (status === 'onboarding' || (status === 'ready' && messages.length === 0));
  const showComposer = SHOWS_COMPOSER.has(status) && !historyOpen;

  return (
    <main className='app'>
      <Styles />
      <TopBar status={status} onHistory={toggleHistory} onNewChat={newConversation} />
      <div ref={contentRef} className={`content${emptyContent ? ' empty' : ''}`}>
        {panelContent}
      </div>
      {showComposer && (
        <Composer
          input={input}
          setInput={setInput}
          onSend={send}
          running={status === 'running'}
          modelItems={modelItems}
          modelCurrent={modelCurrent}
          usage={usage}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
