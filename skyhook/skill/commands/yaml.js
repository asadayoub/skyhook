/**
 * Simple but robust YAML parser for Skyhook's use case.
 * Handles nested objects, arrays, and basic types.
 */

export function parseYaml(content) {
  const lines = content.split('\n');
  const root = {};
  const stack = [{ obj: root, indent: -1, arrayKey: null }];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const indent = line.length - line.trimStart().length;
    
    // Find parent based on indentation
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;
    const currentFrame = stack[stack.length - 1];
    
    if (trimmed.startsWith('- ')) {
      // Array item
      const value = trimmed.slice(2).trim();
      const arrayKey = currentFrame.arrayKey;
      
      if (arrayKey) {
        if (!Array.isArray(parent[arrayKey])) {
          parent[arrayKey] = [];
        }
        
        // Check if this is an object start (next line has more indent)
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.length - nextLine.trimStart().length > indent) {
          // This array item is an object
          const newObj = {};
          parent[arrayKey].push(newObj);
          stack.push({ obj: newObj, indent, arrayKey: null });
          // Re-process current line as key-value in new object
          i--; 
        } else {
          // Simple array value
          parent[arrayKey].push(parseValue(value));
        }
      }
    } else if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      
      if (value === '' || value === '[]') {
        // Could be object or empty array - peek next line
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.length - nextLine.trimStart().length > indent) {
          // It's an object
          const newObj = {};
          parent[key] = newObj;
          stack.push({ obj: newObj, indent, arrayKey: null });
        } else {
          parent[key] = value === '[]' ? [] : null;
        }
      } else {
        parent[key] = parseValue(value);
      }
      
      // Track array key for next iteration
      currentFrame.arrayKey = key;
    }
  }
  
  return root;
}

function parseValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (!isNaN(value) && value !== '' && !value.includes(':')) {
    // Check if it's a number (but not a timestamp like "2026-08-29T16:00:00.000Z")
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return Number(value);
    }
  }
  return value;
}

export function stringifyYaml(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      result += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          result += `${spaces}  -\n`;
          result += stringifyYaml(item, indent + 2).replace(/^/gm, '    ');
        } else {
          let valStr = String(item);
          if (valStr.includes(':') || valStr.includes('#') || valStr.startsWith(' ') || valStr.includes('\n')) {
            valStr = `"${valStr.replace(/"/g, '\\"')}"`;
          }
          result += `${spaces}  - ${valStr}\n`;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      result += `${spaces}${key}:\n`;
      result += stringifyYaml(value, indent + 1);
    } else {
      let valStr = String(value);
      if (valStr.includes(':') || valStr.includes('#') || valStr.startsWith(' ') || valStr.includes('\n')) {
        valStr = `"${valStr.replace(/"/g, '\\"')}"`;
      }
      result += `${spaces}${key}: ${valStr}\n`;
    }
  }
  return result;
}
