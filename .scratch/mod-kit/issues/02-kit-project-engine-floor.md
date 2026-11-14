# 02: Mod kit project with the engine floor end to end

**What to build:** The `mod-kit` Nx project exists with lint, typecheck and test, and its tests run through the plugin test runner via an unpublished plugin shell. The engine floor moves out of both mods into the kit; each mod lists it in its Kit list and vendors it; every import of it keeps working. This proves Sync, its check, Nx and the installed-plugin path in one slice.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] `mod-kit` is an Nx project, never listed in the marketplace, with lint, typecheck and test targets that pass
- [x] The engine floor tests live in the kit and run once on kit source
- [x] Both mods' `package.json` carry a Kit list naming the engine floor, and the vendored copies are committed and pass `sync-kit --check`
- [x] ESLint ignores vendored copies
- [x] Each mod declares an implicit dependency on `mod-kit`, so `nx affected` re-tests both mods after a kit change
- [x] Both mods' existing tests pass unchanged
- [ ] A real `claude plugin install` of each mod loads it with no import outside its own directory (manual check recorded in the ticket)

**Manual check:** not yet done with a real `claude plugin install` (it replaces the installed marketplace, so left for the maintainer: `pnpm nx install <mod>`). Stand-in done: each mod directory copied alone to a temp dir, and every relative import in `hooks/` and `src/` resolves inside it.

Spec: ../spec.md. Decision: docs/adr/0001-vendored-mod-kit.md.
