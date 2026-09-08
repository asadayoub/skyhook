/**
 * Bi-Directional ADR Synchronization Engine
 * Keeps .skyhook/decisions/records/*.md and .skyhook/decisions/index.yaml in perfect sync.
 */

import fs from 'fs';
import path from 'path';
import { parseADRMarkdown, computeContentHash } from './ADRMarkdownParser.js';
import { generateADR } from '../adr-generator.js';
import { readYaml, writeYaml, getTimestamp } from '../utils.js';

export class ADRSyncEngine {
  constructor(skyhookDir) {
    this.skyhookDir = skyhookDir;
    this.decisionsDir = path.join(skyhookDir, 'decisions');
    this.recordsDir = path.join(this.decisionsDir, 'records');
    this.indexPath = path.join(this.decisionsDir, 'index.yaml');
  }

  /**
   * Ensure directories and index file exist
   */
  ensureSetup() {
    if (!fs.existsSync(this.recordsDir)) {
      fs.mkdirSync(this.recordsDir, { recursive: true });
    }
    if (!fs.existsSync(this.indexPath)) {
      writeYaml(this.indexPath, { schemaVersion: '1.0.0', decisions: [] });
    }
  }

  /**
   * Perform full bi-directional synchronization
   * @param {Object} ctx - SkyhookContext
   * @returns {Object} Sync statistics and results
   */
  sync(ctx) {
    this.ensureSetup();

    const indexData = readYaml(this.indexPath) || { schemaVersion: '1.0.0', decisions: [] };
    if (!Array.isArray(indexData.decisions)) {
      indexData.decisions = [];
    }

    const indexMap = new Map();
    indexData.decisions.forEach(d => {
      if (d.id) indexMap.set(d.id, d);
    });

    let updatedFromMarkdown = 0;
    let createdMarkdown = 0;
    let addedToIndex = 0;
    const syncedDecisions = [];

    // 1. Scan records directory for existing markdown files
    const mdFiles = fs.readdirSync(this.recordsDir).filter(f => f.endsWith('.md'));

    for (const filename of mdFiles) {
      const filePath = path.join(this.recordsDir, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseADRMarkdown(content);

      if (!parsed || !parsed.id) {
        continue;
      }

      const existingIndex = indexMap.get(parsed.id);

      if (existingIndex) {
        // Check if markdown has updates (status, title, category)
        let changed = false;

        if (parsed.status && parsed.status !== existingIndex.status) {
          existingIndex.status = parsed.status;
          changed = true;
        }
        if (parsed.title && parsed.title !== existingIndex.title) {
          existingIndex.title = parsed.title;
          changed = true;
        }
        if (parsed.category && parsed.category !== existingIndex.category) {
          existingIndex.category = parsed.category;
          changed = true;
        }

        existingIndex.contentHash = parsed.contentHash;
        existingIndex.updatedAt = getTimestamp();

        if (changed) {
          updatedFromMarkdown++;
        }
        syncedDecisions.push({ id: parsed.id, title: existingIndex.title, status: existingIndex.status, source: 'markdown-sync' });
      } else {
        // File exists on disk but not in index.yaml -> Add to index!
        const newEntry = {
          id: parsed.id,
          title: parsed.title || filename.replace('.md', ''),
          status: parsed.status || 'accepted',
          category: parsed.category || 'architecture',
          createdAt: parsed.date || getTimestamp(),
          contentHash: parsed.contentHash,
          file: path.relative(this.skyhookDir, filePath)
        };
        indexData.decisions.push(newEntry);
        indexMap.set(parsed.id, newEntry);
        addedToIndex++;
        syncedDecisions.push({ id: parsed.id, title: newEntry.title, status: newEntry.status, source: 'indexed-from-file' });
      }
    }

    // 2. Check if there are decisions in index.yaml that are missing markdown files
    for (const decision of indexData.decisions) {
      const expectedFile = path.join(this.recordsDir, `${decision.id}.md`);
      if (!fs.existsSync(expectedFile)) {
        // Regenerate markdown file from index data
        const projectContext = ctx && typeof ctx.readProjectYaml === 'function' ? ctx.readProjectYaml() : {};
        const profile = ctx && typeof ctx.readProfile === 'function' ? ctx.readProfile(projectContext.profile || 'web-app') : {};
        const techStack = ctx && typeof ctx.readTechStack === 'function' ? ctx.readTechStack() : { technologies: [] };

        const fullContext = {
          projectType: profile.name,
          profile: profile.id,
          techStack,
          projectDir: process.cwd()
        };

        const markdownContent = generateADR(decision, fullContext);
        fs.writeFileSync(expectedFile, markdownContent, 'utf-8');
        decision.contentHash = computeContentHash(markdownContent);
        createdMarkdown++;
        syncedDecisions.push({ id: decision.id, title: decision.title, status: decision.status, source: 'generated-markdown' });
      }
    }

    // 3. Handle supersessions
    for (const decision of indexData.decisions) {
      if (decision.supersedes && Array.isArray(decision.supersedes)) {
        for (const supersededId of decision.supersedes) {
          const target = indexMap.get(supersededId);
          if (target && target.status !== 'superseded') {
            target.status = 'superseded';
            target.supersededBy = decision.id;

            // Also update the target markdown file if present
            const targetMdPath = path.join(this.recordsDir, `${supersededId}.md`);
            if (fs.existsSync(targetMdPath)) {
              let targetContent = fs.readFileSync(targetMdPath, 'utf-8');
              targetContent = targetContent.replace(/(\*\*Status\*\*:\s*)([^\n\r]+)/i, `$1superseded (by ${decision.id})`);
              fs.writeFileSync(targetMdPath, targetContent, 'utf-8');
            }
          }
        }
      }
    }

    // 4. Save updated index.yaml
    writeYaml(this.indexPath, indexData);

    return {
      totalDecisions: indexData.decisions.length,
      updatedFromMarkdown,
      createdMarkdown,
      addedToIndex,
      decisions: syncedDecisions
    };
  }
}
