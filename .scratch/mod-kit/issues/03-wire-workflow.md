# 03: Wire Sync into CI, commits, release and docs

**What to build:** Maintainers run the drift check the way they run the other checks, kit-internal commits are accepted, the kit is never released, and the contributing docs say how shared code works.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `sync-kit --check` runs in the pre-push checks and in CI next to the version-sync check
- [ ] `mod-kit` is an allowed commit scope in commitlint
- [ ] `mod-kit` is excluded from `nx release` projects and the marketplace
- [ ] CONTRIBUTING.md and CLAUDE.md have a short shared-code section: edit the kit, run Sync, never edit `_kit`, commit the sync under each mod's scope
- [ ] A deliberately edited vendored file fails the check in CI

Spec: ../spec.md. Decision: docs/adr/0001-vendored-mod-kit.md.
