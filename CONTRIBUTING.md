# Contributing

Thanks for your interest in contributing to Thinking Monitor!

## Development Setup

```bash
# Clone the repo
git clone https://github.com/jwtor7/thinking.git
cd thinking

# Install dependencies
pnpm install

# Start development server (with hot reload)
pnpm dev

# Open dashboard
open http://localhost:3356
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run a single test file
npx vitest run src/server/secrets.test.ts

# Type checking
pnpm typecheck
```

## Code Style

- **TypeScript** — All code is TypeScript
- **Prettier** — Default formatting config
- **No classes where functions suffice** — Prefer functional patterns
- **Co-located tests** — Test files sit next to the modules they test (`*.test.ts`)

## Pull Request Workflow

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `pnpm test` and `pnpm typecheck` to verify
4. Submit a PR with a clear description of the change

## Architecture

See the [README](./README.md) for architecture overview. Key points:

- **Three build targets** — Server (Node.js), Dashboard (browser), Shared types
- **Dependency injection** — Dashboard modules communicate via callbacks, not imports
- **Security-first** — All user content is escaped, paths are validated, secrets are redacted
