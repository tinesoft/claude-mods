# 01: Sync tool

**What to build:** A repo tool that, for each mod, writes the kit modules the mod's Kit list names (and any kit module those import) into the mod's committed `_kit` folder, each with a generated-file header. A `--check` mode reports drift without writing. It works against any kit and mods it is pointed at, so it is verifiable before the real kit exists.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Sync writes exactly the listed modules and their kit imports; unlisted modules are absent
- [x] Running Sync twice changes nothing
- [x] Removing a name from a Kit list removes its vendored file
- [x] An unknown kit module name is an error
- [x] Naming one mod syncs only that mod
- [x] `--check` exits non-zero and names the mod and file when a copy is edited, deleted, or the kit changed; exits zero when in sync
- [x] Behaviour is tested on a temporary workspace (spec seam 1) and follows the conventions of the version sync tool

Spec: ../spec.md. Decision: docs/adr/0001-vendored-mod-kit.md.
