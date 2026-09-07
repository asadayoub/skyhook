import fs from 'fs';
import path from 'path';
import { parseYaml, stringifyYaml } from './yaml.js';
import { validateBacklog } from './schema.js';
import { generateULID, getTimestamp, appendChangelog } from './utils.js';
import { generateADR } from './adr-generator.js';

class SkyhookContext {
  constructor(skyhookDir) {
    this.skyhookDir = skyhookDir;
  }

  readFunctionalReqs() {
    return parseYaml(path.join(this.skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] };
  }
  
  readNonFunctionalReqs() {
    return parseYaml(path.join(this.skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] };
  }
  
  readConstraints() {
    return parseYaml(path.join(this.skyhookDir, 'requirements', 'constraints.yaml')) || { constraints: [] };
  }

  readDecisions() {
    return parseYaml(path.join(this.skyhookDir, 'decisions', 'index.yaml')) || { decisions: [] };
  }
  
  readDecisionDetail(id) {
    const detailPath = path.join(this.skyhookDir, 'decisions', id + '.md');
    if (fs.existsSync(detailPath)) {
      return fs.readFileSync(detailPath, 'utf-8');
    }
    return null;
  }
  
  writeDecision(data) {
    const id = generateULID();
    const detailPath = path.join(this.skyhookDir, 'decisions', id + '.md');
    
    // Generate full ADR with auto-fill
    const projectDir = process.cwd();
    const projectYaml = parseYaml(path.join(this.skyhookDir, 'project.yaml')) || {};
    const context = {
      projectDir,
      projectType: projectYaml.type,
      profile: projectYaml.profile,
      techStack: this.readTechStack()
    };
    
    const adrContent = generateADR({ ...data, id }, context);
    
    fs.writeFileSync(detailPath, adrContent, 'utf-8');
    
    // Update index
    const indexPath = path.join(this.skyhookDir, 'decisions', 'index.yaml');
    const index = parseYaml(indexPath) || { schemaVersion: "1.0.0", decisions: [] };
    index.decisions.push({
      id, title: data.title, status: data.status || 'accepted',
      category: data.category || 'architecture', createdAt: getTimestamp()
    });
    stringifyYaml(indexPath, index);
    
    appendChangelog(this.skyhookDir, '- Recorded decision: ' + data.title + ' (' + id + ')');
    
    return id;
  }

  readBacklog() {
    const data = parseYaml(path.join(this.skyhookDir, 'backlog', 'epics.yaml')) || { epics: [], stories: [], tasks: [] };
    if (!data.epics) data.epics = [];
    if (!data.stories) data.stories = [];
    if (!data.tasks) data.tasks = [];
    return data;
  }
  
  writeBacklog(data) {
    stringifyYaml(path.join(this.skyhookDir, 'backlog', 'epics.yaml'), data);
  }
  
  updateStoryStatus(storyId, status) {
    const backlog = this.readBacklog();
    const story = backlog.stories.find(s => s.id === storyId);
    if (story) {
      const oldStatus = story.status;
      story.status = status;
      story.updatedAt = getTimestamp();
      if (status === 'in-progress' && !story.startedAt) story.startedAt = getTimestamp();
      if (status === 'done' && !story.completedAt) story.completedAt = getTimestamp();
      this.writeBacklog(backlog);
      appendChangelog(this.skyhookDir, '- Story ' + storyId + ': ' + oldStatus + ' to ' + status);
      return true;
    }
    return false;
  }
  
  addFeature(featureData) {
    const backlog = this.readBacklog();
    const epicId = generateULID();
    const storyIds = [];
    
    const epic = {
      id: epicId,
      title: featureData.title,
      description: featureData.description || '',
      goal: featureData.goal || featureData.title,
      successMetrics: featureData.successMetrics || [],
      childStories: [],
      targetDate: featureData.targetDate || null,
      status: 'backlog',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp()
    };
    
    if (featureData.stories && Array.isArray(featureData.stories)) {
      for (const story of featureData.stories) {
        const storyId = generateULID();
        backlog.stories.push({
          id: storyId,
          epicId,
          title: story.title,
          userStory: story.userStory || '',
          acceptanceCriteria: story.acceptanceCriteria || [],
          priority: story.priority || 'medium',
          status: 'backlog',
          storyPoints: story.storyPoints || null,
          dependsOn: story.dependsOn || [],
          createdAt: getTimestamp(),
          updatedAt: getTimestamp()
        });
        epic.childStories.push(storyId);
        storyIds.push(storyId);
      }
    }
    
    backlog.epics.push(epic);
    backlog.metadata = backlog.metadata || {};
    backlog.metadata.updatedAt = getTimestamp();
    this.writeBacklog(backlog);
    
    appendChangelog(this.skyhookDir, '- Added feature: ' + featureData.title + ' (' + epicId + ') with ' + storyIds.length + ' stories');
    
    return { epicId, storyIds };
  }

  readTechStack() {
    return parseYaml(path.join(this.skyhookDir, 'tech-stack.yaml')) || { technologies: [], patterns: [], constraints: [] };
  }
  
  writeTechStack(data) {
    stringifyYaml(path.join(this.skyhookDir, 'tech-stack.yaml'), data);
  }

  readStandards() {
    return parseYaml(path.join(this.skyhookDir, 'standards', 'index.yaml')) || { overrides: [], adoptions: [] };
  }

  readProjectYaml() {
    return parseYaml(path.join(this.skyhookDir, 'project.yaml')) || {};
  }
}

export function createSkyhookContext(projectDir) {
  const skyhookDir = path.join(projectDir, '.skyhook');
  if (!fs.existsSync(skyhookDir)) return null;
  return new SkyhookContext(skyhookDir);
}

export { SkyhookContext };
