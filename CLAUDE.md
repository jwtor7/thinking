# Thinking Monitor - Project Instructions

## Development Workflow

This project uses a two-agent workflow for code changes:

### 1. code-implementer
Use for all implementation tasks:
- New features
- Bug fixes
- Refactoring
- Code modifications

### 2. code-test-evaluator
Use after code-implementer completes work:
- Verify implementation correctness
- Check edge cases
- Evaluate code quality
- Ensure security requirements are met

### Workflow Pattern
```
User request → code-implementer → code-test-evaluator → Done
```

## Security Requirements

All code must adhere to security requirements in the PRD:
- Localhost-only binding (127.0.0.1)
- No secret logging (redact API keys, tokens, passwords)
- XSS prevention (HTML-escape all rendered content)
- Path validation (only ~/.claude/ or temp directories)
- Input validation in hooks

## Architecture Reference

See `~/.claude/plans/splendid-hopping-fairy.md` for full PRD.

## Tech Stack

- TypeScript (strict mode)
- Node.js >= 22
- pnpm for package management
- esbuild for bundling
- ws for WebSocket server

## Versioning & Changelog (MANDATORY)

**Every code change requires version bump and documentation updates.**

### Release Workflow

```bash
# 1. Bump version (updates package.json, types.ts, types.test.ts, CHANGELOG.md)
./scripts/bump-version.sh patch|minor|major

# 2. Edit CHANGELOG.md - replace placeholder with actual changes
#    Use format: Added/Changed/Fixed/Security sections

# 3. Update README.md Recent Changes section with new version

# 4. Update README.md version badge if needed
#    [![Version](https://img.shields.io/badge/version-X.X.X-purple)]

# 5. Commit all changes together
git add -A && git commit -m "vX.X.X: Brief description"

# 6. Tag and push
git tag -a vX.X.X -m "vX.X.X: Brief description"
git push origin main --tags
```

### Version Bump Rules

| Type | When | Example |
|------|------|---------|
| `patch` | Bug fixes, small improvements | 0.9.0 → 0.9.1 |
| `minor` | New features (backward compatible) | 0.9.0 → 0.10.0 |
| `major` | Breaking changes | 0.9.0 → 1.0.0 |

### CHANGELOG Format

```markdown
## [X.X.X] - YYYY-MM-DD

### Added
- New features

### Changed
- Modifications to existing features

### Fixed
- Bug fixes

### Security
- Security improvements
```

### README Updates

Always update these sections:
1. **Version badge** in header (if major/minor)
2. **Recent Changes** section with new version entry
3. **Screenshot** if UI changed significantly (`docs/screenshot.png`)

**Never commit code changes without completing this workflow.**
