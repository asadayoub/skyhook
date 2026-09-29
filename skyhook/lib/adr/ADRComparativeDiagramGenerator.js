/**
 * ADRComparativeDiagramGenerator - Generates "Before vs After" Architectural Visual Diffs
 * Produces dual-state Mermaid flowcharts depicting the structural mutation introduced by an ADR.
 * Highlights additions (green), removals/deprecations (red), and modifications (amber).
 */

import fs from 'fs';
import path from 'path';

/**
 * Sanitize node identifiers for Mermaid
 * @param {string} id 
 * @returns {string}
 */
function cleanId(id) {
  return `comp_${(id || 'node').replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * Sanitize label text for Mermaid
 * @param {string} text 
 * @returns {string}
 */
function sanitize(text) {
  return (text || '').replace(/["<>{}|#&]/g, '').trim();
}

/**
 * Detect architecture transition patterns from decision text and context
 * @param {Object} decisionData 
 * @param {Object} [projectContext] 
 * @returns {Object} { before: Array, after: Array, removed: Array, added: Array, modified: Array }
 */
export function inferArchitecturalDiff(decisionData, projectContext = {}) {
  const text = `${decisionData.title || ''} ${decisionData.decision || ''} ${decisionData.context || ''}`.toLowerCase();

  // Explicit diff provided in decisionData
  if (decisionData.diff) {
    const added = decisionData.diff.added || [];
    const removed = decisionData.diff.removed || [];
    const modified = decisionData.diff.modified || [];
    const unchanged = decisionData.diff.unchanged || [];

    const before = [
      ...unchanged.map(c => ({ id: c, name: c, status: 'unchanged' })),
      ...modified.map(c => ({ id: c, name: `${c} (Old)`, status: 'modified' })),
      ...removed.map(c => ({ id: c, name: c, status: 'removed' }))
    ];

    const after = [
      ...unchanged.map(c => ({ id: c, name: c, status: 'unchanged' })),
      ...modified.map(c => ({ id: c, name: `${c} (Updated)`, status: 'modified' })),
      ...added.map(c => ({ id: c, name: c, status: 'added' }))
    ];

    return { before, after, removed, added, modified };
  }

  // 1. API Evolution: REST -> GraphQL / tRPC / gRPC
  if ((text.includes('graphql') || text.includes('trpc') || text.includes('grpc')) && (text.includes('rest') || text.includes('api gateway') || text.includes('replace rest'))) {
    const targetTech = text.includes('graphql') ? 'GraphQL Gateway & Schema' : (text.includes('trpc') ? 'tRPC End-to-End Router' : 'gRPC Protobuf Service');
    return {
      beforeTitle: 'REST Endpoints (Superseded)',
      afterTitle: `${targetTech} (Proposed)`,
      before: [
        { id: 'client', name: 'Web / Mobile Client', status: 'unchanged' },
        { id: 'rest_api', name: 'Multiple REST Endpoints (/users, /orders)', status: 'removed' },
        { id: 'service', name: 'Domain Services', status: 'unchanged' },
        { id: 'db', name: 'Database Persistence', status: 'unchanged' }
      ],
      after: [
        { id: 'client', name: 'Web / Mobile Client', status: 'unchanged' },
        { id: 'new_gateway', name: targetTech, status: 'added' },
        { id: 'service', name: 'Domain Services', status: 'modified' },
        { id: 'db', name: 'Database Persistence', status: 'unchanged' }
      ],
      removed: ['rest_api'],
      added: ['new_gateway'],
      modified: ['service']
    };
  }

  // 2. ORM / Database Evolution: e.g. SQLite -> PostgreSQL, or raw SQL -> Prisma/Drizzle
  if (text.includes('prisma') || text.includes('drizzle') || text.includes('postgres') || text.includes('mongodb') || text.includes('sqlite')) {
    const isPostgres = text.includes('postgres');
    const isPrisma = text.includes('prisma');
    const isDrizzle = text.includes('drizzle');
    const newDb = isPostgres ? 'PostgreSQL Cluster' : 'Modern Database';
    const newOrm = isPrisma ? 'Prisma Client & Schema' : (isDrizzle ? 'Drizzle ORM Engine' : 'Data Access Layer');

    return {
      beforeTitle: 'Legacy Data Layer',
      afterTitle: 'Modernized Persistence Architecture',
      before: [
        { id: 'app', name: 'Application Core', status: 'unchanged' },
        { id: 'legacy_data', name: 'Direct SQL / Legacy Driver', status: 'removed' },
        { id: 'legacy_db', name: 'Legacy / File DB (SQLite)', status: 'removed' }
      ],
      after: [
        { id: 'app', name: 'Application Core', status: 'modified' },
        { id: 'new_orm', name: newOrm, status: 'added' },
        { id: 'new_db', name: newDb, status: 'added' }
      ],
      removed: ['legacy_data', 'legacy_db'],
      added: ['new_orm', 'new_db'],
      modified: ['app']
    };
  }

  // 3. State Management / Store Evolution (e.g. Redux -> Zustand / TanStack Query)
  if (text.includes('zustand') || text.includes('tanstack') || text.includes('redux') || text.includes('pinia')) {
    const newStore = text.includes('zustand') ? 'Zustand Lightweight Store' : (text.includes('tanstack') ? 'TanStack Query Cache' : 'Centralized Store');
    return {
      beforeTitle: 'Boilerplate Store',
      afterTitle: 'Streamlined State Architecture',
      before: [
        { id: 'views', name: 'UI Components', status: 'unchanged' },
        { id: 'old_store', name: 'Complex Redux Boilerplate / Actions', status: 'removed' }
      ],
      after: [
        { id: 'views', name: 'UI Components', status: 'modified' },
        { id: 'new_store', name: newStore, status: 'added' }
      ],
      removed: ['old_store'],
      added: ['new_store'],
      modified: ['views']
    };
  }

  // 4. Authentication / Security Evolution (e.g. Sessions -> JWT / Clerk / Supabase)
  if (text.includes('auth') || text.includes('jwt') || text.includes('clerk') || text.includes('oauth') || text.includes('session')) {
    const newAuth = text.includes('clerk') ? 'Clerk Managed Auth' : (text.includes('oauth') ? 'OAuth 2.0 / OIDC Provider' : 'JWT Bearer Authentication');
    return {
      beforeTitle: 'Legacy Session Auth',
      afterTitle: 'Decoupled Modern Auth Flow',
      before: [
        { id: 'client', name: 'Client Browser', status: 'unchanged' },
        { id: 'old_auth', name: 'Stateful Session Store / Cookies', status: 'removed' },
        { id: 'api', name: 'Backend API Service', status: 'unchanged' }
      ],
      after: [
        { id: 'client', name: 'Client Browser', status: 'modified' },
        { id: 'new_auth', name: newAuth, status: 'added' },
        { id: 'api', name: 'Backend API (Stateless Validation)', status: 'modified' }
      ],
      removed: ['old_auth'],
      added: ['new_auth'],
      modified: ['client', 'api']
    };
  }

  // 5. Default Generic Architecture Evolution
  const title = sanitize(decisionData.title || 'Architectural Component');
  return {
    beforeTitle: 'Current Architecture (Baseline)',
    afterTitle: `Proposed Target: ${title}`,
    before: [
      { id: 'client', name: 'Clients / Callers', status: 'unchanged' },
      { id: 'current_pattern', name: 'Legacy / Existing Pattern', status: 'removed' },
      { id: 'downstream', name: 'Downstream Resources', status: 'unchanged' }
    ],
    after: [
      { id: 'client', name: 'Clients / Callers', status: 'unchanged' },
      { id: 'new_pattern', name: `${title} Implementation`, status: 'added' },
      { id: 'downstream', name: 'Downstream Resources', status: 'modified' }
    ],
    removed: ['current_pattern'],
    added: ['new_pattern'],
    modified: ['downstream']
  };
}

/**
 * Generate a complete "Before vs After" comparative Mermaid flowchart
 * @param {Object} decisionData 
 * @param {Object} [projectContext] 
 * @param {Object} [options]
 * @returns {string} Fenced Mermaid markdown block
 */
export function generateComparativeDiagram(decisionData, projectContext = {}, options = {}) {
  const diff = inferArchitecturalDiff(decisionData, projectContext);

  const beforeTitle = sanitize(options.beforeTitle || diff.beforeTitle || 'Before: Current Architecture');
  const afterTitle = sanitize(options.afterTitle || diff.afterTitle || 'After: Proposed Architecture');

  const lines = [
    '```mermaid',
    'flowchart LR',
    '    %% Architectural Mutation Visual Diff: Before vs After',
    ''
  ];

  // 1. Subgraph Before
  lines.push(`    subgraph SubgraphBefore["⏮️ ${beforeTitle}"]`);
  lines.push('        direction TB');
  for (let i = 0; i < diff.before.length; i++) {
    const comp = diff.before[i];
    const nid = `b_${cleanId(comp.id)}`;
    const label = sanitize(comp.name);
    lines.push(`        ${nid}["${label}"]`);
    if (i > 0) {
      const prevNid = `b_${cleanId(diff.before[i - 1].id)}`;
      lines.push(`        ${prevNid} --> ${nid}`);
    }
  }
  lines.push('    end');
  lines.push('');

  // 2. Subgraph After
  lines.push(`    subgraph SubgraphAfter["⏭️ ${afterTitle}"]`);
  lines.push('        direction TB');
  for (let i = 0; i < diff.after.length; i++) {
    const comp = diff.after[i];
    const nid = `a_${cleanId(comp.id)}`;
    const label = sanitize(comp.name);
    lines.push(`        ${nid}["${label}"]`);
    if (i > 0) {
      const prevNid = `a_${cleanId(diff.after[i - 1].id)}`;
      lines.push(`        ${prevNid} --> ${nid}`);
    }
  }
  lines.push('    end');
  lines.push('');

  // 3. Optional transition linking edge from before to after
  if (diff.before.length > 0 && diff.after.length > 0) {
    const firstBefore = `b_${cleanId(diff.before[0].id)}`;
    const firstAfter = `a_${cleanId(diff.after[0].id)}`;
    lines.push(`    ${firstBefore} -.->|"Evolution / Refactor"| ${firstAfter}`);
    lines.push('');
  }

  // 4. Styling definitions
  lines.push('    %% Visual Diff Color Palettes');
  lines.push('    classDef diffRemoved fill:#4c0519,stroke:#f43f5e,stroke-width:2px,color:#ffe4e6,stroke-dasharray: 4 4;');
  lines.push('    classDef diffAdded fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;');
  lines.push('    classDef diffModified fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;');
  lines.push('    classDef diffUnchanged fill:#1e293b,stroke:#475569,stroke-width:1px,color:#f1f5f9;');

  // 5. Apply styling classes
  for (const comp of diff.before) {
    const nid = `b_${cleanId(comp.id)}`;
    if (comp.status === 'removed') lines.push(`    class ${nid} diffRemoved;`);
    else if (comp.status === 'modified') lines.push(`    class ${nid} diffModified;`);
    else lines.push(`    class ${nid} diffUnchanged;`);
  }

  for (const comp of diff.after) {
    const nid = `a_${cleanId(comp.id)}`;
    if (comp.status === 'added') lines.push(`    class ${nid} diffAdded;`);
    else if (comp.status === 'modified') lines.push(`    class ${nid} diffModified;`);
    else lines.push(`    class ${nid} diffUnchanged;`);
  }

  lines.push('```');

  return lines.join('\n');
}
