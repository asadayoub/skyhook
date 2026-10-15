# Skyhook + Gemini CLI Integration

Skyhook provides seamless function calling integration for the **Google Gemini CLI** via its offline JSON-RPC stdio protocol (`skyhook-cmd`).

---

## 1. Quick Setup

```bash
# 1. Install Skyhook globally
npm install -g @skyhook/cli

# 2. In your project
cd your-project
skyhook init
```

---

## 2. Gemini CLI Function Calling Bridge

Create `.gemini/functions/skyhook.js` in your workspace:

```javascript
// Skyhook function calling adapter for Gemini CLI
// Save as .gemini/functions/skyhook.js

const { spawn } = require('child_process');

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

// Function declarations for Gemini Tool Calling
const functions = {
  skyhook_claim_task: {
    description: 'Claim the next ready task or specific task with an advisory lease',
    parameters: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'Agent identifier claiming task' },
        taskId: { type: 'string', description: 'Optional specific task ID' },
        level: { type: 'string', enum: ['task', 'story', 'any'], description: 'Hierarchy level' }
      },
      required: ['assignee']
    },
    execute: (args) => runSkyhook('claimTask', args)
  },

  skyhook_heartbeat_lease: {
    description: 'Extend active task lease duration during long-running operations',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Task or story ID' },
        agentId: { type: 'string', description: 'Agent identifier holding lease' },
        extendMinutes: { type: 'number', description: 'Minutes to extend' }
      },
      required: ['itemId', 'agentId']
    },
    execute: (args) => runSkyhook('heartbeatLease', args)
  },

  skyhook_list_features: {
    description: 'List all features with status, stories, tasks, and blockers',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'backlog', 'in-progress', 'done', 'blocked'] }
      }
    },
    execute: (args) => runSkyhook('listCurrentFeatures', args)
  },

  skyhook_record_decision: {
    description: 'Record an architectural decision and generate an enforceable ADR',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the architectural decision' },
        decision: { type: 'string', description: 'The decision reached' },
        context: { type: 'string', description: 'Why the decision was made' },
        category: { type: 'string', enum: ['architecture', 'technology', 'security', 'data'] }
      },
      required: ['title', 'decision', 'context']
    },
    execute: (args) => runSkyhook('recordDecision', args)
  },

  skyhook_trace: {
    description: 'Trace a requirement to implementing source code symbols and user stories',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Requirement ID (e.g. REQ-001)' }
      },
      required: ['id']
    },
    execute: (args) => runSkyhook('trace', args)
  },

  skyhook_sync: {
    description: 'Check for codebase drift against declared architecture and ADR policies',
    parameters: { type: 'object', properties: {} },
    execute: () => runSkyhook('sync', {})
  }
};

module.exports = { functions, runSkyhook };
```

---

## 3. Usage Example

Start an interactive Gemini session:
```bash
gemini --functions=.gemini/functions/skyhook.js
```

Prompts to try:
- *"Claim the next ready task for agent Gemini"*
- *"Trace requirement REQ-001 across the codebase"*
- *"Check for architectural drift and circular dependencies"*
- *"Record a decision to standardize on Argon2id for password hashing"*
- *"Start the dashboard and give me the URL"* (launches at [http://127.0.0.1:31415](http://127.0.0.1:31415))
