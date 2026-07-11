# PLAN — v0.5.0 "Robustness for dogfooding"

Executor: Sonnet. Every decision is already made in this document — do not redesign,
do not add features beyond what is written here. If a step is impossible as written,
stop and report instead of improvising.

Repo: `c:\AI_LAB\CalmUI_for_AntigravityCLI` (branch `main`, clean at plan time).
Work on a branch: `git checkout -b v0.5.0`.

Run `npm test` after every task. All existing tests must stay green; each task lists
new tests to add. Build check: `npm run build` must succeed after each task.

---

## Task 1 — SECURITY: machine-scope `agyPath`, fix `runCapture` shell quoting

**Files:** `package.json`, `src/transport/AgyProcess.ts`

1. In `package.json`, add to the `calmui-agy.agyPath` property: `"scope": "machine"`.
   Add to `calmui-agy.includeDirectories`: `"scope": "machine-overridable"`.
2. In `AgyProcess.runCapture()` (src/transport/AgyProcess.ts:366): remove
   `shell: process.platform === 'win32'`. Instead:
   - For the `where`/`which` lookup this is fine as plain spawn (`where` is in System32).
   - For `--version`/`models` calls the bin is an absolute path — plain spawn works.
   - EXCEPT: if the bin ends in `.cmd`/`.bat`, plain spawn fails on Windows. Reuse the
     existing `buildSpawn()` routing: change `runCapture` to accept `(bin, args)` and
     route through `this.buildSpawn(bin, args)` when `path.isAbsolute(bin)`; for bare
     commands (`where`, `which`) spawn directly with `shell: false`.
3. Update callers accordingly (`resolveBinary`, `checkAvailability`, `listModels`).

**Tests:** none new required beyond keeping AgyProcess.test.ts green (buildSpawn is
already tested). Add one test: `buildSpawn` returns cmd.exe routing for a path with
spaces `C:\Program Files\agy\agy.cmd` and quotes it via `quoteForCmd`.

## Task 2 — SECURITY: PowerShell-safe terminal prefill

**File:** `src/transport/AgyProcess.ts`

Replace the module-level `quote()` (line 427) with a shell-aware prefill:

```ts
/** Quote a prompt for interactive prefill. PowerShell expands $ ` " inside
 *  double quotes, so use single quotes and double embedded single quotes.
 *  Strip newlines: the prefill is a single command line. */
function quoteForPrefill(s: string): string {
  const flat = s.replace(/\r?\n/g, ' ');
  return `'${flat.replace(/'/g, "''")}'`;
}
```

Use it in `openInteractiveTerminal`. Single-quote form is also literal-safe in
bash/zsh (the `''` doubling is harmless there only if content has no single quotes;
that trade-off is accepted — PowerShell is the primary target on this machine).

**Tests (AgyProcess.test.ts):** `quoteForPrefill` — export it; cases: plain text,
embedded `'`, embedded `"` and `$(calc)` stay literal (i.e. output is wrapped in
single quotes and contains no unescaped `'`), newlines flattened to spaces.

## Task 3 — BUG: message-ID collisions after reload (use UUID message ids)

**File:** `src/providers/ChatPanelProvider.ts`

Replace the `turn`-based id scheme with UUIDs:

1. In the `send` handler, replace:
   `const assistantId = \`a${++this.turn}\`; const userId = \`u${this.turn}\`;`
   with:
   `const myTurn = ++this.turn;`
   `const assistantId = \`a-${crypto.randomUUID()}\`;`
   `const userId = \`u-${crypto.randomUUID()}\`;`
   (`crypto` is already imported.) Keep `myTurn`/`runningTurn` logic unchanged —
   it is the single-flight guard, ids are only display identity.
2. Old stored conversations with `u1/a1` ids keep working because new ids can never
   collide with them. No migration needed.

**Tests (ChatPanelProvider.test.ts):** send two prompts across a simulated provider
re-instantiation with the same hydrated messages; assert all message ids in the host
mirror are unique.

## Task 4 — BUG: Diagnostics probe hijacks `-c` continuity

**Files:** `src/transport/AgyProcess.ts`, `src/transport/AgyTransport.ts`, `src/diagnostics.ts`

The probe creates a new agy conversation, so a later `-c` continues the probe.
Fix by making the panel not trust `-c` after a probe ran:

1. Add to `AgyTransport` interface: `onExternalConversation?: (cb: () => void) => void;`
   Simpler concrete approach (do this): in `AgyProcess`, add a public readonly
   `vscode.EventEmitter<void>`? — NO vscode types in transport tests. Instead:
   add `private externalRunListeners: Array<() => void> = []` and
   `onExternalRun(cb: () => void): void` to `AgyProcess` and to the `AgyTransport`
   interface as optional.
2. In `checkAvailability(probe=true)`, after the probe completes (success or failure),
   call every `externalRunListeners` callback.
3. In `ChatPanelProvider` constructor: `transport.onExternalRun?.(() => { if (this.conversationId === undefined) this.threadHasTurns = false; });`
   — i.e. if the panel was relying on `-c` fallback, stop; the next turn starts fresh
   rather than continuing the probe conversation. If a real `conversationId` is held,
   nothing changes (explicit `--conversation` is immune).

**Tests (ChatPanelProvider.test.ts):** with a fake transport, simulate a completed
turn with no conversation id (threadHasTurns=true), fire onExternalRun, assert the
next send's options have `continue: false` and no `conversationId`.

## Task 5 — BUG: preserve streamed partial text on timeout/error

**Files:** `src/transport/AgyProcess.ts`, `src/providers/ChatPanelProvider.ts`

1. In `AgyProcess.sendPrompt` timeout path: include partial output in the rejection.
   Create `class AgyTimeoutError extends Error { constructor(msg: string, public readonly partialText: string) { super(msg); } }`
   exported from AgyProcess.ts. Reject with
   `new AgyTimeoutError(existingMessage, normalizeDrip(raw))`.
2. In the provider's `catch`: if `err instanceof AgyTimeoutError && err.partialText.trim()`,
   set `placeholder.text = err.partialText + '\n\n> ⚠ ' + err.message` and post it as
   a `partial` + `done` (a completed-with-warning bubble), post
   `{ type: 'state', status: 'ready' }`, keep `threadHasTurns = true`.
   Otherwise keep the existing error path unchanged.

**Tests (ChatPanelProvider.test.ts):** fake transport rejects with AgyTimeoutError
carrying partial text → assert the placeholder ends non-pending, contains the partial
text and the warning, and no `error` message was posted for it.

## Task 6 — BUG: persist conversations without a captured agy id

**File:** `src/providers/ChatPanelProvider.ts`

1. Add field `private localId: string = crypto.randomUUID();` regenerated in
   `newConversation`.
2. Storage key becomes: `const storeId = this.conversationId ?? \`local-${this.localId}\`;`
   Change `persistConversation` to use `storeId` (parameterize it), and call it after
   EVERY successful turn (move the call out of the `if (this.conversationId)` guard).
   When a real `conversationId` is captured later in the same thread, migrate: remove
   the `local-…` entry and re-save under the real id (in `persistConversation`,
   accept `previousStoreId?: string` and filter it out of `rest` too).
3. `switchConversation`: if the selected id starts with `local-`, set
   `this.conversationId = undefined`, `this.localId = id.slice('local-'.length)`,
   and `threadHasTurns` as currently computed (so `-c` fallback applies). Otherwise
   behave as today.

**Tests:** turn completes with no conversation id → conversation appears in
`loadMetas()` under a `local-` id; a later turn that captures a real id leaves exactly
one stored conversation (migrated).

## Task 7 — `setModel` writes Global, config-change listener

**Files:** `src/providers/ChatPanelProvider.ts`, `src/extension.ts`

1. In the `setModel` handler: always use `vscode.ConfigurationTarget.Global`.
2. In `resolveWebviewView`, register (and push onto `this.context.subscriptions`):
   `vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('calmui-agy')) this.post(this.modelsMessage()); })`
3. `agyPath` changes still require reload — acceptable; add a note line to README
   settings section.

**Tests:** none (vscode API glue). Manual check in Task 12.

## Task 8 — PERF: throttle partial posts + memoize markdown

**Files:** `src/providers/ChatPanelProvider.ts`, `src/webview/index.tsx`

1. Provider: wrap the `onPartial` callback in a trailing-edge throttle of 80ms —
   post at most every 80ms, but always post the final state (the completion path
   already posts the full text, so a dropped trailing partial is fine). Implement
   inline with `let lastPost = 0; let timer: NodeJS.Timeout | undefined;` — on call:
   if `now - lastPost >= 80` post immediately, else schedule a single trailing timer.
   Clear the timer when the turn settles (success, error, cancel).
2. Webview: extract the message bubble into a memoized component:
   `const MessageBubble = memo(function MessageBubble({ m, isError }: { m: ChatMessage; isError: boolean }) { ... })`
   moving the per-message JSX from `TranscriptView` into it, and inside it compute
   `const html = useMemo(() => renderMarkdown(m.text), [m.text]);`
   `TranscriptView` maps to `<MessageBubble key={m.id} m={m} isError={errorIds.has(m.id)} />`.

**Tests:** unit-test the throttle as a pure exported helper
`makeThrottled(fn, ms, nowFn)` in chatHelpers.ts (inject `nowFn` for determinism):
immediate first call, suppressed burst, trailing call fires.

## Task 9 — UX: sticky auto-scroll, IME guard, focus, chips send directly

**File:** `src/webview/index.tsx`

1. **Sticky scroll:** track `const nearBottomRef = useRef(true);` — add `onScroll` to
   the `.content` div setting
   `nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;`
   In the existing scroll effect, only jump when `nearBottomRef.current` is true.
2. **IME:** in the textarea `onKeyDown`, add `if (e.nativeEvent.isComposing) return;`
   before the Enter check.
3. **Focus:** add `const promptRef = useRef<HTMLTextAreaElement|null>(null)` in
   `Composer`; `autoFocus` on the textarea; refocus in `send()` after posting
   (pass a `focusPrompt` callback down or simply keep focus by not disabling the
   textarea — verify Enter-send keeps focus; if it does, `autoFocus` alone is enough).
4. **Suggestion chips send immediately:** change `fillSuggestion` in `App` to post the
   send directly: `vscodeApi.postMessage({ type: 'send', text })` (keep input empty).
   Rename it `sendSuggestion`.
5. **Cancelled/errored bubble consistency:** in `TranscriptView`/`MessageBubble`,
   render error messages through the same `.calm-md` markdown path as normal
   assistant messages (error text is our own copy, safe to render as markdown).
   Remove the plain-`<div>` branch for `isError`; keep plain text for user messages.

**Tests:** none automated (JSDOM scroll not meaningful). Manual matrix in Task 12.

## Task 10 — UX: delete conversations from history

**Files:** `src/shared/messages.ts`, `src/providers/ChatPanelProvider.ts`, `src/webview/index.tsx`

1. `messages.ts`: add to `WebviewToHost`: `{ type: 'deleteConversation'; id: string }`.
2. Provider: handle it — filter the stored list, `workspaceState.update`, post fresh
   `conversations`. If the deleted id is the active conversation, also behave like
   `newConversation` (clear thread, hydrate empty).
3. Webview `HistoryView`: add a small `×` icon button on each row
   (`title='Delete conversation'`, `aria-label` same), `event.stopPropagation()`, posts
   `deleteConversation`. No confirm dialog (deleting a quick-ask thread is low-stakes);
   style: reuse `.icon-btn`, 22×22.

**Tests (ChatPanelProvider.test.ts):** delete removes from store; deleting active id
clears the live thread (hydrate with empty messages posted).

## Task 11 — Multi-line prompt handling on Windows (investigate, then flatten if broken)

**File:** `src/transport/AgyProcess.ts` (maybe none)

conpty flattens argv; embedded newlines in `-p <prompt>` may mangle the command line.
1. Write a scratch script (not committed) that spawns `agy -p "line1\nline2 — reply
   with the exact number of lines you received"` through the same node-pty path and
   inspect output. Run it. (Requires `agy` installed — it is, on this machine.)
2. If multi-line works: do nothing, note it in CHANGELOG QA notes.
3. If broken: in `buildAgyArgs`, replace `\r?\n` in the prompt with `\n`-as-space?
   NO — replace with literal ` `? NO. Decision: replace newlines with
   `'  '` (two spaces) ONLY on `process.platform === 'win32'` AND only when the
   spawn path is the cmd shim or the probe shows breakage; add
   `export function flattenPromptForWindows(p: string): string` and unit-test it.
   Report in the final summary which branch was taken.

## Task 12 — Version bump, docs, package, install

1. `package.json`: version `0.5.0`.
2. `CHANGELOG.md`: new `## 0.5.0` section — summarize Tasks 1–11 under
   `### Security`, `### Fixed`, `### Changed`, `### Performance`.
3. `README.md`: update the install command/version reference (search for `0.4.0`),
   add the `agyPath is machine-scoped` note and delete-history mention.
4. `npm test` (all green) and `npm run build`.
5. `npm run package` → produces `calmui-for-antigravity-cli-0.5.0.vsix` in repo root.
6. Install locally, replacing the current one:
   `code --install-extension .\calmui-for-antigravity-cli-0.5.0.vsix --force`
   (If the `code` CLI targets the wrong editor on this machine, report the produced
   .vsix path and stop — do not guess at other editor CLIs.)
7. Manual smoke list (perform what is possible headlessly; list the rest for Sam):
   - send prompt → streamed answer; scroll up during stream → view does not jump
   - Shift+Enter newline; Enter sends; suggestion chip sends immediately
   - cancel mid-stream; retry after forced error
   - history: switch, delete, delete-active
   - terminal prefill with a prompt containing `"` and `$(notepad)` → appears literal
   - Run Diagnostics, then next panel turn does NOT continue the probe conversation

## Task 13 — Git

1. Commit per task (13 small commits or logical groups), messages like
   `Security: machine-scope agyPath + shell-safe runCapture`.
2. Do NOT push and do NOT tag — Sam reviews the branch first. Final output:
   branch name, commit list, test results, .vsix path, and the Task 11 finding.
