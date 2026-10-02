import fs from 'fs';
import path from 'path';
import { parseYaml, stringifyYaml } from './yaml.js';
import { validateBacklog } from './schema.js';
import { generateULID, getTimestamp, appendChangelog, readYaml, writeYaml, loadProfile } from './utils.js';
import { generateADR } from './adr-generator.js';
import { BacklogLock } from './backlog/BacklogLock.js';
import { BacklogStateMachine } from './backlog/BacklogStateMachine.js';
import { EventLedger, EVENT_TYPES } from './backlog/EventLedger.js';
import { StandardsRegistry } from './standards/StandardsRegistry.js';
import { StandardsResolver } from './standards/StandardsResolver.js';

class SkyhookContext {
  constructor(skyhookDirOrProjectDir) {
    const resolved = path.resolve(skyhookDirOrProjectDir || process.cwd());
    if (path.basename(resolved) === '.skyhook') {
      this.skyhookDir = resolved;
      this.projectDir = path.dirname(resolved);
    } else {
      this.projectDir = resolved;
      this.skyhookDir = path.join(resolved, '.skyhook');
    }
  }

  get backlogDir() {
    return path.join(this.skyhookDir, 'backlog');
  }

  get epicsFile() {
    return path.join(this.skyhookDir, 'backlog', 'epics.yaml');
  }

  get eventsFile() {
    return path.join(this.skyhookDir, 'backlog', 'events.jsonl');
  }

  get decisionsDir() {
    return path.join(this.skyhookDir, 'decisions');
  }

  get adrsDir() {
    return path.join(this.skyhookDir, 'decisions', 'records');
  }

  get requirementsDir() {
    return path.join(this.skyhookDir, 'requirements');
  }

  get standardsDir() {
    return path.join(this.skyhookDir, 'standards');
  }

  isInitialized() {
    return fs.existsSync(path.join(this.skyhookDir, 'project.yaml'));
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
      standards: data.standards || [],
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
  
  updateStoryStatus(workId, status, metadata = {}, options = {}) {
    return BacklogLock.withLockSync(this.skyhookDir, () => {
      const backlog = this.readBacklog();
      const story = (backlog.stories || []).find(s => s.id === workId);
      const task = (backlog.tasks || []).find(t => t.id === workId);
      if (!story && !task) return false;

      const item = story || task;
      const isTask = !!task;
      const oldStatus = item.status;
      const result = BacklogStateMachine.transition(backlog, workId, status, metadata, options);

      this.writeBacklog(backlog);

      if (this.skyhookDir) {
        EventLedger.appendEvent(this.skyhookDir, {
          type: isTask ? EVENT_TYPES.TASK_STATE_TRANSITIONED : EVENT_TYPES.STATE_TRANSITIONED,
          actor: metadata.agentId || metadata.actor || 'system',
          payload: {
            workId,
            storyId: isTask ? item.parentId : workId,
            taskId: isTask ? workId : null,
            from: oldStatus,
            to: status,
            ...metadata
          }
        });

        if (result.rolledUpStory) {
          EventLedger.appendEvent(this.skyhookDir, {
            type: EVENT_TYPES.STATE_TRANSITIONED,
            actor: 'state-machine',
            payload: {
              storyId: result.rolledUpStory.id,
              to: result.rolledUpStory.status,
              reason: `Rolled up from child task ${workId}`
            }
          });
        }

        if (result.epicCompleted) {
          EventLedger.appendEvent(this.skyhookDir, {
            type: EVENT_TYPES.EPIC_COMPLETED,
            actor: 'state-machine',
            payload: { epicId: result.rolledUpEpic?.id || (story ? story.epicId : null) }
          });
        }
      }

      appendChangelog(this.skyhookDir, '- ' + (isTask ? 'Task ' : 'Story ') + workId + ': ' + oldStatus + ' to ' + status);
      return true;
    });
  }

  updateTaskStatus(taskId, status, metadata = {}, options = {}) {
    return this.updateStoryStatus(taskId, status, metadata, options);
  }

  addTask(taskData = {}) {
    return BacklogLock.withLockSync(this.skyhookDir, () => {
      const backlog = this.readBacklog();
      backlog.tasks = backlog.tasks || [];
      backlog.stories = backlog.stories || [];
      backlog.epics = backlog.epics || [];

      let maxNum = 0;
      for (const t of backlog.tasks) {
        const match = String(t.id).match(/^TASK-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const taskId = taskData.id || `TASK-${String(maxNum + 1).padStart(3, '0')}`;
      const now = getTimestamp();

      const parentType = taskData.parentType || (taskData.epicId ? 'epic' : 'story');
      const parentId = taskData.parentId || taskData.storyId || taskData.epicId;

      if (!parentId) {
        throw new Error('Task requires a parent story or epic ID (parentId/storyId/epicId)');
      }

      const newTask = {
        id: taskId,
        title: taskData.title || 'Untitled Task',
        description: taskData.description || '',
        parentType,
        parentId,
        type: taskData.type || 'feature',
        status: taskData.status || 'ready',
        priority: taskData.priority || 'medium',
        storyPoints: taskData.storyPoints !== undefined && taskData.storyPoints !== null ? Number(taskData.storyPoints) : null,
        estimatedMinutes: taskData.estimatedMinutes ? Number(taskData.estimatedMinutes) : null,
        targetFiles: Array.isArray(taskData.targetFiles) ? taskData.targetFiles : (taskData.targetFiles ? [taskData.targetFiles] : []),
        standards: Array.isArray(taskData.standards) ? taskData.standards : [],
        dependsOn: Array.isArray(taskData.dependsOn) ? taskData.dependsOn : [],
        subtasks: Array.isArray(taskData.subtasks) ? taskData.subtasks.map((s, i) => ({
          id: s.id || `SUB-${String(i + 1).padStart(3, '0')}`,
          title: typeof s === 'string' ? s : s.title,
          completed: !!s.completed,
          createdAt: s.createdAt || now
        })) : [],
        createdAt: now,
        updatedAt: now
      };

      if (parentType === 'story') {
        const parentStory = backlog.stories.find(s => s.id === parentId);
        if (parentStory) {
          parentStory.childTasks = parentStory.childTasks || [];
          if (!parentStory.childTasks.includes(taskId)) parentStory.childTasks.push(taskId);
        }
      } else if (parentType === 'epic') {
        const parentEpic = backlog.epics.find(e => e.id === parentId);
        if (parentEpic) {
          parentEpic.childTasks = parentEpic.childTasks || [];
          if (!parentEpic.childTasks.includes(taskId)) parentEpic.childTasks.push(taskId);
        }
      }

      backlog.tasks.push(newTask);
      this.writeBacklog(backlog);

      if (this.skyhookDir) {
        EventLedger.appendEvent(this.skyhookDir, {
          type: EVENT_TYPES.TASK_CREATED,
          actor: taskData.actor || 'system',
          payload: { id: taskId, title: newTask.title, parentId, parentType, type: newTask.type }
        });
      }

      appendChangelog(this.skyhookDir, '- Added task: ' + newTask.title + ' (' + taskId + ') under ' + parentType + ' ' + parentId);
      return newTask;
    });
  }

  addSubtask(taskId, title) {
    return BacklogLock.withLockSync(this.skyhookDir, () => {
      const backlog = this.readBacklog();
      const task = (backlog.tasks || []).find(t => t.id === taskId);
      if (!task) throw new Error(`Task '${taskId}' not found`);

      task.subtasks = task.subtasks || [];
      const subId = `SUB-${String(task.subtasks.length + 1).padStart(3, '0')}`;
      const now = getTimestamp();
      const newSub = {
        id: subId,
        title,
        completed: false,
        createdAt: now
      };
      task.subtasks.push(newSub);
      task.updatedAt = now;

      this.writeBacklog(backlog);

      if (this.skyhookDir) {
        EventLedger.appendEvent(this.skyhookDir, {
          type: EVENT_TYPES.SUBTASK_CREATED,
          actor: 'system',
          payload: { taskId, subtaskId: subId, title }
        });
      }

      return newSub;
    });
  }

  toggleSubtask(taskId, subtaskId, completed) {
    return BacklogLock.withLockSync(this.skyhookDir, () => {
      const backlog = this.readBacklog();
      const task = (backlog.tasks || []).find(t => t.id === taskId);
      if (!task) throw new Error(`Task '${taskId}' not found`);

      task.subtasks = task.subtasks || [];
      const sub = task.subtasks.find(s => s.id === subtaskId);
      if (!sub) throw new Error(`Subtask '${subtaskId}' not found on task '${taskId}'`);

      const now = getTimestamp();
      sub.completed = completed !== undefined ? !!completed : !sub.completed;
      if (sub.completed) sub.completedAt = now;
      else delete sub.completedAt;
      task.updatedAt = now;

      this.writeBacklog(backlog);

      if (this.skyhookDir) {
        EventLedger.appendEvent(this.skyhookDir, {
          type: EVENT_TYPES.SUBTASK_TOGGLED,
          actor: 'system',
          payload: { taskId, subtaskId, completed: sub.completed }
        });
      }

      return sub;
    });
  }

  addStory(storyData) {
    return BacklogLock.withLockSync(this.skyhookDir, () => {
      const backlog = this.readBacklog();
      backlog.stories = backlog.stories || [];
      backlog.epics = backlog.epics || [];

      let storyId = storyData.id;
      if (!storyId) {
        let maxNum = 0;
        for (const s of backlog.stories) {
          const match = String(s.id).match(/^STORY-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
        storyId = maxNum > 0 ? `STORY-${maxNum + 1}` : generateULID();
      }

      const now = getTimestamp();
      const epicId = storyData.epicId || (backlog.epics[0]?.id) || null;
      const newStory = {
        id: storyId,
        epicId,
        title: storyData.title || 'Untitled Story',
        description: storyData.description || '',
        userStory: storyData.userStory || '',
        acceptanceCriteria: Array.isArray(storyData.acceptanceCriteria) ? storyData.acceptanceCriteria : (storyData.acceptanceCriteria ? [storyData.acceptanceCriteria] : []),
        priority: storyData.priority || 'medium',
        status: storyData.status || 'backlog',
        storyPoints: storyData.storyPoints !== undefined && storyData.storyPoints !== null ? Number(storyData.storyPoints) : null,
        dependsOn: Array.isArray(storyData.dependsOn) ? storyData.dependsOn : [],
        standards: Array.isArray(storyData.standards) ? storyData.standards : [],
        targetFiles: Array.isArray(storyData.targetFiles) ? storyData.targetFiles : [],
        childTasks: [],
        createdAt: now,
        updatedAt: now
      };

      if (epicId) {
        const parentEpic = backlog.epics.find(e => e.id === epicId);
        if (parentEpic) {
          parentEpic.childStories = parentEpic.childStories || [];
          if (!parentEpic.childStories.includes(storyId)) parentEpic.childStories.push(storyId);
        }
      }

      backlog.stories.push(newStory);
      backlog.metadata = backlog.metadata || {};
      backlog.metadata.updatedAt = now;
      this.writeBacklog(backlog);

      if (this.skyhookDir) {
        EventLedger.appendEvent(this.skyhookDir, {
          type: EVENT_TYPES.STORY_CREATED,
          actor: storyData.actor || 'system',
          payload: { id: storyId, epicId, title: newStory.title, priority: newStory.priority }
        });
      }

      appendChangelog(this.skyhookDir, '- Added story: ' + newStory.title + ' (' + storyId + ')' + (epicId ? ' under epic ' + epicId : ''));
      return newStory;
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
            standards: story.standards || [],
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

  readStandards(filter = {}) {
    const standardsFile = path.join(this.skyhookDir, 'standards', 'index.yaml');
    const indexData = fs.existsSync(standardsFile) ? (readYaml(standardsFile) || {}) : { overrides: [], adoptions: [] };
    const catalog = StandardsRegistry.listStandards(filter, this.projectDir);
    return {
      overrides: indexData.overrides || [],
      adoptions: indexData.adoptions || [],
      standards: catalog
    };
  }

  readStandard(id) {
    return StandardsRegistry.getStandard(id, this.projectDir);
  }

  resolveStandardsForStory(story) {
    return StandardsResolver.resolveBriefingForStory(story, this.projectDir);
  }

  readProjectYaml() {
    return readYaml(path.join(this.skyhookDir, 'project.yaml')) || {};
  }
}

export function createSkyhookContext(projectDir) {
  let dir = path.resolve(projectDir || process.cwd());
  while (dir && dir !== path.parse(dir).root) {
    const skyhookDir = path.join(dir, '.skyhook');
    if (fs.existsSync(skyhookDir)) {
      return new SkyhookContext(skyhookDir);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export { SkyhookContext };
