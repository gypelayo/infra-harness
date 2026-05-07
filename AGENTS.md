# infra-harness

This file is loaded by pi automatically when working in this repo.

## Project structure

```
packages/pi-package/   pi package — extensions, skills, prompt templates
packages/desktop/      Tauri desktop app — React + Tailwind frontend, Rust backend
docs/                  Product documentation
TASKS.md               MVP task list
```

## Key conventions

- Pi package: TypeScript, loaded by jiti (no compilation step needed). Extensions in `packages/pi-package/extensions/`.
- Desktop: Tauri 2.x, React 18, Tailwind CSS 4. Frontend in `packages/desktop/src/`, Rust in `packages/desktop/src-tauri/src/`.
- Knowledge base: SQLite at `~/.infra-harness/kb.sqlite` (WAL mode). Shared between pi package (better-sqlite3) and Tauri (rusqlite).
- All code committed under gypelayo account.

## Common commands

```bash
# Install all dependencies
pnpm install

# Type-check pi package
pnpm --filter pi-package typecheck

# Build desktop app (dev)
pnpm --filter desktop tauri dev

# Build desktop app (release)
pnpm --filter desktop tauri build
```

## Task tracking

See `TASKS.md` for the full MVP task list. Update status markers as work progresses:
- `[ ]` not started
- `[~]` in progress
- `[x]` done
