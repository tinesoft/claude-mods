Status: ready-for-agent

# Mod kit: shared mod code, vendored into each mod

## Problem Statement

Craftory and Session activity are separate mods that each carry their own copy of the same code: the engine floor check and the appearance probes are identical, the VS Code box and button fitting is duplicated, and the tone resolution, colour mixing and spacing helpers are copied with small differences. The copies have started to drift (Craftory's VS Code box also recolours blues; its tone input differs). A fix to one has to be remembered for the other, and every new mod would copy them again.

The obvious fix, a shared Nx library the mods import, does not work. Claude Code installs a mod by copying only that mod's directory into the plugin cache and loads `.ts` with no build step, so an import that leaves the mod's directory resolves in the repo and fails once installed (confirmed against the installed `session-activity` cache directory). See `docs/adr/0001-vendored-mod-kit.md`.

## Solution

The maintainer edits shared code in one place, the **Kit** (`libs/mod-kit`). Each mod lists the kit modules it uses in its **Kit list**. A **Sync** step writes a **Vendored copy** of exactly those modules into the mod, committed alongside it, so the installed mod is self-contained. A check mode of Sync fails CI when any copy differs from the kit, so a copy cannot be edited by hand or fall behind unnoticed. Nx knows every mod depends on the kit, so a kit change re-lints, re-typechecks and re-tests every mod.

## User Stories

1. As a mod maintainer, I want one place to edit shared mod code, so that a fix reaches every mod.
2. As a mod maintainer, I want each mod to list the kit modules it uses, so that the dependency is explicit and a mod carries only what it needs.
3. As a mod maintainer, I want one command that regenerates every vendored copy, so that I never copy files by hand.
4. As a mod maintainer, I want that command to take an optional mod name, so that I can sync one mod.
5. As a mod maintainer, I want a check mode that fails when a vendored copy differs from the kit, so that drift is caught before merge.
6. As a mod maintainer, I want the check to name the mod and file that drifted and say to run Sync, so that the fix is obvious.
7. As a mod maintainer, I want a vendored copy to start with a "generated, do not edit" header, so that nobody edits it.
8. As a mod maintainer, I want lint to skip vendored copies, so that the kit's own style is not enforced twice.
9. As a mod maintainer, I want Sync to fail when a mod lists a kit module that does not exist, so that typos surface at once.
10. As a mod maintainer, I want Sync to remove a vendored file when the mod no longer lists it, so that stale copies do not linger.
11. As a mod maintainer, I want Sync to be idempotent, so that running it twice changes nothing.
12. As a mod maintainer, I want kit modules to depend only on other kit modules and on the `claude-code` types, so that any listed module can be copied alone.
13. As a mod maintainer, I want Sync to pull in the kit modules a listed module imports, so that a copy never has a dangling import.
14. As a mod maintainer, I want the kit's tests to live in the kit and run once on the kit source, so that shared behaviour is tested in one place.
15. As a mod maintainer, I want the mods' existing tests to keep passing unchanged against the vendored copies, so that the extraction is provably behaviour-preserving.
16. As a mod maintainer, I want `nx affected` to run every mod's checks when the kit changes, so that a kit change cannot break a mod unseen.
17. As a mod maintainer, I want the kit to have its own lint, typecheck and test targets, so that it meets the bar every mod does.
18. As a mod maintainer, I want the shared `Tone` and `ThemeChoice` types declared once in the kit and re-exported by each mod's types, so that the types cannot diverge.
19. As a mod maintainer, I want a kit change committed in each mod it changes, as a `fix` or `feat` scoped to that mod, so that the mod's version and changelog move with the code users receive.
20. As a mod maintainer, I want `mod-kit` accepted as a commit scope for kit-internal changes, so that commitlint does not reject them.
21. As a mod maintainer, I want the kit never published as a plugin or listed in the marketplace, so that users never see it.
22. As a mod maintainer, I want Sync and its check wired into the pre-push checks and CI next to the version-sync check, so that I run them the way I run the others.
23. As a mod maintainer, I want the Sync tool to follow the repo's existing tool conventions (a `--check` flag, a non-zero exit on drift), so that it feels like `sync-plugin-version`.
24. As a user of an installed mod, I want the mod to work with no files outside its own directory, so that installing from the marketplace works.
25. As a user of Craftory or Session activity, I want no change in how either looks or behaves after the extraction, so that a refactor costs me nothing.
26. As a future mod author, I want to add a kit list to a new mod and get the shared modules, so that I do not copy code again.
27. As a future mod author, I want the kit's glossary to define Kit, Vendored copy, Kit list and Sync, so that the words mean one thing.

## Implementation Decisions

- **Kit project.** A new Nx library, `mod-kit`, at `libs/mod-kit`, with lint, typecheck and test targets and no dev, install or validate-as-plugin targets. It is never listed in the marketplace and never released on its own. It is excluded from `nx release` projects.
- **Kit list.** Each mod's `package.json` gains a `kit` field: an array of kit module names. It is the single source of what a mod vendors.
- **Sync tool.** A repo tool in `tools/`, shaped like `sync-plugin-version`: no args syncs every mod, mod names narrow it, `--check` reports drift and exits non-zero without writing. Sync writes each listed kit module, and any kit module it imports, into the mod's vendored directory; removes vendored files no longer reachable from the list; prefixes each copy with a generated-file header; and is idempotent. A listed name with no kit module is an error.
- **Vendored location.** Copies live in the mod's source directory under a fixed `_kit` folder and are committed, because the plugin cache is a copy of the committed tree.
- **Kit module rules.** A kit module imports only other kit modules, the virtual `claude-code` module, and kit-owned types. It never imports from a mod.
- **Types.** The kit owns `Tone` and `ThemeChoice` in a kit types module. Each mod's types file re-exports them from its vendored copy and keeps its mod-specific types. Mods keep importing `Tone` and `ThemeChoice` from their types file, so no mod import changes.
- **Nx wiring.** Each mod declares an implicit dependency on `mod-kit`. The kit's source counts as an input to every mod's lint, typecheck, validate and test through that dependency. Vendored copies are ignored by ESLint.
- **Commits and release.** Release stays independent per mod. A commit that updates a vendored copy is scoped to that mod and typed `fix` or `feat`. `mod-kit` is added to the allowed commit scopes for kit-internal commits. `version-actions` is unchanged.
- **First extraction (tracer bullet).** The engine floor, the appearance probes, the VS Code box and button fitting, and the `Tone` types. The engine floor alone goes first, to prove Sync, its check, the Nx dependency, CI and an installed mod end to end. The two VS Code implementations merge into the union: Craftory's blue-to-`claude` recolouring is applied by Craftory's box, and Session activity keeps its current look, so the kit exposes the fitting and the recolouring separately and each mod composes what it uses.
- **Later slices, not in this spec.** Tone resolution over a shared input shape, colour mixing and the across/down spacing helpers, then the shared test harness pieces.
- **Docs.** The repo's contributing guide and the agent instructions gain a short "shared code" section: edit the kit, run Sync, never edit `_kit`. The kit has its own glossary, already listed in the glossary map.

## Testing Decisions

- **A good test** checks what a maintainer or an installed mod can observe: files written, drift reported, exit status, and the mods' unchanged behaviour. It does not test how Sync walks imports.
- **Seam 1: the Sync tool.** Tested as external behaviour against a temporary workspace holding a small kit and two mods: Sync writes exactly the listed modules and their kit imports; unlisted modules are absent; re-running changes nothing; removing a name from a list removes its copy; `--check` exits non-zero and names the mod and file after a copy is edited, a copy is deleted, or the kit changes; an unknown kit module name is an error; naming one mod leaves the other untouched. Prior art: the `--check` mode of the template vendoring tool and the version sync tool.
- **Seam 2: the mods' existing tests.** The engine-floor, appearance, VS Code, surface and spacing tests in both mods keep running against the vendored copies and must pass unchanged. Tests that cover only shared code (the identical appearance test, the engine-floor and VS Code fitting cases) move into the kit and run once on kit source, run through the same plugin test runner the mods use, via an unpublished plugin shell, so there is no second test runner.
- No installed-plugin test is added. Self-containment is covered by the vendoring rule and a manual check against a real `claude plugin install` for the first ticket.

## Out of Scope

- Extracting tone resolution, colour mixing, spacing helpers, token tables, `clip`, icons, or any UI component. These are later slices.
- The shared test harness.
- Craftory-only code (git, tracker, evidence, features) and each mod's pane, rail, band and register code.
- Publishing the kit anywhere, or bundling at release time.
- Changing either mod's behaviour, appearance, settings or version.
- Deriving the Nx dependency from the Kit list automatically.
- Sharing `tsconfig` or `project.json` between mods.

## Further Notes

- Evidence for the premise: the installed `session-activity` cache directory contains only that mod's own folders, with no repo root or `libs` beside it.
- The decision and its rejected alternatives are recorded in `docs/adr/0001-vendored-mod-kit.md`; vocabulary is in `libs/mod-kit/GLOSSARY.md`.
- The repo's existing pre-push checks are the model for where Sync's check is wired in.
