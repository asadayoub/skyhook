/**
 * Minimal YAML parser for Skyhook - no external deps
 * Handles our specific use case: nested objects, arrays, strings, numbers, booleans
 */

function parseYaml(content) {
  const lines = content.split('\n');
  const root = {};
  // Stack frames: { obj, indent, isArray, inArrayItem }
  const stack = [{ obj: root, indent: -1, isArray: false, inArrayItem: false }];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const indent = line.length - line.trimStart().length;
    
    // Find parent based on indentation
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const currentFrame = stack[stack.length - 1];
    const parent = currentFrame.obj;
    
    // If we're inside an array item object and this line is more indented,
    // it's a property of that array item object
    if (currentFrame.inArrayItem && indent > currentFrame.indent) {
      if (trimmed.includes(':')) {
        const colonIdx = trimmed.indexOf(':');
        const key = trimmed.slice(0, colonIdx).trim();
        let value = trimmed.slice(colonIdx + 1).trim();
        // Handle inline arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          const arrContent = value.slice(1, -1).trim();
          if (arrContent) {
            parent[key] = arrContent.split(',').map(v => parseValue(v.trim()));
          } else {
            parent[key] = [];
          }
        } else if (value === '' || value === '[]') {
          // Check if next non-empty line starts with - (multi-line array)
          let isArray = false;
          for (let j = i + 1; j < lines.length; j++) {
            const nextTrimmed = lines[j].trim();
            if (!nextTrimmed || nextTrimmed.startsWith('#')) continue;
            if (nextTrimmed.startsWith('- ') && lines[j].length - lines[j].trimStart().length > indent) {
              isArray = true;
            }
            break;
          }
          if (isArray) {
            const newObj = [];
            parent[key] = newObj;
            stack.push({ obj: newObj, indent, isArray: true, inArrayItem: false });
          } else {
            parent[key] = parseValue(value);
          }
        } else {
          parent[key] = parseValue(value);
        }
      }
      continue;
    }
    
    if (trimmed.startsWith('- ')) {
      // Array item - add directly to current array
      if (!currentFrame.isArray) continue;
      
      const afterDash = trimmed.slice(2).trim();
      
      // Check if it's an object start (inline key: value)
      if (afterDash.includes(':') && !afterDash.startsWith('"') && !afterDash.startsWith("'")) {
        const newObj = {};
        parent.push(newObj);
        stack.push({ obj: newObj, indent, isArray: false, inArrayItem: true });
        
        // Parse inline key: value
        const colonIdx = afterDash.indexOf(':');
        const key = afterDash.slice(0, colonIdx).trim();
        let value = afterDash.slice(colonIdx + 1).trim();
        // Handle inline arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          const arrContent = value.slice(1, -1).trim();
          if (arrContent) {
            newObj[key] = arrContent.split(',').map(v => parseValue(v.trim()));
          } else {
            newObj[key] = [];
          }
        } else {
          newObj[key] = parseValue(value);
        }
      } else {
        parent.push(parseValue(afterDash));
      }
      // Reset inArrayItem for next array item
      currentFrame.inArrayItem = false;
    } else if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();
      
      const nextLine = lines[i + 1];
      const nextIndent = nextLine ? nextLine.length - nextLine.trimStart().length : -1;
      
      // Inline array: key: ["a", "b"]
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrContent = value.slice(1, -1).trim();
        if (arrContent) {
          parent[key] = arrContent.split(',').map(v => parseValue(v.trim()));
        } else {
          parent[key] = [];
        }
      } else if ((value === '' || value === '[]') && nextIndent > indent) {
        // Multi-line - check if it's an array by looking at next non-empty line
        let isArray = value === '[]';
        if (!isArray && nextLine) {
          for (let j = i + 1; j < lines.length; j++) {
            const nextTrimmed = lines[j].trim();
            if (!nextTrimmed || nextTrimmed.startsWith('#')) continue;
            if (nextTrimmed.startsWith('- ')) {
              isArray = true;
            }
            break;
          }
        }
        const newObj = isArray ? [] : {};
        parent[key] = newObj;
        stack.push({ obj: newObj, indent, isArray, inArrayItem: false });
      } else {
        parent[key] = parseValue(value);
      }
      
      currentFrame.inArrayItem = false;
    }
  }
  
  return root;
}

function parseValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (!isNaN(value) && value !== '' && !value.includes(':') && !value.includes('T')) {
    // Check it's not a timestamp
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return Number(value);
    }
  }
  return value;
}

function stringifyYaml(obj, indent = 0) {
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
          if (valStr.includes(':') || valStr.includes('#') || valStr.startsWith(' ')) {
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
      if (valStr.includes(':') || valStr.includes('#') || valStr.startsWith(' ')) {
        valStr = `"${valStr.replace(/"/g, '\\"')}"`;
      }
      result += `${spaces}${key}: ${valStr}\n`;
    }
  }
  return result;
}

module.exports = { parseYaml, stringifyYaml };
