# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
