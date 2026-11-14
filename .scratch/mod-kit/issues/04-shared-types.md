# 04: Shared Tone and ThemeChoice types

**What to build:** The `Tone` and `ThemeChoice` types are declared once in the kit and re-exported by each mod's types file, so mod code keeps importing them from where it does today.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] The kit owns both types and each mod vendors them
- [ ] Each mod's types file re-exports them and no mod import of these types changes
- [x] Typecheck passes in the kit and both mods; both mods' existing tests pass unchanged

**Notes:** `claude plugin validate --strict` rejects any `import` or `export … from` in `types/index.d.ts` ("the contract must be self-contained"), so the types file cannot re-export from the vendored copy. It keeps its own declarations, and each mod gets `tests/kit-types.ts`, a type-level guard that fails typecheck when the mod's `Tone` or `ThemeChoice` (Session activity: `ChipTheme`) differs from the kit's. Checked by changing the kit type: typecheck failed.

Spec: ../spec.md. Decision: docs/adr/0001-vendored-mod-kit.md.
