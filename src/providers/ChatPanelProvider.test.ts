import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- vscode stub -----------------------------------------------------------
const workspaceState = new Map<string, unknown>();
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, dflt: unknown) => dflt,
      update: vi.fn(async () => undefined),
    }),
    workspaceFolders: undefined,
  },
  ConfigurationTarget: { Workspace: 2, Global: 1 },
  commands: { executeCommand: vi.fn() },
  env: { clipboard: { writeText: vi.fn(async () => undefined) } },
  window: { showInformationMessage: vi.fn() },
  Uri: { joinPath: (base: unknown, ...parts: string[]) => ({ toString: () => parts.join('/') }) },
}));

import { ChatPanelProvider } from './ChatPanelProvider';
import type {
  AgyTransport,
  AgyResult,
  AgySendOptions,
} from '../transport/AgyTransport';
import type { HostToWebview, WebviewToHost } from '../shared/messages';

// ---- fakes -----------------------------------------------------------------

/** A transport whose sendPrompt we resolve manually, capturing options. */
class FakeTransport implements AgyTransport {
  public sendCalls: AgySendOptions[] = [];
  public cancelled = 0;
  private resolvers: ((r: AgyResult) => void)[] = [];

  async checkAvailability() {
    return { found: true, version: '1.0.7', resolvedPath: 'agy' };
  }
  sendPrompt(_prompt: string, options: AgySendOptions): Promise<AgyResult> {
    this.sendCalls.push(options);
    return new Promise<AgyResult>((resolve) => this.resolvers.push(resolve));
  }
  /** Resolve the oldest in-flight sendPrompt. */
  settle(result: Partial<AgyResult> = {}) {
    const r = this.resolvers.shift();
    r?.({ text: 'ok', exitCode: 0, ...result });
  }
  cancel() {
    this.cancelled++;
  }
  async listModels() {
    return [];
  }
  openInteractiveTerminal() {}
  dispose() {}
}

function makeProvider() {
  const posted: HostToWebview[] = [];
  let receive!: (m: WebviewToHost) => void;
  const context = {
    extensionUri: { toString: () => 'ext' },
    workspaceState: {
      get: (k: string, d: unknown) => workspaceState.get(k) ?? d,
      update: async (k: string, v: unknown) => {
        workspaceState.set(k, v);
      },
    },
  } as unknown as import('vscode').ExtensionContext;

  const transport = new FakeTransport();
  const provider = new ChatPanelProvider(context, transport);

  const view = {
    webview: {
      options: {},
      html: '',
      asWebviewUri: (u: unknown) => u,
      cspSource: 'csp',
      onDidReceiveMessage: (cb: (m: WebviewToHost) => void) => {
        receive = cb;
      },
      postMessage: (m: HostToWebview) => {
        posted.push(m);
        return Promise.resolve(true);
      },
    },
  } as unknown as import('vscode').WebviewView;

  provider.resolveWebviewView(view);
  return { provider, transport, posted, send: (m: WebviewToHost) => receive(m) };
}

// ---------------------------------------------------------------------------

describe('ChatPanelProvider concurrency & multi-turn', () => {
  beforeEach(() => workspaceState.clear());

  it('single-flight: a second send while one is in flight is ignored', async () => {
    const { transport, send } = makeProvider();
    send({ type: 'send', text: 'first' });
    await Promise.resolve();
    send({ type: 'send', text: 'second' });
    await Promise.resolve();
    expect(transport.sendCalls.length).toBe(1);
  });

  it('a fresh thread sends without continue; the next turn continues it', async () => {
    const { transport, send } = makeProvider();

    send({ type: 'send', text: 'turn one' });
    await Promise.resolve();
    expect(transport.sendCalls[0].continue).toBe(false);
    expect(transport.sendCalls[0].conversationId).toBeUndefined();

    transport.settle({ text: 'answer one' }); // no conversationId captured
    await Promise.resolve();
    await Promise.resolve();

    send({ type: 'send', text: 'turn two' });
    await Promise.resolve();
    // With no captured id but a prior turn, we fall back to -c (continue).
    expect(transport.sendCalls[1].continue).toBe(true);
  });

  it('an explicit conversationId is threaded on the next turn', async () => {
    const { transport, send } = makeProvider();
    send({ type: 'send', text: 'one' });
    await Promise.resolve();
    transport.settle({ text: 'a', conversationId: 'conv-42' });
    await Promise.resolve();
    await Promise.resolve();

    send({ type: 'send', text: 'two' });
    await Promise.resolve();
    expect(transport.sendCalls[1].conversationId).toBe('conv-42');
  });

  it('cancel stops the turn and discards the late result (not persisted)', async () => {
    const { transport, posted, send } = makeProvider();
    send({ type: 'send', text: 'hi' });
    await Promise.resolve();

    send({ type: 'cancel' });
    expect(transport.cancelled).toBe(1);

    // A late completion arrives after cancel — must be discarded, not shown done.
    posted.length = 0;
    transport.settle({ text: 'late answer', conversationId: 'x' });
    await Promise.resolve();
    await Promise.resolve();
    expect(posted.find((m) => m.type === 'done')).toBeUndefined();
    // Nothing was persisted for this cancelled turn.
    expect(workspaceState.get('calmui.conversations')).toBeUndefined();
  });

  it('an empty response is surfaced as an error, not persisted', async () => {
    const { transport, posted, send } = makeProvider();
    send({ type: 'send', text: 'hi' });
    await Promise.resolve();
    posted.length = 0;
    transport.settle({ text: '   ', conversationId: 'y' });
    await Promise.resolve();
    await Promise.resolve();
    expect(posted.find((m) => m.type === 'error')).toBeDefined();
    expect(workspaceState.get('calmui.conversations')).toBeUndefined();
  });
});
