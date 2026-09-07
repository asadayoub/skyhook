/**
 * Lightweight schema validation for Skyhook YAML data.
 * Throws clear errors if the data is corrupted or misses required fields.
 */

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
  
  return {
    epics: data.epics || [],
    stories: data.stories || [],
    tasks: data.tasks || []
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
