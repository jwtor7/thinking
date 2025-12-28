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

**Before any commit**, update version and changelog:

1. Bump version: `./scripts/bump-version.sh patch|minor|major`
2. Add entry to CHANGELOG.md with today's date
3. Include both in the commit

**Version bump rules:**
- `patch` - Bug fixes, small improvements
- `minor` - New features (backward compatible)
- `major` - Breaking changes

**Never commit code changes without updating version/changelog.**
