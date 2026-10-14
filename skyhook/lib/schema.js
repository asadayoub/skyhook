/**
 * Lightweight schema validation for Skyhook YAML data.
 * Throws clear errors if the data is corrupted or misses required fields.
 */

const VALID_STATUSES = new Set([
  'backlog',
  'ready',
  'in-progress',
  'implemented',
  'in-review',
  'verified',
  'done',
  'blocked',
  'cancelled'
]);

export function validateBacklog(data) {
  if (!data) return { epics: [], stories: [], tasks: [] };
  
  if (data.epics !== undefined && !Array.isArray(data.epics)) {
    throw new Error('Schema Validation Error: backlog.epics must be an array');
  }
  if (data.stories !== undefined && !Array.isArray(data.stories)) {
    throw new Error('Schema Validation Error: backlog.stories must be an array');
  }
  if (data.tasks !== undefined && !Array.isArray(data.tasks)) {
    throw new Error('Schema Validation Error: backlog.tasks must be an array');
  }

  const epics = data.epics || [];
  const stories = data.stories || [];
  const tasks = data.tasks || [];

  for (let i = 0; i < epics.length; i++) {
    const epic = epics[i];
    if (!epic || typeof epic !== 'object') {
      throw new Error(`Schema Validation Error: epic at index ${i} must be an object`);
    }
    if (!epic.id || typeof epic.id !== 'string') {
      throw new Error(`Schema Validation Error: epic at index ${i} must have a non-empty string id`);
    }
    if (!epic.title || typeof epic.title !== 'string') {
      throw new Error(`Schema Validation Error: epic "${epic.id}" must have a non-empty string title`);
    }
    if (epic.status && !VALID_STATUSES.has(epic.status)) {
      throw new Error(`Schema Validation Error: epic "${epic.id}" status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`);
    }
  }

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    if (!story || typeof story !== 'object') {
      throw new Error(`Schema Validation Error: story at index ${i} must be an object`);
    }
    if (!story.id || typeof story.id !== 'string') {
      throw new Error(`Schema Validation Error: story at index ${i} must have a non-empty string id`);
    }
    if (!story.title || typeof story.title !== 'string') {
      throw new Error(`Schema Validation Error: story "${story.id}" must have a non-empty string title`);
    }
    if (story.status && !VALID_STATUSES.has(story.status)) {
      throw new Error(`Schema Validation Error: story "${story.id}" status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`);
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (!task || typeof task !== 'object') {
      throw new Error(`Schema Validation Error: task at index ${i} must be an object`);
    }
    if (!task.id || typeof task.id !== 'string') {
      throw new Error(`Schema Validation Error: task at index ${i} must have a non-empty string id`);
    }
    if (!task.title || typeof task.title !== 'string') {
      throw new Error(`Schema Validation Error: task "${task.id}" must have a non-empty string title`);
    }
    if (task.status && !VALID_STATUSES.has(task.status)) {
      throw new Error(`Schema Validation Error: task "${task.id}" status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`);
    }
  }
  
  return {
    ...data,
    epics,
    stories,
    tasks
  };
}

export function validateFeatures(data) {
  if (!data) return [];
  if (!Array.isArray(data)) {
    throw new Error('Schema Validation Error: features must be a root array');
  }
  return data;
}

export function validateDecisions(data) {
  if (!data) return [];
  if (!Array.isArray(data)) {
    throw new Error('Schema Validation Error: decisions must be a root array');
  }
  return data;
}
