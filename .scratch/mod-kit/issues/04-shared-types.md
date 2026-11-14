# 04: Shared Tone and ThemeChoice types

**What to build:** The `Tone` and `ThemeChoice` types are declared once in the kit and re-exported by each mod's types file, so mod code keeps importing them from where it does today.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The kit owns both types and each mod vendors them
- [ ] Each mod's types file re-exports them and no mod import of these types changes
- [ ] Typecheck passes in the kit and both mods; both mods' existing tests pass unchanged

Spec: ../spec.md. Decision: docs/adr/0001-vendored-mod-kit.md.
