/**
 * ADRSupersessionEngine - Architectural Decision Lifecycle & Supersession DAG Engine
 * Manages formal decision state transitions (draft ➔ under-review ➔ accepted ➔ superseded ➔ deprecated),
 * executes automated bidirectional supersession cascades with warning banner injection,
 * and generates Mermaid Decision Evolution DAGs.
 */

import fs from 'fs';
import path from 'path';
import { readYaml, writeYaml, getTimestamp } from '../utils.js';

export const ADR_STATUSES = {
  DRAFT: 'draft',
  UNDER_REVIEW: 'under-review',
  ACCEPTED: 'accepted',
  SUPERSEDED: 'superseded',
  REJECTED: 'rejected',
  DEPRECATED: 'deprecated'
};

const ALLOWED_TRANSITIONS = {
  [ADR_STATUSES.DRAFT]: [ADR_STATUSES.UNDER_REVIEW, ADR_STATUSES.ACCEPTED, ADR_STATUSES.REJECTED],
  [ADR_STATUSES.UNDER_REVIEW]: [ADR_STATUSES.ACCEPTED, ADR_STATUSES.REJECTED, ADR_STATUSES.DRAFT],
  [ADR_STATUSES.ACCEPTED]: [ADR_STATUSES.SUPERSEDED, ADR_STATUSES.DEPRECATED, ADR_STATUSES.UNDER_REVIEW],
  [ADR_STATUSES.SUPERSEDED]: [ADR_STATUSES.ACCEPTED], // allowed only with force/override
  [ADR_STATUSES.REJECTED]: [ADR_STATUSES.DRAFT],
  [ADR_STATUSES.DEPRECATED]: [ADR_STATUSES.SUPERSEDED, ADR_STATUSES.ACCEPTED]
};

export class ADRSupersessionEngine {
  /**
   * @param {string} skyhookDir - Path to .skyhook directory
   * @param {string} [projectDir] - Workspace root directory
   */
  constructor(skyhookDir, projectDir = process.cwd()) {
    this.skyhookDir = path.resolve(skyhookDir);
    this.projectDir = path.resolve(projectDir);
    this.decisionsDir = path.join(this.skyhookDir, 'decisions');
    this.recordsDir = path.join(this.decisionsDir, 'records');
    this.indexPath = path.join(this.decisionsDir, 'index.yaml');
  }

  /**
   * Read the decisions master index
   * @returns {Object}
   */
  readIndex() {
    if (!fs.existsSync(this.indexPath)) {
      return { schemaVersion: '1.0.0', decisions: [] };
    }
    const data = readYaml(this.indexPath) || { schemaVersion: '1.0.0', decisions: [] };
    if (!Array.isArray(data.decisions)) data.decisions = [];
    return data;
  }

  /**
   * Write updated decisions index
   * @param {Object} indexData 
   */
  writeIndex(indexData) {
    writeYaml(this.indexPath, indexData);
  }

  /**
   * Resolve file path for a decision
   * @param {string} decisionId 
   * @param {Object} [decisionEntry] 
   * @returns {string|null}
   */
  resolveRecordFilePath(decisionId, decisionEntry = null) {
    if (decisionEntry && decisionEntry.file) {
      const p = path.join(this.skyhookDir, decisionEntry.file);
      if (fs.existsSync(p)) return p;
    }

    const directPath = path.join(this.recordsDir, `${decisionId}.md`);
    if (fs.existsSync(directPath)) return directPath;

    // Scan records directory for files containing ID
    if (fs.existsSync(this.recordsDir)) {
      const files = fs.readdirSync(this.recordsDir);
      for (const file of files) {
        if (file.includes(decisionId) && file.endsWith('.md')) {
          return path.join(this.recordsDir, file);
        }
      }
    }

    return null;
  }

  /**
   * Transition decision status through the state machine
   * @param {string} decisionId 
   * @param {string} targetStatus 
   * @param {Object} [options]
   * @returns {Object}
   */
  transitionStatus(decisionId, targetStatus, options = {}) {
    const normTarget = (targetStatus || '').toLowerCase().trim();
    const validStatuses = Object.values(ADR_STATUSES);

    if (!validStatuses.includes(normTarget)) {
      throw new Error(`Invalid ADR status '${targetStatus}'. Allowed: ${validStatuses.join(', ')}`);
    }

    const indexData = this.readIndex();
    const entry = indexData.decisions.find(d => d.id === decisionId);

    if (!entry) {
      throw new Error(`Decision with ID '${decisionId}' not found in index.`);
    }

    const currentStatus = (entry.status || ADR_STATUSES.DRAFT).toLowerCase();

    // Check transition validity
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(normTarget) && !options.force) {
      throw new Error(`Illegal ADR status transition from '${currentStatus}' to '${normTarget}'. Allowed: ${allowed.join(', ') || 'none'}. Use --force to override.`);
    }

    entry.status = normTarget;
    entry.updatedAt = getTimestamp();

    if (options.reason) {
      entry.statusReason = options.reason;
    }

    // Update markdown file on disk
    const filePath = this.resolveRecordFilePath(decisionId, entry);
    if (filePath && fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf-8');

      // Update status header: **Status**: ...
      if (/\*\*Status\*\*:\s*[^\n\r]+/i.test(content)) {
        content = content.replace(/\*\*Status\*\*:\s*[^\n\r]+/i, `**Status**: ${normTarget}`);
      } else {
        // Prepend status if missing
        content = content.replace(/^(#\s+[^\n\r]+\n)/, `$1\n**Status**: ${normTarget}\n`);
      }

      fs.writeFileSync(filePath, content, 'utf-8');
    }

    this.writeIndex(indexData);

    return {
      success: true,
      decisionId,
      oldStatus: currentStatus,
      newStatus: normTarget,
      title: entry.title
    };
  }

  /**
   * Execute bidirectional supersession cascade
   * @param {string} oldId - ID of decision being superseded
   * @param {string} newId - ID of superseding decision
   * @param {Object} [options]
   * @returns {Object}
   */
  supersede(oldId, newId, options = {}) {
    if (oldId === newId) {
      throw new Error('A decision cannot supersede itself.');
    }

    const indexData = this.readIndex();
    const oldEntry = indexData.decisions.find(d => d.id === oldId);
    const newEntry = indexData.decisions.find(d => d.id === newId);

    if (!oldEntry) throw new Error(`Superseded decision '${oldId}' not found.`);
    if (!newEntry) throw new Error(`Superseding decision '${newId}' not found.`);

    const now = getTimestamp();

    // 1. Update Old Decision metadata & index
    oldEntry.status = ADR_STATUSES.SUPERSEDED;
    oldEntry.supersededBy = newId;
    oldEntry.updatedAt = now;

    // 2. Update New Decision metadata & index
    newEntry.supersedes = oldId;
    newEntry.updatedAt = now;

    // 3. Update Old Markdown file with warning banner
    const oldFilePath = this.resolveRecordFilePath(oldId, oldEntry);
    if (oldFilePath && fs.existsSync(oldFilePath)) {
      let oldContent = fs.readFileSync(oldFilePath, 'utf-8');

      // Update status line
      if (/\*\*Status\*\*:\s*[^\n\r]+/i.test(oldContent)) {
        oldContent = oldContent.replace(/\*\*Status\*\*:\s*[^\n\r]+/i, `**Status**: ${ADR_STATUSES.SUPERSEDED}`);
      }

      // Add or update **Superseded By**
      if (/\*\*Superseded By\*\*:\s*[^\n\r]+/i.test(oldContent)) {
        oldContent = oldContent.replace(/\*\*Superseded By\*\*:\s*[^\n\r]+/i, `**Superseded By**: [${newEntry.title || newId}](${newId}.md)`);
      } else {
        oldContent = oldContent.replace(/(\*\*Status\*\*:[^\n\r]+\n)/i, `$1**Superseded By**: [${newEntry.title || newId}](${newId}.md)\n`);
      }

      // Prepend prominent GitHub alert banner if not already present
      const bannerText = `> [!WARNING]\n> **This architectural decision was SUPERSEDED on ${now.split('T')[0]} by [${newEntry.title || newId}](${newId}.md).**\n\n`;
      if (!oldContent.includes('SUPERSEDED on') && !oldContent.includes('This architectural decision was SUPERSEDED')) {
        // Insert after main title
        const titleMatch = oldContent.match(/^#\s+[^\n\r]+\n+/);
        if (titleMatch) {
          oldContent = oldContent.slice(0, titleMatch[0].length) + bannerText + oldContent.slice(titleMatch[0].length);
        } else {
          oldContent = bannerText + oldContent;
        }
      }

      fs.writeFileSync(oldFilePath, oldContent, 'utf-8');
    }

    // 4. Update New Markdown file with Supersedes reference
    const newFilePath = this.resolveRecordFilePath(newId, newEntry);
    if (newFilePath && fs.existsSync(newFilePath)) {
      let newContent = fs.readFileSync(newFilePath, 'utf-8');

      if (/\*\*Supersedes\*\*:\s*[^\n\r]+/i.test(newContent)) {
        newContent = newContent.replace(/\*\*Supersedes\*\*:\s*[^\n\r]+/i, `**Supersedes**: [${oldEntry.title || oldId}](${oldId}.md)`);
      } else {
        newContent = newContent.replace(/(\*\*Status\*\*:[^\n\r]+\n)/i, `$1**Supersedes**: [${oldEntry.title || oldId}](${oldId}.md)\n`);
      }

      fs.writeFileSync(newFilePath, newContent, 'utf-8');
    }

    this.writeIndex(indexData);

    return {
      success: true,
      oldId,
      newId,
      oldTitle: oldEntry.title,
      newTitle: newEntry.title,
      message: `ADR '${oldEntry.title}' was successfully superseded by '${newEntry.title}'.`
    };
  }

  /**
   * Generate a visual Mermaid Decision Lineage DAG
   * @param {Array<Object>} [decisionsList]
   * @returns {string} Mermaid diagram code block
   */
  generateMermaidDAG(decisionsList = null) {
    const decisions = decisionsList || this.readIndex().decisions || [];

    if (decisions.length === 0) {
      return `flowchart LR\n    Empty["No architectural decisions recorded yet"]`;
    }

    const lines = [
      'flowchart LR',
      '    %% ADR Decision Lifecycle & Supersession DAG'
    ];

    const cleanId = (id) => `node_${(id || 'unknown').replace(/[^A-Za-z0-9_]/g, '_')}`;
    const sanitize = (text) => (text || '').replace(/["<>{}|#&]/g, '').trim();

    // 1. Declare nodes
    for (const d of decisions) {
      const nid = cleanId(d.id);
      const title = sanitize(d.title || d.id);
      const status = (d.status || 'draft').toUpperCase();
      lines.push(`    ${nid}["${title}<br/><b>[${status}]</b>"]`);
    }

    lines.push('');

    // 2. Declare relationships (supersedes / supersededBy)
    const addedEdges = new Set();

    for (const d of decisions) {
      const fromNode = cleanId(d.id);

      // Supersedes relation
      if (d.supersedes) {
        const supersededId = typeof d.supersedes === 'string' ? d.supersedes : d.supersedes.id;
        const targetNode = cleanId(supersededId);
        const edgeKey = `${targetNode}->${fromNode}`;
        if (!addedEdges.has(edgeKey)) {
          addedEdges.add(edgeKey);
          lines.push(`    ${targetNode} ==>|"Superseded By"| ${fromNode}`);
        }
      }

      if (d.supersededBy) {
        const targetNode = cleanId(d.supersededBy);
        const edgeKey = `${fromNode}->${targetNode}`;
        if (!addedEdges.has(edgeKey)) {
          addedEdges.add(edgeKey);
          lines.push(`    ${fromNode} ==>|"Superseded By"| ${targetNode}`);
        }
      }

      // Related decisions
      if (Array.isArray(d.relatedDecisions)) {
        for (const rel of d.relatedDecisions) {
          const targetNode = cleanId(rel);
          const edgeKey = `${fromNode}..${targetNode}`;
          const reverseKey = `${targetNode}..${fromNode}`;
          if (!addedEdges.has(edgeKey) && !addedEdges.has(reverseKey)) {
            addedEdges.add(edgeKey);
            lines.push(`    ${fromNode} -.-|"Relates To"| ${targetNode}`);
          }
        }
      }
    }

    lines.push('');

    // 3. Styling classes
    lines.push('    classDef accepted fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;');
    lines.push('    classDef superseded fill:#4c0519,stroke:#f43f5e,stroke-width:2px,color:#ffe4e6,stroke-dasharray: 4 4;');
    lines.push('    classDef draft fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;');
    lines.push('    classDef review fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;');
    lines.push('    classDef rejected fill:#374151,stroke:#9ca3af,stroke-width:2px,color:#d1d5db;');
    lines.push('    classDef deprecated fill:#262626,stroke:#737373,stroke-width:1px,color:#a3a3a3;');

    // 4. Assign classes
    for (const d of decisions) {
      const nid = cleanId(d.id);
      const st = (d.status || 'draft').toLowerCase();
      if (st === 'accepted') lines.push(`    class ${nid} accepted;`);
      else if (st === 'superseded') lines.push(`    class ${nid} superseded;`);
      else if (st === 'under-review' || st === 'proposed') lines.push(`    class ${nid} review;`);
      else if (st === 'rejected') lines.push(`    class ${nid} rejected;`);
      else if (st === 'deprecated') lines.push(`    class ${nid} deprecated;`);
      else lines.push(`    class ${nid} draft;`);
    }

    return lines.join('\n');
  }
}
