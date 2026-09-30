import fs from 'fs';

/**
 * Minimal YAML parser for Skyhook - no external deps
 * Handles our specific use case: nested objects, arrays, strings, numbers, booleans
 */

export function readYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYaml(content);
  } catch {
    return null;
  }
}

export function writeYaml(filePath, data) {
  fs.writeFileSync(filePath, stringifyYaml(data), 'utf-8');
}

function stripComment(val) {
  if (!val || typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (trimmed.startsWith('"')) {
    for (let i = 1; i < trimmed.length; i++) {
      if (trimmed[i] === '"' && trimmed[i - 1] !== '\\') {
        return trimmed.slice(0, i + 1);
      }
    }
  } else if (trimmed.startsWith("'")) {
    for (let i = 1; i < trimmed.length; i++) {
      if (trimmed[i] === "'" && trimmed[i - 1] !== '\\') {
        return trimmed.slice(0, i + 1);
      }
    }
  }
  const commentIdx = trimmed.indexOf(' #');
  if (commentIdx !== -1) {
    return trimmed.slice(0, commentIdx).trim();
  }
  return trimmed;
}

function parseBlockScalar(lines, startIndex, baseIndent, isFolded) {
  const blockLines = [];
  let j = startIndex + 1;
  let detectedIndent = null;
  while (j < lines.length) {
    const curLine = lines[j];
    const curTrim = curLine.trim();
    if (!curTrim) {
      blockLines.push('');
      j++;
      continue;
    }
    const curIndent = curLine.length - curLine.trimStart().length;
    if (detectedIndent === null) {
      if (curIndent <= baseIndent) break;
      detectedIndent = curIndent;
    } else if (curIndent < detectedIndent) {
      break;
    }
    blockLines.push(curLine.slice(detectedIndent));
    j++;
  }
  while (blockLines.length > 0 && blockLines[blockLines.length - 1] === '') {
    blockLines.pop();
  }
  const result = isFolded ? blockLines.join(' ').replace(/\s+/g, ' ').trim() : blockLines.join('\n');
  return { result, nextIndex: j - 1 };
}

export function parseYaml(content) {
  if (typeof content !== 'string') return {};
  if (!content.includes('\n') && (content.endsWith('.yaml') || content.endsWith('.yml'))) {
    try {
      if (fs.existsSync(content)) {
        content = fs.readFileSync(content, 'utf-8');
      }
    } catch {
      // Fallback to direct parsing
    }
  }

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
        let value = stripComment(trimmed.slice(colonIdx + 1));
        
        if (value === '|' || value === '|-' || value === '>' || value === '>-') {
          const { result, nextIndex } = parseBlockScalar(lines, i, indent, value.startsWith('>'));
          parent[key] = result;
          i = nextIndex;
          continue;
        }

        // Handle inline arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          const arrContent = value.slice(1, -1).trim();
          if (arrContent) {
            parent[key] = arrContent.split(',').map(v => parseValue(stripComment(v.trim())));
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
          const newObj = isArray ? [] : {};
          parent[key] = newObj;
          stack.push({ obj: newObj, indent, isArray, inArrayItem: false });
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
        let value = stripComment(afterDash.slice(colonIdx + 1));

        if (value === '|' || value === '|-' || value === '>' || value === '>-') {
          const { result, nextIndex } = parseBlockScalar(lines, i, indent, value.startsWith('>'));
          newObj[key] = result;
          i = nextIndex;
          continue;
        }

        // Handle inline arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          const arrContent = value.slice(1, -1).trim();
          if (arrContent) {
            newObj[key] = arrContent.split(',').map(v => parseValue(stripComment(v.trim())));
          } else {
            newObj[key] = [];
          }
        } else {
          newObj[key] = parseValue(value);
        }
      } else {
        parent.push(parseValue(stripComment(afterDash)));
      }
      // Reset inArrayItem for next array item
      currentFrame.inArrayItem = false;
    } else if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      let value = stripComment(trimmed.slice(colonIdx + 1));

      if (value === '|' || value === '|-' || value === '>' || value === '>-') {
        const { result, nextIndex } = parseBlockScalar(lines, i, indent, value.startsWith('>'));
        parent[key] = result;
        i = nextIndex;
        continue;
      }
      
      const nextLine = lines[i + 1];
      const nextIndent = nextLine ? nextLine.length - nextLine.trimStart().length : -1;
      
      // Inline array: key: ["a", "b"]
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrContent = value.slice(1, -1).trim();
        if (arrContent) {
          parent[key] = arrContent.split(',').map(v => parseValue(stripComment(v.trim())));
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
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
  }
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  if (value === 'null' || value === '~') return null;
  if (!isNaN(value) && value !== '' && !value.includes(':') && !value.includes('T')) {
    // Check it's not a timestamp
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return Number(value);
    }
  }
  return value;
}

function formatScalar(val) {
  if (val === null) return 'null';
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') return String(val);
  let str = String(val);
  if (str === '' || str.includes(':') || str.includes('#') || str.includes('\n') ||
      str.startsWith(' ') || str.startsWith('-') || str.startsWith('[') || str.startsWith('{') ||
      str === 'true' || str === 'false' || str === 'null' || str === '~' || 
      (!isNaN(str) && !/^\d{4}-\d{2}-\d{2}/.test(str))) {
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return str;
}

function formatArrayItems(arr, indent) {
  const spaces = '  '.repeat(indent);
  let res = '';
  for (const item of arr) {
    if (item === null) {
      res += spaces + '- null\n';
    } else if (typeof item === 'object' && !Array.isArray(item)) {
      const entries = Object.entries(item);
      if (entries.length === 0) {
        res += spaces + '- {}\n';
      } else {
        const [firstKey, firstVal] = entries[0];
        if (firstVal === undefined || firstVal === null) {
          res += spaces + '- ' + firstKey + ': null\n';
        } else if (Array.isArray(firstVal)) {
          if (firstVal.length === 0) {
            res += spaces + '- ' + firstKey + ': []\n';
          } else {
            res += spaces + '- ' + firstKey + ':\n' + formatArrayItems(firstVal, indent + 2);
          }
        } else if (typeof firstVal === 'object') {
          if (Object.keys(firstVal).length === 0) {
            res += spaces + '- ' + firstKey + ': {}\n';
          } else {
            res += spaces + '- ' + firstKey + ':\n' + formatObjectContent(firstVal, indent + 2);
          }
        } else {
          res += spaces + '- ' + firstKey + ': ' + formatScalar(firstVal) + '\n';
        }

        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i];
          if (v === undefined) continue;
          if (v === null) {
            res += spaces + '  ' + k + ': null\n';
          } else if (Array.isArray(v)) {
            if (v.length === 0) {
              res += spaces + '  ' + k + ': []\n';
            } else {
              res += spaces + '  ' + k + ':\n' + formatArrayItems(v, indent + 2);
            }
          } else if (typeof v === 'object') {
            if (Object.keys(v).length === 0) {
              res += spaces + '  ' + k + ': {}\n';
            } else {
              res += spaces + '  ' + k + ':\n' + formatObjectContent(v, indent + 2);
            }
          } else {
            res += spaces + '  ' + k + ': ' + formatScalar(v) + '\n';
          }
        }
      }
    } else if (Array.isArray(item)) {
      res += spaces + '-\n' + formatArrayItems(item, indent + 1);
    } else {
      res += spaces + '- ' + formatScalar(item) + '\n';
    }
  }
  return res;
}

function formatObjectContent(obj, indent) {
  const spaces = '  '.repeat(indent);
  let res = '';
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null) {
      res += spaces + k + ': null\n';
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        res += spaces + k + ': []\n';
      } else {
        res += spaces + k + ':\n' + formatArrayItems(v, indent + 1);
      }
    } else if (typeof v === 'object') {
      if (Object.keys(v).length === 0) {
        res += spaces + k + ': {}\n';
      } else {
        res += spaces + k + ':\n' + formatObjectContent(v, indent + 1);
      }
    } else {
      res += spaces + k + ': ' + formatScalar(v) + '\n';
    }
  }
  return res;
}

export function stringifyYaml(obj, indent = 0) {
  if (typeof obj === 'string' && (obj.endsWith('.yaml') || obj.endsWith('.yml')) && typeof indent === 'object' && indent !== null) {
    writeYaml(obj, indent);
    return stringifyYaml(indent);
  }
  if (!obj || typeof obj !== 'object') {
    return formatScalar(obj) + '\n';
  }
  if (Array.isArray(obj)) {
    return formatArrayItems(obj, indent);
  }
  return formatObjectContent(obj, indent);
}
