# Skyhook + Gemini CLI Integration

## Quick Setup

```bash
# 1. Install Skyhook (one-time)
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 2. In your project
cd your-project
skyhook init
skyhook discover
```

## Gemini CLI Function Calling

Create `.gemini/functions/skyhook.js`:

```javascript
// Skyhook functions for Gemini CLI
// Save as .gemini/functions/skyhook.js

const { spawn } = require('child_process');
const path = require('path');

function runSkyhook(command, args = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('skyhook-cmd', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    const input = JSON.stringify({ command, args });
    proc.stdin.write(input);
    proc.stdin.end();
    
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    
    proc.on('close', code => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout)); }
        catch { resolve(stdout); }
      } else {
        reject(new Error(stderr || `Exit code ${code}`));
      }
    });
  });
}

// Function declarations for Gemini
const functions = {
  skyhook_list_features: {
    description: 'List all features with status, stories, and blockers',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'backlog', 'in-progress', 'done', 'blocked'], description: 'Filter by status' }
      }
    },
    execute: async ({ status = 'all' }) => runSkyhook('listCurrentFeatures', { status })
  },
  
  skyhook_get_next_task: {
    description: 'Get highest priority ready task with full context',
    parameters: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'Optional assignee filter' }
      }
    },
    execute: async ({ assignee }) => runSkyhook('getNextTask', { assignee })
  },
  
  skyhook_get_blockers: {
    description: 'Get all blocked items with reasons',
    parameters: { type: 'object', properties: {} },
    execute: async () => runSkyhook('getBlockers', {})
  },
  
  skyhook_trace: {
    description: 'Trace requirement to stories, decisions, and code references',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Requirement ID (e.g., REQ-001)' }
      },
      required: ['id']
    },
    execute: async ({ id }) => runSkyhook('trace', { id })
  },
  
  skyhook_impact: {
    description: 'Analyze impact of changing a requirement',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Requirement ID (e.g., REQ-001)' }
      },
      required: ['id']
    },
    execute: async ({ id }) => runSkyhook('impact', { id })
  },
  
  skyhook_untraced: {
    description: 'Find requirements with no code references',
    parameters: { type: 'object', properties: {} },
    execute: async () => runSkyhook('untraced', {})
  },
  
  skyhook_record_decision: {
    description: 'Record architectural decision (auto-generates ADR)',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        decision: { type: 'string' },
        context: { type: 'string' },
        category: { type: 'string', enum: ['architecture', 'technology', 'security', 'process', 'ux', 'software'], default: 'architecture' },
        alternatives: { type: 'array', items: { type: 'object' } },
        relatedRequirements: { type: 'array', items: { type: 'string' } },
        consequences: { type: 'string' },
        rationale: { type: 'string' }
      },
      required: ['title', 'decision', 'context']
    },
    execute: async (args) => runSkyhook('recordDecision', args)
  },
  
  skyhook_sync: {
    description: 'Check code vs documentation drift',
    parameters: { type: 'object', properties: {} },
    execute: async () => runSkyhook('sync', {})
  },
  
  skyhook_get_context: {
    description: 'Get relevant context for a topic',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic to get context for (e.g., authentication, payments)' }
      }
    },
    execute: async ({ topic = 'general' }) => runSkyhook('getContext', { topic })
  },
  
  skyhook_dashboard: {
    description: 'Control the on-demand web dashboard',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'stop', 'status'] }
      },
      required: ['action']
    },
    execute: async ({ action }) => runSkyhook('dashboard', { action })
  }
};

module.exports = { functions, runSkyhook };
```

## Gemini CLI Configuration

Add to `.gemini/settings.json`:

```json
{
  "functions": {
    "skyhook": ".gemini/functions/skyhook.js"
  },
  "permissions": {
    "allow": ["skyhook_*"]
  }
}
```

## Usage in Gemini CLI

```
> What's my next task?
# Calls skyhook_get_next_task

> Show me all blockers
# Calls skyhook_get_blockers

> Trace REQ-003
# Calls skyhook_trace with id="REQ-003"

> What's the impact of changing REQ-001?
# Calls skyhook_impact with id="REQ-001"

> Record decision: Use Redis for caching
# Calls skyhook_record_decision

> Check for drift
# Calls skyhook_sync

> Start dashboard
# Calls skyhook_dashboard with action="start"
```

## GEMINI.md Configuration

Add to your project's `GEMINI.md`:

```markdown
# Skyhook Integration

This project uses Skyhook for persistent project intelligence.

## Available Functions

- `skyhook_list_features` - List features with status
- `skyhook_get_next_task` - Get next priority task
- `skyhook_get_blockers` - Show blocked items
- `skyhook_trace` - Trace requirement to code
- `skyhook_impact` - Impact analysis
- `skyhook_untraced` - Find untraced requirements
- `skyhook_record_decision` - Record decision (auto-ADR)
- `skyhook_sync` - Check drift
- `skyhook_get_context` - Get topic context
- `skyhook_dashboard` - Control web UI

## Workflow

1. Start session: Ask "What's my next task?"
2. Understand context: Ask "Trace REQ-XXX"
3. Make decision: Ask "Record decision: ..."
4. Check drift: Ask "Check for drift"
5. Visual overview: Ask "Start dashboard"
```
