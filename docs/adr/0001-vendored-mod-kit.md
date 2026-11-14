---
status: accepted
---

# Shared mod code is vendored, not imported

Claude Code installs a mod by copying only its own directory into the plugin cache, and loads `.ts` with no build step, so a mod cannot import from a sibling `libs/` project at runtime. The shared code lives in `libs/mod-kit` and `sync-kit` copies the files each mod lists in the `kit` field of its `package.json` into `mods/<mod>/src/_kit/`. The copies are committed and CI runs `sync-kit --check`, so the installed mod is self-contained and drift fails the build.

## Considered Options

- **Import across projects** (`../../libs/...`): passes `tsc` and tests, then fails after install.
- **Bundle at release time**: needs a build step the repo deliberately does not have, and the marketplace installs straight from the committed tree.
- **Publish to npm**: a mod has no install step to fetch it.

## Consequences

- A kit change is committed as a `fix(<mod>)` or `feat(<mod>)` in each mod whose copy changes, so that mod's version and changelog move. `mod-kit` is a commit scope only for kit-internal changes.
- Nx cannot see the copies as imports, so each mod declares `implicitDependencies: ["mod-kit"]`.
- `Tone` and `ThemeChoice` are owned by the kit. A mod's `types/index.d.ts` must be self-contained (`claude plugin validate --strict` rejects any `import` or `export … from`), so it cannot re-export them. It declares them itself, and each mod's `tests/kit-types.ts` fails typecheck if they differ from the kit's.
- Kit tests run through `claude plugin test` on an unpublished plugin shell, not a second runner.
