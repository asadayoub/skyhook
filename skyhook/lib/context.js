import fs from 'fs';
import path from 'path';
import { parseYaml, stringifyYaml } from './yaml.js';
import { validateBacklog } from './schema.js';
import { generateULID, getTimestamp, appendChangelog, readYaml, writeYaml, loadProfile } from './utils.js';
import { generateADR } from './adr-generator.js';
import { BacklogLock } from './backlog/BacklogLock.js';
import { BacklogStateMachine } from './backlog/BacklogStateMachine.js';
import { EventLedger, EVENT_TYPES } from './backlog/EventLedger.js';

class SkyhookContext {
  constructor(skyhookDir) {
    if (skyhookDir && !skyhookDir.endsWith('.skyhook') && fs.existsSync(path.join(skyhookDir, '.skyhook'))) {
      this.skyhookDir = path.join(skyhookDir, '.skyhook');
    } else {
      this.skyhookDir = skyhookDir;
    }
    this.projectDir = path.dirname(this.skyhookDir);
  }

  readYaml(filePath) {
    return readYaml(filePath);
  }

  writeYaml(filePath, data) {
    return writeYaml(filePath, data);
  }

  readProfile(profileName) {
    return loadProfile(profileName);
  }

  readFunctionalReqs() {
    return readYaml(path.join(this.skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] };
  }
  
  readNonFunctionalReqs() {
    return readYaml(path.join(this.skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] };
  }
  
  readConstraints() {
    return readYaml(path.join(this.skyhookDir, 'requirements', 'constraints.yaml')) || { constraints: [] };
  }

  readDecisions() {
    return readYaml(path.join(this.skyhookDir, 'decisions', 'index.yaml')) || { decisions: [] };
  }
  
  readDecisionDetail(id) {
    const recordPath = path.join(this.skyhookDir, 'decisions', 'records', id + '.md');
    if (fs.existsSync(recordPath)) {
      return fs.readFileSync(recordPath, 'utf-8');
    }
    const detailPath = path.join(this.skyhookDir, 'decisions', id + '.md');
    if (fs.existsSync(detailPath)) {
      return fs.readFileSync(detailPath, 'utf-8');
    }
    return null;
  }
  
  writeDecision(data) {
    const id = data.id || generateULID();
    const recordsDir = path.join(this.skyhookDir, 'decisions', 'records');
    if (!fs.existsSync(recordsDir)) {
      fs.mkdirSync(recordsDir, { recursive: true });
    }
    const detailPath = path.join(recordsDir, id + '.md');
    
    // Generate full ADR with auto-fill
    const projectDir = process.cwd();
    const projectYaml = readYaml(path.join(this.skyhookDir, 'project.yaml')) || {};
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
    const index = readYaml(indexPath) || { schemaVersion: "1.0.0", decisions: [] };
    if (!Array.isArray(index.decisions)) index.decisions = [];

    const existingIdx = index.decisions.findIndex(d => d.id === id);
    const entry = {
      id,
      title: data.title,
      status: data.status || 'accepted',
      category: data.category || 'architecture',
      createdAt: getTimestamp(),
      supersedes: data.supersedes || [],
      enforcement: data.enforcement || null
    };

    if (existingIdx >= 0) {
      index.decisions[existingIdx] = { ...index.decisions[existingIdx], ...entry };
    } else {
      index.decisions.push(entry);
    }

    writeYaml(indexPath, index);
    appendChangelog(this.skyhookDir, '- Recorded decision: ' + data.title + ' (' + id + ')');
    
    return id;
  }

  readBacklog() {
    const data = readYaml(path.join(this.skyhookDir, 'backlog', 'epics.yaml')) || { epics: [], stories: [], tasks: [] };
    if (!data.epics) data.epics = [];
    if (!data.stories) data.stories = [];
    if (!data.tasks) data.tasks = [];
    return data;
  }
  
  writeBacklog(data) {
    const backlogDir = path.join(this.skyhookDir, 'backlog');
    if (!fs.existsSync(backlogDir)) {
      fs.mkdirSync(backlogDir, { recursive: true });
    }
    writeYaml(path.join(backlogDir, 'epics.yaml'), data);
  }
  
  updateStoryStatus(storyId, status, metadata = {}, options = {}) {
    return BacklogLock.withLockSync(this.skyhookDir, () => {
      const backlog = this.readBacklog();
      const story = (backlog.stories || []).find(s => s.id === storyId);
      if (!story) return false;

      const oldStatus = story.status;
      const result = BacklogStateMachine.transition(backlog, storyId, status, metadata, options);

      this.writeBacklog(backlog);

      if (this.skyhookDir) {
        EventLedger.appendEvent(this.skyhookDir, {
          type: EVENT_TYPES.STATE_TRANSITIONED,
          actor: metadata.agentId || metadata.actor || 'system',
          payload: {
            storyId,
            from: oldStatus,
            to: status,
            ...metadata
          }
        });

        if (result.epicCompleted && story.epicId) {
          EventLedger.appendEvent(this.skyhookDir, {
            type: EVENT_TYPES.EPIC_COMPLETED,
            actor: 'state-machine',
            payload: { epicId: story.epicId }
          });
        }
      }

      appendChangelog(this.skyhookDir, '- Story ' + storyId + ': ' + oldStatus + ' to ' + status);
      return true;
    });
  }
  
  addFeature(featureData) {
    return BacklogLock.withLockSync(this.skyhookDir, () => {
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

          if (this.skyhookDir) {
            EventLedger.appendEvent(this.skyhookDir, {
              type: EVENT_TYPES.STORY_CREATED,
              actor: 'system',
              payload: { id: storyId, epicId, title: story.title, priority: story.priority || 'medium' }
            });
          }
        }
      }
      
      backlog.epics.push(epic);
      backlog.metadata = backlog.metadata || {};
      backlog.metadata.updatedAt = getTimestamp();
      this.writeBacklog(backlog);
      
      if (this.skyhookDir) {
        EventLedger.appendEvent(this.skyhookDir, {
          type: EVENT_TYPES.EPIC_CREATED,
          actor: 'system',
          payload: { id: epicId, title: featureData.title, childStories: storyIds }
        });
      }

      appendChangelog(this.skyhookDir, '- Added feature: ' + featureData.title + ' (' + epicId + ') with ' + storyIds.length + ' stories');
      
      return { epicId, storyIds };
    });
  }

  readTechStack() {
    return readYaml(path.join(this.skyhookDir, 'tech-stack.yaml')) || { technologies: [], patterns: [], constraints: [] };
  }
  
  writeTechStack(data) {
    writeYaml(path.join(this.skyhookDir, 'tech-stack.yaml'), data);
  }

  readStandards() {
    return readYaml(path.join(this.skyhookDir, 'standards', 'index.yaml')) || { overrides: [], adoptions: [] };
  }

  readProjectYaml() {
    return readYaml(path.join(this.skyhookDir, 'project.yaml')) || {};
  }
}

export function createSkyhookContext(projectDir) {
  const skyhookDir = path.join(projectDir, '.skyhook');
  if (!fs.existsSync(skyhookDir)) return null;
  return new SkyhookContext(skyhookDir);
}

export { SkyhookContext };
