import fs from 'fs';
import path from 'path';

// Use dynamic import so it doesn't crash if dependencies are missing globally
let babelParser;
let babelTraverse;

async function loadBabel() {
  if (!babelParser || !babelTraverse) {
    try {
      const p = await import('@babel/parser');
      const t = await import('@babel/traverse');
      babelParser = p.default || p;
      babelTraverse = t.default || t;
    } catch (e) {
      throw new Error('Missing dependencies. Run: npm install @babel/parser @babel/traverse');
    }
  }
}

export async function parseJavascript(fullPath, projectDir) {
  await loadBabel();
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  const symbols = [];
  
  try {
    const ast = babelParser.parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy']
    });
    
    // Build a map of comments by line number to quickly check for @skyhook-implements
    const commentsByLine = {};
    if (ast.comments) {
      for (const comment of ast.comments) {
        // Look for @skyhook-implements or implements:
        const match = comment.value.match(/(@skyhook-implements|implements:)\s+([A-Z0-9-]+)/i);
        if (match) {
          const reqId = match[2];
          // Attach this to the line right after the comment
          const targetLine = comment.loc.end.line + 1;
          commentsByLine[targetLine] = { reqId, comment: comment.value.trim() };
        }
      }
    }
    
    // Helper to process a node
    const processNode = (node, type, defaultName) => {
      let name = defaultName || 'Anonymous';
      if (node.id && node.id.name) {
        name = node.id.name;
      }
      
      const startLine = node.loc.start.line;
      const endLine = node.loc.end.line;
      
      // Check if this node has a traced requirement attached to it
      // Either attached to the node itself (leadingComments) or in the comments map
      let reqId = null;
      
      // Check comments map
      if (commentsByLine[startLine]) {
        reqId = commentsByLine[startLine].reqId;
      } else if (node.leadingComments) {
        for (const c of node.leadingComments) {
          const match = c.value.match(/(@skyhook-implements|implements:)\s+([A-Z0-9-]+)/i);
          if (match) {
            reqId = match[2];
            break;
          }
        }
      }
      
      // Get context snippet (e.g. 1st line of the block)
      const context = content.split('\n').slice(startLine - 1, Math.min(startLine + 2, endLine)).join('\n');
      
      symbols.push({
        file: path.relative(projectDir, fullPath),
        symbolName: name,
        symbolType: type,
        line: startLine,
        endLine: endLine,
        context: context.trim(),
        traced: !!reqId,
        requirementId: reqId
      });
    };
    
    const traverseFn = babelTraverse.default || babelTraverse;
    traverseFn(ast, {
      ClassDeclaration(path) {
        processNode(path.node, 'class', 'AnonymousClass');
      },
      FunctionDeclaration(path) {
        processNode(path.node, 'function', 'AnonymousFunction');
      },
      VariableDeclarator(path) {
        // Handle arrow functions assigned to variables
        if (path.node.init && (path.node.init.type === 'ArrowFunctionExpression' || path.node.init.type === 'FunctionExpression')) {
          processNode(path.node, 'function', path.node.id?.name);
        }
      },
      ClassMethod(path) {
        processNode(path.node, 'method', path.node.key?.name);
      },
      ObjectMethod(path) {
        processNode(path.node, 'method', path.node.key?.name);
      }
    });
    
  } catch (e) {
    // If AST parsing fails (e.g. syntax error), throw so fallback can catch it
    throw new Error('AST Parse Error: ' + e.message);
  }
  
  return symbols;
}
