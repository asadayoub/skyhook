# Tutorial 3: Authoring Custom Language Parsers

Skyhook's AST Tracer includes built-in parsers for JavaScript/TypeScript, Python, Go, Rust, and Java. If your repository uses another language (e.g. Ruby, C#, PHP, Swift, Kotlin), you can register a custom parser plugin without modifying Skyhook's core engine.

---

## 1. Parser Architecture & Base Interface

All parsers implement the standard parser interface expected by [`ParserRegistry.js`](file:///Users/asad/Documents/Codex/2026-08-29/wh/skyhook-repo/skyhook/lib/parsers/ParserRegistry.js):

```javascript
export class CustomRubyParser {
  constructor() {
    this.name = 'RubyParser';
    this.supportedExtensions = ['.rb', '.rake'];
    this.priority = 10;
  }

  /**
   * Determine whether this parser handles the given file path
   * @param {string} filePath
   * @returns {boolean}
   */
  supports(filePath) {
    return this.supportedExtensions.some(ext => filePath.endsWith(ext));
  }

  /**
   * Parse file content and extract symbols and @skyhook-implements annotations
   * @param {string} content - Raw file text
   * @param {string} filePath - Absolute or relative file path
   * @returns {{ symbols: Array<Object>, imports: Array<string> }}
   */
  parse(content, filePath) {
    const symbols = [];
    const imports = [];

    // Parse classes, methods, and '# @skyhook-implements' comments
    const lines = content.split('\n');
    let pendingRequirements = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for annotation: # @skyhook-implements REQ-001
      if (line.startsWith('# @skyhook-implements')) {
        const matches = line.match(/REQ-[\w-]+/g);
        if (matches) pendingRequirements.push(...matches);
        continue;
      }

      // Check for class or def
      const defMatch = line.match(/^def\s+([a-zA-Z0-9_!?]+)/);
      if (defMatch) {
        symbols.push({
          name: defMatch[1],
          type: 'method',
          line: i + 1,
          implements: [...pendingRequirements]
        });
        pendingRequirements = [];
      }
    }

    return { symbols, imports };
  }
}
```

---

## 2. Registering Your Parser Plugin

Place your parser script in `.skyhook/parsers/RubyParser.js`:

```
.skyhook/
└── parsers/
    └── RubyParser.js
```

Skyhook automatically discovers and dynamically registers any parsers found in `.skyhook/parsers/` at startup.

---

## 3. Verifying Your Custom Parser

Run `skyhook coverage` or `skyhook trace` on a Ruby source file:

```ruby
# In app/services/transfer_service.rb:
# @skyhook-implements REQ-001
def execute_transfer(from_account, to_account, amount)
  # ...
end
```

Now verify:
```bash
skyhook trace REQ-001
```
Skyhook will invoke your `RubyParser.js`, extract `execute_transfer` at line 3, and link it to `REQ-001`.
