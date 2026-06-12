# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.3.0] - 2026-06-12

### Changed
- Redesigned panel layout: composer is now pinned to the bottom with a send/stop button, model switcher, settings cog, terminal handoff, and context meter on one rail
- Empty state shows a centered CalmUI logo with prompt suggestions

### Fixed
- Model switcher and context meter no longer appear empty on panel load (webview boot race — the host now waits for the webview before sending its state)
- Context meter updates after every turn, including failed ones
- Settings icon is now a recognizable cog

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
