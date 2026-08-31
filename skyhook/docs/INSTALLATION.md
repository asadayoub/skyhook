# Skyhook Installation Guide

## Overview

Skyhook is a universal project intelligence skill for AI agents. It provides persistent, structured, version-controlled project understanding via a `.skyhook/` directory with plain Markdown/YAML files.

**Repository:** https://github.com/asadayoub/skyhook  
**Latest Release:** https://github.com/asadayoub/skyhook/releases/latest

---

## Quick Start

### Option 1: One-Line Installer (Recommended)

```bash
# macOS/Linux/WSL
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash

# Add to PATH
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify
skyhook version
```

### Option 2: Download Release (No Git Required)

```bash
mkdir -p ~/.skyhook
curl -fsSL https://github.com/asadayoub/skyhook/releases/latest/download/skyhook-skill.tar.gz | tar -xz -C ~/.skyhook
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Option 3: Git Clone

```bash
git clone https://github.com/asadayoub/skyhook.git ~/.skyhook/skill
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Option 4: Specific Version

```bash
curl -fsSL https://github.com/asadayoub/skyhook/releases/download/v1.2.0/skyhook-skill.tar.gz | tar -xz -C ~/.skyhook
```

---

## Requirements

- **Node.js 18+** (for CLI and dashboard)
- **Git** (for version control of `.skyhook/`)
- **An AI agent** that supports file system access (Codex, Claude Code, Gemini CLI, GitHub Copilot, or any custom agent)

---

## Supported AI Agents

| Agent | Integration Method | Setup Command |
|-------|-------------------|---------------|
| **Codex** | Skill system / AGENTS.md | `skyhook setup codex` |
| **Claude Code** | Native slash commands | `skyhook setup claude` |
| **Gemini CLI** | Function calling | `skyhook setup gemini` |
| **GitHub Copilot** | VS Code tasks + instructions | `skyhook setup copilot` |
| **Generic/Universal** | JSON stdio protocol | `skyhook setup all` |

---

## Verification

After installation, verify Skyhook works:

```bash
# Check CLI
skyhook version
# Output: Skyhook CLI v1.2.0

# In a project
cd your-project
skyhook init
skyhook discover
```

---

## Directory Structure

### After Global Install (`~/.skyhook/skill/`)
```
~/.skyhook/
└── skill/                 # Skyhook skill (this repo)
    ├── SKILL.md          # Skill manifest
    ├── plugin.json       # Plugin metadata
    ├── index.md          # Main documentation
    ├── agent-protocol.md # Agent integration protocol
    ├── question-engine.md
    ├── schemas/          # YAML schemas (6)
    ├── standards/        # Built-in standards (6)
    ├── profiles/         # Project-type profiles (6 + variants)
    ├── templates/        # Project templates
    ├── workflows/        # Lifecycle workflows
    ├── cli/              # CLI tool (skyhook.js)
    ├── commands/         # Slash commands (skyhook-cmd)
    ├── lib/              # Inference engine
    ├── dashboard/        # Web dashboard
    ├── agent-integrations/ # Agent setup guides
    ├── docs/             # Architecture, installation
    └── examples/         # Example workflows
```

### After Project Init (`.skyhook/`)
```
your-project/
├── .skyhook/             # Project state (COMMIT TO GIT!)
│   ├── project.yaml
│   ├── context.md
│   ├── vision.md
│   ├── requirements/
│   │   ├── functional.yaml
│   │   ├── non-functional.yaml
│   │   └── constraints.yaml
│   ├── decisions/
│   │   ├── index.yaml
│   │   └── *.md          # Auto-generated ADRs
│   ├── backlog/
│   │   └── epics.yaml    # Epics, stories, tasks (WSJF)
│   ├── tech-stack.yaml
│   ├── ux/
│   │   └── styleguide.md
│   ├── standards/        # Project-specific overrides
│   ├── plan/             # Generated plans
│   └── changelog.md      # Full history
└── your-code/
```

---

## Configuration

### Project Config (`.skyhook/project.yaml`)

Created automatically during `skyhook init`. Key settings:

```yaml
configuration:
  questionThreshold: "contextual"  # minimal | contextual | comprehensive
  autoPlan: true                   # Auto-generate plan after changes
  standardsLevel: "advisory"       # advisory | strict | custom
  trackDecisions: true             # Record architectural decisions
  syncOnCommit: false              # Run sync on git commit
```

### Agent-Specific Setup

Run after `skyhook init` in your project:

```bash
# Configure all agents at once
skyhook setup all

# Or individually
skyhook setup codex      # Creates .codex/agents.md
skyhook setup claude     # Creates .claude/commands/skyhook-*.md
skyhook setup gemini     # Creates .gemini/functions/skyhook.js + settings.json
skyhook setup copilot    # Creates .github/copilot-instructions.md + .vscode/tasks.json
```

---

## Updating Skyhook

```bash
# Via installer (gets latest main)
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash

# Or specific version
curl -fsSL https://github.com/asadayoub/skyhook/releases/download/v1.2.0/skyhook-skill.tar.gz | tar -xz -C ~/.skyhook

# Or git pull if cloned
cd ~/.skyhook/skill && git pull
```

---

## Uninstalling

```bash
# Global install
rm -rf ~/.skyhook/skill

# Remove PATH entry from ~/.zshrc / ~/.bashrc
# Note: .skyhook/ (project state) is preserved in each project
```

---

## Troubleshooting

### "skyhook: command not found"

Add to PATH:
```bash
# Add to ~/.zshrc or ~/.bashrc or ~/.config/fish/config.fish
export PATH="$HOME/.skyhook/skill/cli:$PATH"
source ~/.zshrc
```

Or use npx-style direct invocation:
```bash
~/.skyhook/skill/cli/skyhook.js version
```

### "No Skyhook project found"

Run `skyhook init` in your project root.

### Agent doesn't detect Skyhook

1. Ensure `.skyhook/` exists in project root
2. Check agent's working directory matches project root
3. Verify agent has file system access to `.skyhook/`
4. Run `skyhook setup <agent>` to create agent config files
5. Restart the agent

### Schema validation errors

If you edit `.skyhook/` files manually:
- Check schema version matches (currently 1.0.0)
- Validate required fields
- Run `skyhook sync` to check for issues

### Dashboard won't start

```bash
# Check if port 4343 is in use
lsof -i :4343

# Kill existing process
pkill -f "skyhook.*dashboard"

# Try again
skyhook-cmd dashboard start
```

---

## Next Steps

1. **Initialize a project**: `cd your-project && skyhook init`
2. **Run discovery**: `skyhook discover` (interactive requirements gathering)
3. **Configure agents**: `skyhook setup all`
4. **Try slash commands**: `echo '{"command":"getNextTask","args":{}}' | skyhook-cmd`
5. **Start dashboard**: `skyhook-cmd dashboard start` → open http://localhost:4343
6. **Customize**: Override standards in `.skyhook/standards/`
7. **Extend**: Add custom profiles in `.skyhook/profiles/`

---

## Resources

- **Repository:** https://github.com/asadayoub/skyhook
- **Documentation:** https://github.com/asadayoub/skyhook/tree/main/skyhook/docs
- **Issues:** https://github.com/asadayoub/skyhook/issues
- **Discussions:** https://github.com/asadayoub/skyhook/discussions
- **Releases:** https://github.com/asadayoub/skyhook/releases
- **Agent Integration Guides:** https://github.com/asadayoub/skyhook/tree/main/skyhook/agent-integrations

---

## License

MIT — see [LICENSE](../../LICENSE)
