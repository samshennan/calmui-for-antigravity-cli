# CalmUI for Antigravity CLI

A calm, intentionally-light VS Code / Antigravity IDE companion for **Antigravity CLI** (`agy`) — the
terminal-first agent platform that replaces Gemini CLI as of June 2026.

This repo holds the **planning, research, and spec** for the project. The shipped extension lives in a
separate public product repo (`calmui-for-antigravity-cli`); this folder is the design/dev brain.

> **Unofficial.** Not affiliated with, endorsed by, or sponsored by Google. "Antigravity" is a Google
> product name; this extension is a third-party companion, named descriptively under nominative fair use
> (the same way the existing *Calm UI for Gemini CLI* is named).

## The goal

Build a **fast, high-clarity quick-ask side panel** for Antigravity CLI that:

- works inside Antigravity IDE / VS Code-compatible editors
- stays intentionally light and reliable for quick interactions
- does **not** overbuild around transport features that Antigravity CLI does not yet expose
- escalates heavy, approval-heavy, or long-running work to the native terminal workflow

It is a polished **quick-chat companion**, not a full orchestration shell. The terminal stays the source
of truth for advanced agent work; the panel is the fast read/ask surface beside it.

## Why now

- **Gemini CLI is being retired** (AI Pro/Ultra requests stopped June 18 2026). Antigravity CLI is the
  successor — Go-based, multi-agent, plugin/skill/hook/MCP/SDK ecosystem.
- Our existing *Calm UI for Gemini CLI* extension is **ACP-driven**, and **Antigravity CLI does not
  currently expose an ACP / JSON-RPC stdio server** (the request is open, no maintainer commitment). So
  v1 cannot be a straight port — it needs a new, thinner transport.

## What's in this folder

Start here if you're an agent: **[AGENTS.md](AGENTS.md)**.

| File | Purpose |
|------|---------|
| [AGENTS.md](AGENTS.md) | Session entry point for agents — what to read, the one rule that matters |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module map, transport contract, the node-pty risk + fallbacks |
| [BUILD-PLAN.md](BUILD-PLAN.md) | Phased tasks with acceptance criteria — **start at Phase 0.5 gate** |
| [2026-06-11-spike-results.md](2026-06-11-spike-results.md) | **Tested** findings — the transport decision lives here |
| [2026-06-11-antigravity-cli-research.md](2026-06-11-antigravity-cli-research.md) | Public capability surface of `agy`, what to work around |
| [2026-06-11-mvp-spec.md](2026-06-11-mvp-spec.md) | MVP scope, phases, exit criteria |
| [2026-06-11-logo-icon-notes.md](2026-06-11-logo-icon-notes.md) | Logo/icon direction and trademark-safety guidance |

Scaffold: `package.json`, `esbuild.mjs`, `tsconfig*.json`, `vitest.config.ts`, and `src/`
(transport interface + ANSI utils with tests + panel bridge + stubs). `media/icon.svg`
(themeable activity-bar) and `media/icon-color.svg` (brand, recoloured from black to calm teal).

## Status (2026-06-11)

- **Decision locked:** transport = node-pty wrapping `agy -p`, ANSI-stripped. SDK rejected
  (needs consumer API key, won't reuse gcp/Vertex). `agy` owns auth.
- **Scaffold committed.** Next session: **Phase 0.5** — prove node-pty in the extension host
  (go/no-go gate) before building UI. See [BUILD-PLAN.md](BUILD-PLAN.md).
- **Repo:** private locally; flip GitHub repo public when ready (Phase 4).
- **Deadline context:** Gemini-era access ended June 18 2026; consumer migration is live now.
