# Contributing to Skyhook

Thank you for contributing! Skyhook is a community project and we welcome contributions of all kinds.

## Development Setup

### Prerequisites

- Node.js 18+
- Git
- An AI agent for testing (Codex, Claude Code, Gemini CLI)

### Clone & Install

```bash
git clone https://github.com/skyhook/skyhook.git
cd skyhook
npm install  # If package.json exists for tooling
```

### Project Structure

```
skyhook/
├── skill/
│   ├── plugin.json          # Skill manifest
│   ├── index.md             # Main documentation
│   ├── agent-protocol.md    # Agent integration protocol
│   ├── question-engine.md   # Question generation/interpreation
│   ├── schemas/             # YAML schemas
│   ├── standards/           # Built-in standards
│   ├── profiles/            # Project-type profiles
│   ├── templates/           # Project templates
│   ├── workflows/           # Lifecycle workflows
│   ├── cli/                 # CLI tool (skyhook.js)
│   └── examples/            # Example workflows
├── docs/                    # Documentation
├── examples/                # Example projects
├── README.md
├── LICENSE
└── CONTRIBUTING.md
```

## Making Changes

### 1. Standards Changes

Edit files in `skill/standards/`:
- Follow existing format
- Keep as defaults (advisory), not restrictions
- Document override mechanism
- Update version in header

### 2. Profile Changes

Edit files in `skill/profiles/`:
- Follow schema in `schemas/`
- Include detection heuristics
- Define defaults, questions, scaffold
- Test with `skyhook profile <name>`

### 3. Schema Changes

Edit files in `skill/schemas/`:
- Increment `schemaVersion` on breaking changes
- Provide migration guide
- Maintain backward compatibility within MAJOR
- Update templates to match

### 4. CLI Changes

Edit `skill/cli/skyhook.js`:
- Keep Node.js 18+ compatible
- No external dependencies (stdlib only)
- Follow existing command patterns
- Test all commands

### 5. Documentation

Edit files in `docs/` and `README.md`:
- Keep examples working
- Update when features change
- Clear, concise, practical

## Testing

### Manual Testing

```bash
# Test CLI
cd skill/cli
node skyhook.js version
node skyhook.js help

# Test init in temp directory
cd /tmp
mkdir test-skyhook && cd test-skyhook
git init
~/skyhook/skill/cli/skyhook.js init
~/skyhook/skill/cli/skyhook.js discover
~/skyhook/skill/cli/skyhook.js question requirements
~/skyhook/skill/cli/skyhook.js plan
~/skyhook/skill/cli/skyhook.js decide "Test decision"
~/skyhook/skill/cli/skyhook.js standards
```

### Agent Integration Testing

Test with your preferred agent:

1. **Codex**: Add skill path to instructions
2. **Claude Code**: Reference in CLAUDE.md
3. **Gemini CLI**: Use @skyhook reference

Verify:
- Agent reads .skyhook/ on startup
- Agent asks contextual questions
- Agent writes decisions/requirements
- Agent regenerates plan on changes

### Schema Validation

```bash
# Check YAML files are valid
node -e "const fs=require('fs'); const yaml=require('js-yaml'); console.log('Valid:', yaml.load(fs.readFileSync('skill/schemas/project.yaml', 'utf8')).schemaVersion)"
```

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/amazing-feature`
3. **Make** your changes with clear commits
4. **Test** thoroughly (see Testing section)
5. **Update** documentation if needed
6. **Submit** PR with:
   - Clear description of changes
   - Motivation/context
   - Testing performed
   - Screenshots if UI related

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`

Example:
```
feat(profiles): add mobile-app profile with Expo defaults

- Detection for Expo/React Native
- Default tech stack: Expo, TypeScript, NativeWind
- Questions for app store, push notifications, deep linking
- Scaffold with Expo router structure

Closes #42
```

## Release Process

Maintainers only:

1. Update version in `skill/plugin.json`
2. Update CHANGELOG.md
3. Create git tag: `git tag v1.0.1`
4. Push tag: `git push origin v1.0.1`
5. GitHub Actions builds and publishes

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers
- No harassment, discrimination, or spam

## Getting Help

- **Issues**: Bug reports, feature requests
- **Discussions**: Questions, ideas, design discussions
- **Discord**: Real-time chat (if available)

## Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- CONTRIBUTORS.md (if maintained)

Thank you for making Skyhook better! 🚀
