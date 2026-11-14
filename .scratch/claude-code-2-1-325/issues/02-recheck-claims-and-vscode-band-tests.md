# 02: Re-check the 2.1.302 doc claims and test the VS Code band for real

**What to build:** After the pin is on 2.1.325, make the docs say what is true on it, and run the VS Code band tests through the real engine instead of the fake.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The VS Code band tests in `mods/craftory/tests/vscode-spacing.test.ts` mount the band with `mountBand($, 'vscode')` through the real `uiFor` wrappers, in place of `fake-ui` and `renderBand` (2.1.302's test engine refuses a band on `vscode`; see `docs/agents/vscode-surface.md`). The design docs' "from 2.1.323" band notes then become plain fact
- [ ] "Claude Code 2.1.302 attaches no surface for a mod" in VS Code (`mods/craftory/README.md`, `mods/session-activity/README.md`, `docs/design/*`): verified on 2.1.325 and reworded
- [ ] "A toast carries no action in 2.1.302" (`mods/craftory/src/signals.ts`, automations spec): verified and reworded
- [ ] `docs/design/*/plan.md` cite line numbers in the 2.1.302 snapshot. Leave them as history and say which snapshot they refer to
- [ ] Ticket 11 in `craftory-automations-hooks` records the live check on 2.1.321 and 2.1.322. Note the version if any of it is redone
- [ ] `pnpm nx affected -t lint typecheck validate test` passes
