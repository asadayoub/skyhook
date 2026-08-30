# Skyhook — Universal Project Intelligence for AI Agents

Persistent, structured, version-controlled project understanding via `.skyhook/` directory.

## 🚀 Quick Install

```bash
# One-liner (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/yourname/skyhook/main/install.sh | bash

# Or with npm
npm install -g @skyhook/skill

# Or download release
curl -fsSL https://github.com/yourname/skyhook/releases/latest/download/skyhook-skill.tar.gz | tar -xz -C ~/.skyhook
```

Then add to PATH:
```bash
export PATH="$HOME/.skyhook/skill/cli:$PATH"
```

## 🎯 Usage

```bash
# Initialize in any project
cd my-project
skyhook init              # Auto-detects project type (web-app, api, cli, saas, etc.)
skyhook discover          # Interactive requirements gathering

# Slash commands for AI agents (via stdio JSON)
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
echo '{"command":"listCurrentFeatures","args":{}}' | skyhook-cmd
echo '{"command":"recordDecision","args":{"title":"Use Redis","decision":"...","context":"..."}}' | skyhook-cmd
```

## 🤖 Agent Integration

**Codex / Claude Code / Gemini CLI** — invoke via stdin/stdout JSON:
```json
{"command": "getNextTask", "args": {}}
```

Returns structured data for planning, tracking, and execution.

## 📁 Project Structure

```
.skyhook/
├── project.yaml          # Metadata & config
├── context.md            # Project background
├── vision.md             # Product vision
├── requirements/         # Structured requirements
├── decisions/            # ADRs (auto-generated)
├── backlog/              # Epics, stories, tasks (WSJF)
├── tech-stack.yaml       # Technology choices
├── ux/                   # Design system
└── changelog.md          # History
```

## ✨ Features

- **Zero deps** — Pure Node.js, no external dependencies
- **Local-only** — No server, network, or daemon
- **Agent-agnostic** — Works with any AI via stdio JSON
- **Git-friendly** — All files plain text, diffable
- **Auto-ADR** — One command → complete architecture decision record
- **Traceability** — `@skyhook-implements REQ-001` → trace/impact/untraced
- **Inference engine** — Auto-detects stack from package.json, configs
- **On-demand dashboard** — `skyhook-cmd dashboard start` (port 4343)
