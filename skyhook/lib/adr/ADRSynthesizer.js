/**
 * ADR Synthesizer
 * Proactively detects architectural drift and auto-synthesizes draft ADRs.
 */

import fs from 'fs';
import path from 'path';
import { generateULID, getTimestamp, writeYaml } from '../utils.js';
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

    const indexPath = path.join(this.ctx.skyhookDir, 'decisions', 'index.yaml');
    if (typeof this.ctx.writeYaml === 'function') {
      this.ctx.writeYaml(indexPath, decisions);
    } else {
      writeYaml(indexPath, decisions);
    }

    return {
      decisionId: id,
      title,
      status: 'draft',
      file: filePath
    };
  }

  /**
   * Bootstrap baseline Architecture Decision Records for all discovered technologies in an existing project
   * @param {string} projectDir - Project root directory
   * @param {Object} options - Custom options (e.g. status: 'accepted', overwrite: boolean)
   * @returns {Promise<Array>} List of bootstrapped ADR records
   */
  async bootstrapBaselineADRs(projectDir = process.cwd(), options = {}) {
    const inferred = await inferFromRepo(projectDir);
    const recorded = (this.ctx.readTechStack && this.ctx.readTechStack()) || { technologies: [] };
    const projectContext = (this.ctx.readProjectYaml && this.ctx.readProjectYaml()) || {};
    const profile = (this.ctx.readProfile && this.ctx.readProfile(projectContext.profile || 'web-app')) || {};

    const techList = [];
    const seen = new Set();

    function addTech(name, category) {
      if (!name || typeof name !== 'string') return;
      const key = name.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        techList.push({ name: name.trim(), category: category || 'Technology' });
      }
    }

    // Discovered from repo facts
    if (inferred.framework) addTech(inferred.framework, 'Framework');
    if (inferred.orm) addTech(inferred.orm, 'Database & ORM');
    if (inferred.database) addTech(inferred.database, 'Database');
    if (inferred.styling) addTech(inferred.styling, 'Styling Engine');
    if (inferred.testing) addTech(inferred.testing, 'Testing Framework');
    if (inferred.deployment) addTech(inferred.deployment, 'Deployment');
    if (inferred.ci) addTech(inferred.ci, 'CI/CD');

    for (const t of inferred.technologies || []) {
      const name = typeof t === 'string' ? t : t.name;
      const cat = typeof t === 'string' ? 'Technology' : t.category;
      addTech(name, cat);
    }

    for (const t of recorded.technologies || []) {
      const name = typeof t === 'string' ? t : t.name;
      const cat = typeof t === 'string' ? 'Technology' : t.category;
      addTech(name, cat);
    }

    const decisions = (this.ctx.readDecisions && this.ctx.readDecisions()) || { decisions: [] };
    if (!Array.isArray(decisions.decisions)) decisions.decisions = [];

    const existingTitles = new Set(
      decisions.decisions.map(d => (d.title || '').toLowerCase())
    );

    const bootstrapped = [];
    const adrDir = path.join(this.ctx.skyhookDir, 'decisions', 'records');
    if (!fs.existsSync(adrDir)) {
      fs.mkdirSync(adrDir, { recursive: true });
    }

    for (const tech of techList) {
      const title = `Adopt ${tech.name} as ${tech.category} Solution`;
      
      const alreadyExists = [...existingTitles].some(t => t.includes(tech.name.toLowerCase()));
      if (alreadyExists && !options.overwrite) {
        continue;
      }

      const id = generateULID();
      const decisionData = {
        id,
        title,
        status: options.status || 'accepted',
        category: tech.category.toLowerCase().includes('database') || tech.category.toLowerCase().includes('framework') ? 'architecture' : 'technology',
        context: `Foundational architectural decision established during codebase discovery for ${projectContext.name || 'the project'}. ${tech.name} is currently integrated into production workflows.`,
        decision: `The project standardizes on ${tech.name} for ${tech.category}. All related modules, dependencies, and implementations must align with this architectural standard.`,
        author: 'Skyhook Architecture Bootstrapper'
      };

      const fullContext = {
        projectType: profile.name,
        profile: profile.id,
        techStack: recorded,
        projectDir
      };

      const markdown = generateADR(decisionData, fullContext);
      const filePath = path.join(adrDir, `${id}.md`);
      fs.writeFileSync(filePath, markdown, 'utf-8');

      const entry = {
        id,
        title,
        status: decisionData.status,
        category: decisionData.category,
        createdAt: getTimestamp(),
        file: path.relative(this.ctx.skyhookDir, filePath)
      };

      decisions.decisions.push(entry);
      existingTitles.add(title.toLowerCase());

      bootstrapped.push({
        decisionId: id,
        title,
        technology: tech.name,
        category: tech.category,
        file: filePath
      });
    }

    const indexPath = path.join(this.ctx.skyhookDir, 'decisions', 'index.yaml');
    if (typeof this.ctx.writeYaml === 'function') {
      this.ctx.writeYaml(indexPath, decisions);
    } else {
      writeYaml(indexPath, decisions);
    }

    return bootstrapped;
  }
}
