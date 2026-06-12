# CalmUI for Antigravity CLI

A calm, lightweight quick-ask side panel for the Antigravity CLI (`agy`) inside VS Code–compatible editors.

![CalmUI panel](docs/screenshot.png)
<!-- TODO: replace with real screenshot before marketplace listing -->

> **Unofficial.** Not affiliated with, endorsed by, or sponsored by Google. "Antigravity" is a Google product name; this is a third-party companion named descriptively under nominative fair use.

## Features

- **Quick-ask panel** in the activity bar — press **Ctrl+Shift+A** (Cmd+Shift+A on Mac) to focus
- **Streamed responses** from `agy -p` over a real pseudo-terminal — agy only emits output to a TTY
- **Conversation history** — past conversations are saved per workspace; reopen any of them from the history button in the top bar (resumes via `--conversation <id>`)
- **New chat** button in the top bar
- **Model switcher** in the bottom bar — pick between Gemini 3.5 Flash (Low/Medium/High) and Gemini 3.1 Pro, or agy's default (writes the `calmui-agy.model` setting)
- **Context usage estimate** in the bottom bar (≈ tokens used vs. the 1M window — an estimate; agy doesn't report usage in headless mode)
- **Settings shortcut** (gear icon) in the bottom bar
- **Markdown rendering** of agy responses
- **Cancel in-flight prompts** without restarting
- **Guided onboarding** when agy is missing, plus `CalmUI: Run Diagnostics` command (binary detection, version, resolved path, auth probe)
- **One-click "Open in Terminal" handoff** — prefills your prompt into a full interactive agy session (never auto-runs)

## Requirements

- **Antigravity CLI (`agy`)** installed and signed in (see [antigravity.google](https://antigravity.google))
- **VS Code ≥ 1.93** or any compatible editor (e.g., Antigravity IDE)
- Windows, macOS, or Linux

## Install

No marketplace listing yet — install via VSIX sideload:

1. Download the `.vsix` file from [GitHub Releases](https://github.com/samshennan/calmui-for-antigravity-cli/releases).
2. **In VS Code:** Open the Extensions view, click the ⋯ menu, select "Install from VSIX…", and choose the file.
   - **Command line:** `code --install-extension calmui-for-antigravity-cli-0.1.0.vsix`
   - **Antigravity IDE:** Use the Extensions UI (CLI command may differ).
3. Reload the editor. Click the CalmUI icon in the activity bar to open the panel.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `calmui-agy.agyPath` | `agy` | Absolute path to the agy CLI binary. Leave as `agy` to resolve from `PATH`. Windows default: `%LOCALAPPDATA%\agy\bin\agy.exe` |
| `calmui-agy.model` | *(empty)* | Model override passed as `--model` on each prompt. Leave empty to use agy's default. Also settable from the model dropdown in the panel. |
| `calmui-agy.includeDirectories` | `[]` | Extra folders outside the workspace that agy can read. Passed as `--add-dir` on every prompt. Use absolute paths. |
| `calmui-agy.printTimeoutSeconds` | `120` | Timeout for a single quick-ask prompt, passed as `--print-timeout`. The agy default is 5 minutes. |

## Philosophy

CalmUI is a **quick-ask companion**, not a full orchestration shell. The panel is optimized for fast, focused interactions:

- Use the panel for **quick questions and small tasks**.
- For **long-running work, approvals, or complex orchestration**, the panel recommends a handoff to the terminal — that's where agy's full power lives.
- The terminal stays the source of truth for advanced agent workflows.

## Development

Clone the repo and install dependencies:

```bash
npm install
npm run build
npm test
npm run package  # Produces the .vsix file
```

Design and planning docs live in the repo:
- `ARCHITECTURE.md` — module map and transport contract
- `BUILD-PLAN.md` — phased rollout and acceptance criteria

## License

MIT
