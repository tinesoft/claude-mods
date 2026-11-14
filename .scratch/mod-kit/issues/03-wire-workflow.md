# 03: Wire Sync into CI, commits, release and docs

**What to build:** Maintainers run the drift check the way they run the other checks, kit-internal commits are accepted, the kit is never released, and the contributing docs say how shared code works.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] `sync-kit --check` runs in the pre-push checks and in CI next to the version-sync check
- [x] `mod-kit` is an allowed commit scope in commitlint
- [x] `mod-kit` is excluded from `nx release` projects and the marketplace
- [x] CONTRIBUTING.md and CLAUDE.md have a short shared-code section: edit the kit, run Sync, never edit `_kit`, commit the sync under each mod's scope
- [x] A deliberately edited vendored file fails the check in CI

**Notes:** `mod-kit` was already an allowed scope (commitlint takes every Nx project name) and is outside `nx release` (`mods/*`) and the marketplace; verified, no change needed. The deliberate-edit failure was run locally (`sync-kit --check` exit 1, naming mod and file); CI runs the same command.

Spec: ../spec.md. Decision: docs/adr/0001-vendored-mod-kit.md.
