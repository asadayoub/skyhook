import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('skyhook/skill/commands/legacy.js', 'utf8');

function extractClass(className) {
  const startIdx = content.indexOf(`class ${className}`);
  if (startIdx === -1) return '';
  let braces = 0;
  let started = false;
  let endIdx = startIdx;
  
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') {
      braces++;
      started = true;
    } else if (content[i] === '}') {
      braces--;
    }
    if (started && braces === 0) {
      endIdx = i + 1;
      break;
    }
  }
  return content.slice(startIdx, endIdx);
}

function extractFunction(funcName) {
  const match = content.match(new RegExp(`async function ${funcName}\\s*\\([^)]*\\)\\s*\\{`));
  if (!match) return '';
  const startIdx = match.index;
  let braces = 0;
  let started = false;
  let endIdx = startIdx;
  
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') {
      braces++;
      started = true;
    } else if (content[i] === '}') {
      braces--;
    }
    if (started && braces === 0) {
      endIdx = i + 1;
      break;
    }
  }
  return content.slice(startIdx, endIdx);
}

// 1. Write context.js
let contextClass = extractClass('SkyhookContext');
// Fix readBacklog to use validation
contextClass = contextClass.replace(/readYaml/g, 'parseYaml');
contextClass = contextClass.replace(/writeYaml/g, 'stringifyYaml');
const contextContent = `import fs from 'fs';
import path from 'path';
import { parseYaml, stringifyYaml } from './yaml.js';
import { validateBacklog } from './schema.js';

` + contextClass + `\nexport { SkyhookContext };\n`;

fs.mkdirSync('skyhook/lib/handlers', { recursive: true });
fs.writeFileSync('skyhook/lib/context.js', contextContent);

// 2. Write backlog.js
const backlogFuncs = [
  'cmdListCurrentFeatures',
  'cmdGetFeature',
  'cmdGetNextTask',
  'cmdGetBlockers',
  'cmdUpdateStatus',
  'cmdAddFeature',
  'cmdBatchCreate'
];
let backlogContent = `import fs from 'fs';\nimport path from 'path';\n\n`;
for (const f of backlogFuncs) {
  let code = extractFunction(f);
  code = code.replace(/export /g, '');
  backlogContent += `export ` + code + `\n\n`;
}
fs.writeFileSync('skyhook/lib/handlers/backlog.js', backlogContent);

// 3. Write adr.js
const adrFuncs = ['cmdRecordDecision', 'cmdDecide'];
let adrContent = `import fs from 'fs';\nimport path from 'path';\n\n`;
for (const f of adrFuncs) {
  adrContent += `export ` + extractFunction(f) + `\n\n`;
}
fs.writeFileSync('skyhook/lib/handlers/adr.js', adrContent);

// 4. Write sync.js
const syncFuncs = ['cmdSync', 'cmdTrace', 'cmdImpact', 'cmdUntraced'];
let syncContent = `import fs from 'fs';\nimport path from 'path';\n\n`;
for (const f of syncFuncs) {
  syncContent += `export ` + extractFunction(f) + `\n\n`;
}
fs.writeFileSync('skyhook/lib/handlers/sync.js', syncContent);

// 5. Write general.js (dashboard, profile, etc)
const generalFuncs = ['cmdDashboard', 'cmdProfile', 'cmdVersion', 'cmdHelp', 'cmdGetContext', 'cmdInit', 'cmdDiscover', 'cmdQuestion', 'cmdPlan', 'cmdStandards', 'cmdInstall', 'cmdSetup'];
let generalContent = `import fs from 'fs';\nimport path from 'path';\nimport { execSync } from 'child_process';\n\n`;
for (const f of generalFuncs) {
  let code = extractFunction(f);
  if (code) {
    generalContent += `export ` + code + `\n\n`;
  }
}
fs.writeFileSync('skyhook/lib/handlers/general.js', generalContent);

console.log('Successfully extracted modules!');
