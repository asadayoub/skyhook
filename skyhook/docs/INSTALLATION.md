# Skyhook Installation Guide

## Overview

Skyhook is a universal project intelligence skill for AI agents. It can be installed globally (available across all projects) or per-project.

## Quick Start

### Option 1: Global Installation (Recommended)

```bash
# Clone or download Skyhook
git clone https://github.com/skyhook/skyhook.git ~/.skyhook/skill

# Or use the CLI to install
npx skyhook install --global
```

Then configure your AI agent to use Skyhook:

**Codex**: Add to `~/.codex/instructions.md`:
```markdown
## Skyhook
Use the Skyhook skill from ~/.skyhook/skill for project intelligence.
```

**Claude Code**: Add to `CLAUDE.md`:
```markdown
## Skyhook
This project uses Skyhook. Reference ~/.skyhook/skill/SKILL.md for protocol.
```

**Gemini CLI**: 
```bash
gemini --skill ~/.skyhook/skill
```

### Option 2: Per-Project Installation

```bash
cd your-project
npx skyhook install
```

This creates `.skyhook/skill/` in your project.

## Requirements

- Node.js 18+ (for CLI)
- Git (for version control of `.skyhook/`)
- An AI agent that supports file system access

## Supported AI Agents

| Agent | Integration Method |
|-------|-------------------|
| **Codex** | Skill system or instructions.md |
| **Claude Code** | CLAUDE.md reference or subagent |
| **Gemini CLI** | @skyhook reference or --skill flag |
| **Antigravity** | Skill manifest |
| **Generic** | File-based protocol (read .skyhook/) |

## Verification

After installation, verify Skyhook works:

```bash
# Check CLI
skyhook version

# In a project
cd your-project
skyhook init
skyhook discover
```

## Directory Structure

After global install:
```
~/.skyhook/
├── skill/                 # Skyhook skill (this repo)
│   ├── SKILL.md          # Skill manifest
│   ├── plugin.json       # Plugin metadata
│   ├── index.md          # Main documentation
│   ├── agent-protocol.md # Agent integration protocol
│   ├── schemas/          # YAML schemas
│   ├── standards/        # Built-in standards
│   ├── profiles/         # Project-type profiles
│   ├── templates/        # Project templates
│   ├── workflows/        # Lifecycle workflows
│   ├── cli/              # CLI tool
│   └── examples/         # Example workflows
├── config.yaml           # Global configuration
└── cache/                # Internal cache
```

After project init:
```
your-project/
├── .skyhook/             # Project state (commit to git!)
│   ├── project.yaml
│   ├── context.md
│   ├── vision.md
│   ├── requirements/
│   ├── decisions/
│   ├── backlog/
│   ├── tech-stack.yaml
│   ├── ux/
│   ├── standards/
│   ├── plan/
│   └── changelog.md
└── .skyhook/skill/       # Only if per-project install
```

## Configuration

### Global Config (`~/.skyhook/config.yaml`)

```yaml
defaults:
  projectType: "web-app"
  questionThreshold: "contextual"
  autoPlan: true
  standardsLevel: "advisory"

profiles:
  # Custom profile overrides

integrations:
  git: true
  github: false
  linear: false
  jira: false
```

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

## Updating Skyhook

```bash
# Global
cd ~/.skyhook/skill && git pull

# Per-project
cd your-project/.skyhook/skill && git pull

# Or reinstall
skyhook install --global --force
```

## Uninstalling

```bash
# Global
rm -rf ~/.skyhook/skill

# Per-project
rm -rf your-project/.skyhook/skill
# Note: .skyhook/ (project state) is preserved
```

## Troubleshooting

### "skyhook: command not found"

Add to PATH:
```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$HOME/.skyhook/skill/cli:$PATH"
```

Or use npx:
```bash
npx skyhook version
```

### "No Skyhook project found"

Run `skyhook init` in your project root.

### Agent doesn't detect Skyhook

1. Ensure `.skyhook/` exists in project root
2. Check agent's working directory matches project root
3. Verify agent has file system access to `.skyhook/`
4. Check agent-specific integration (see examples/)

### Schema validation errors

Skyhook uses YAML schemas. If you edit files manually:
- Check schema version matches
- Validate required fields
- Run `skyhook sync` to check for issues

## Next Steps

1. **Read the Agent Protocol**: `~/.skyhook/skill/agent-protocol.md`
2. **Review Standards**: `~/.skyhook/skill/standards/`
3. **Try a Project**: `skyhook init` in a new or existing project
4. **Customize**: Override standards in `.skyhook/standards/`
5. **Extend**: Add custom profiles in `.skyhook/profiles/`

## Resources

- **Documentation**: https://github.com/skyhook/skyhook/docs
- **Issues**: https://github.com/skyhook/skyhook/issues
- **Discussions**: https://github.com/skyhook/skyhook/discussions
- **Changelog**: https://github.com/skyhook/skyhook/releases
