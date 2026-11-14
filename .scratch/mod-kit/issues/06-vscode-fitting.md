# 06: VS Code fitting and recolouring in the kit

**What to build:** The VS Code box and button fitting become one kit module, the union of the two versions, with the blue-to-`claude` recolouring as a separate piece. Craftory composes both; Session activity uses only the fitting, so neither mod's look changes.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Kit exposes the space/wrap fitting and the button outline as one module, and the recolouring (box and text) as a separate one
- [x] Session activity vendors only the fitting and Craftory vendors both; the duplicate code in each mod is gone
- [x] The VS Code, spacing and surface tests of both mods pass unchanged
- [x] The cases covering only shared behaviour move to the kit and pass on kit source

Spec: ../spec.md. Decision: docs/adr/0001-vendored-mod-kit.md.
