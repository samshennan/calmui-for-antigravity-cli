# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.4.0] - 2026-07-01

Robustness & test-hardening release. No new surface area — the internals are more
stable, and the risky logic is now backed by an automated test suite (6 → 32 tests).

### Fixed
- Multi-turn no longer silently resets when the conversation id can't be read from the shared `agy` log. It now falls back to `-c/--continue` so the thread keeps its context; an explicit `--conversation <id>` is still preferred when we have one.
- The model picker can no longer be corrupted by `agy models` output — the list is parsed defensively (leading model-id token only, headers/prose/blank lines dropped, de-duped) instead of using whole descriptive lines as `--model` values.
- The `agy` binary is now resolved once and used for both `--version` and prompts, so availability can't disagree with what actually runs.
- Questions like "how do I set file permissions in Linux" are no longer intercepted by the built-in permission explainer — it now only fires for questions about CalmUI/agy's own approval behaviour.

### Security
- The webview now uses an unpredictable per-render CSP nonce (crypto random, was a timestamp) and its resource access is restricted to `dist/` and `media/` only (was the whole extension directory). Added an `img-src` directive.
- On the rare Windows `.cmd`/`.bat` shim path, arguments are now quoted/escaped against `cmd.exe` metacharacter interpretation.

### Added
- A "Retry" action on the error card re-sends your last prompt.
- Copy the current conversation to the clipboard as Markdown from the top bar.
- A "CalmUI" Output Channel logs spawn/exit/timeout events for support.
- A React error boundary shows a recoverable card instead of a blank panel if the view ever throws.
- The transcript is an `aria-live` region so streamed replies are announced to screen readers.

### Changed
- The context meter is relabelled "≈ chat size" to make clear it's a local estimate of the conversation, not agy's real context window.

## [0.3.0] - 2026-06-12

### Changed
- Redesigned panel layout: composer is now pinned to the bottom with a send/stop button, model switcher, settings cog, terminal handoff, and context meter on one rail
- Empty state shows a centered CalmUI logo with prompt suggestions

### Fixed
- Model switcher and context meter no longer appear empty on panel load (webview boot race — the host now waits for the webview before sending its state)
- Context meter updates after every turn, including failed ones
- Settings icon is now a recognizable cog
- Security: links in agy responses are restricted to http(s)/mailto, so a model can't smuggle a `javascript:`/`data:` URL into the panel
- Cancelling a prompt now reliably stops the turn and discards its late result instead of posting it as complete
- A second prompt can no longer start while one is in flight (single-flight guard), and an in-flight prompt survives the panel being hidden and reshown
- Conversation-id detection ignores ambiguous matches when another agy process writes to the shared log, and caps how much log it scans
- Conversation history writes are awaited and de-duplicated on load

## [0.2.0] - 2026-06-12

### Added

- Top bar with conversation history (per-workspace, resumable) and New chat
- Bottom bar: model switcher (verified models: Gemini 3.5 Flash Low/Medium/High, Gemini 3.1 Pro), settings shortcut, estimated context usage meter
- Transcript now survives hiding/reshowing the panel (host-side hydration)

### Changed

- "New conversation" moved from inline buttons to the top bar

### Fixed

- Selecting an unavailable model no longer yields a silent empty reply — it now shows an actionable error

## [0.1.0] - 2026-06-12

### Added

- Quick-ask panel in the activity bar with Ctrl+Shift+A / Cmd+Shift+A keybinding
- Streamed responses from `agy -p` over a real pseudo-terminal (node-pty)
- Multi-turn conversations with automatic `--conversation <id>` threading
- New Conversation button to reset the thread
- Markdown rendering of agy responses
- Cancel in-flight prompts
- Guided onboarding when agy is missing
- `CalmUI: Run Diagnostics` command (binary detection, version, resolved path, auth probe)
- `CalmUI: Open Antigravity Terminal` handoff that prefills the prompt (never auto-runs)
- Settings: `calmui-agy.agyPath`, `calmui-agy.model`, `calmui-agy.includeDirectories`, `calmui-agy.printTimeoutSeconds`

### Fixed

- Windows: resolve absolute agy path for conpty (node-pty) — fixes "File not found" on send
