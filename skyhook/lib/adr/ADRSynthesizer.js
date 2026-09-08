/**
 * ADR Synthesizer
 * Proactively detects architectural drift and auto-synthesizes draft ADRs.
 */

import fs from 'fs';
import path from 'path';
import { generateULID, getTimestamp } from '../utils.js';
import { generateADR } from '../adr-generator.js';
import { inferFromRepo } from '../inference/InferenceEngine.js';

export class ADRSynthesizer {
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * Detect architectural shifts by comparing inferred repo facts with recorded tech stack
   * @param {string} projectDir - Project root
   * @returns {Promise<Array>} List of detected candidate architectural shifts
   */
  async detectShifts(projectDir = process.cwd()) {
    const inferred = await inferFromRepo(projectDir);
    const recorded = (this.ctx.readTechStack && this.ctx.readTechStack()) || { technologies: [] };

    const recordedNames = new Set(
      (recorded.technologies || []).map(t => (typeof t === 'string' ? t.toLowerCase() : t.name.toLowerCase()))
    );

    const candidates = [];

    for (const tech of inferred.technologies || []) {
      const name = typeof tech === 'string' ? tech : tech.name;
      const category = typeof tech === 'string' ? 'general' : (tech.category || 'technology');

      if (!recordedNames.has(name.toLowerCase())) {
        candidates.push({
          name,
          category,
          reason: `Detected unrecorded ${category} technology in codebase: ${name}`,
          version: tech.version || null
        });
      }
    }

    return candidates;
  }

  /**
   * Synthesize and draft an ADR for a detected shift or given parameters
   * @param {Object} shift - The detected shift or custom input
   * @returns {Object} Draft ADR record details
   */
  draftForShift(shift) {
    const id = generateULID();
    const title = shift.title || `Adopt ${shift.name} for ${shift.category}`;
    const decision = shift.decision || `Adopt ${shift.name} as the official ${shift.category} solution.`;
    const context = shift.context || shift.reason || `Automated analysis detected ${shift.name} introduced into the codebase.`;

    const projectContext = (this.ctx.readProjectYaml && this.ctx.readProjectYaml()) || {};
    const profile = (this.ctx.readProfile && this.ctx.readProfile(projectContext.profile || 'web-app')) || {};
    const techStack = (this.ctx.readTechStack && this.ctx.readTechStack()) || { technologies: [] };

    const fullContext = {
      projectType: profile.name,
      profile: profile.id,
      techStack,
      projectDir: process.cwd()
    };

    const decisionData = {
      id,
      title,
      decision,
      context,
      status: 'draft',
      category: shift.category || 'technology',
      author: 'Skyhook AI Synthesizer'
    };

    const markdown = generateADR(decisionData, fullContext);

    const adrDir = path.join(this.ctx.skyhookDir, 'decisions', 'records');
    if (!fs.existsSync(adrDir)) {
      fs.mkdirSync(adrDir, { recursive: true });
    }

    const filePath = path.join(adrDir, `${id}.md`);
    fs.writeFileSync(filePath, markdown, 'utf-8');

    // Register in index as draft
    const decisions = (this.ctx.readDecisions && this.ctx.readDecisions()) || { decisions: [] };
    if (!Array.isArray(decisions.decisions)) decisions.decisions = [];

    const entry = {
      id,
      title,
      status: 'draft',
      category: decisionData.category,
      createdAt: getTimestamp(),
      file: path.relative(this.ctx.skyhookDir, filePath)
    };

    decisions.decisions.push(entry);

    if (typeof this.ctx.writeYaml === 'function') {
      this.ctx.writeYaml(path.join(this.ctx.skyhookDir, 'decisions', 'index.yaml'), decisions);
    }

    return {
      decisionId: id,
      title,
      status: 'draft',
      file: filePath
    };
  }
}
