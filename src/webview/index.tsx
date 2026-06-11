import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { ChatMessage, HostToWebview } from '../shared/messages';

// Minimal scaffold UI. Phases 1–3 replace this with the calm onboarding /
// transcript / handoff-card design (see .planning/2026-06-11-build-plan.md).

declare const acquireVsCodeApi: () => { postMessage: (m: unknown) => void };
const vscodeApi = acquireVsCodeApi();

function App() {
  const [status, setStatus] = useState('checking');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const onMsg = (e: MessageEvent<HostToWebview>) => {
      const m = e.data;
      if (m.type === 'state') setStatus(m.status);
      else if (m.type === 'message')
        setMessages((prev) => [...prev, m.message]);
      else if (m.type === 'partial')
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, text: m.text } : x)),
        );
      else if (m.type === 'done')
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, pending: false } : x)),
        );
      else if (m.type === 'error')
        setMessages((prev) => [
          ...prev,
          { id: `e${Date.now()}`, role: 'assistant', text: `⚠ ${m.text}` },
        ]);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: `u${Date.now()}`, role: 'user', text },
    ]);
    vscodeApi.postMessage({ type: 'send', text });
    setInput('');
  };

  return (
    <main style={{ fontFamily: 'var(--vscode-font-family)', padding: 12 }}>
      <div style={{ opacity: 0.7, fontSize: 12 }}>status: {status}</div>
      {status === 'missing-cli' && (
        <p>agy not found. Run diagnostics, or open the Antigravity terminal.</p>
      )}
      <div>
        {messages.map((m) => (
          <p key={m.id}>
            <strong>{m.role === 'user' ? 'You' : 'agy'}:</strong> {m.text}
            {m.pending ? ' …' : ''}
          </p>
        ))}
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={3}
        style={{ width: '100%' }}
        placeholder="Ask agy a quick question…"
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
