# 01: Move the pinned Claude Code from 2.1.302 to 2.1.323

**What to build:** Move the pin to 2.1.323 for both mods, following CONTRIBUTING.md's "Updating the pinned Claude Code version", and fix what the new types and engine break. Deferred from the Craftory `1.0.0` sign-off so the release isn't held up by an API migration. Craftory 1.0.0 ships on 2.1.302.

**Blocked by:** None (can start immediately). Best done after `craftory@1.0.0` is released.

**Status:** ready-for-agent

- [ ] `tools/claude-code-types/2.1.323/index.d.ts` added, `2.1.302` removed
- [ ] Pin updated: `CLAUDE_CODE_VERSION` in `ci.yml` and `release.yml`, both `tsconfig.json` `include`s, the `version` default in both `tests/harness.ts`, the READMEs' "Tested with" lines, root `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`
- [ ] `pnpm nx run-many -t lint typecheck validate test` passes on 2.1.323
- [ ] `claude plugin validate . --strict` passes at the root
- [ ] Doc claims tied to 2.1.302 re-checked (see below)
- [ ] The VS Code band tests in `mods/craftory/tests/vscode-spacing.test.ts` mount the band with `mountBand($, 'vscode')` through the real `uiFor` wrappers, in place of `fake-ui` and `renderBand` (2.1.302's test engine refuses a band on `vscode`; see `docs/agents/vscode-surface.md`). The design docs' "from 2.1.323" band notes then become plain fact

## Getting the snapshot

Claude Code writes `.claude-plugin/types/claude-code/index.d.ts` only in an interactive session that loads the mod. `claude plugin validate` and `claude -p` don't write it. This worked from the devcontainer, with the local `claude` at 2.1.323:

```sh
(sleep 20; printf '\003\003') | timeout 40 script -qec "claude --plugin-dir mods/craftory" /dev/null >/dev/null 2>&1
head -1 mods/craftory/.claude-plugin/types/claude-code/index.d.ts   # must say 2.1.323
```

Then copy that file to `tools/claude-code-types/2.1.323/index.d.ts`. The two snapshots differ by about 7,700 diff lines.

## What broke in a trial run (2026-11-13)

Pin moved, nothing else changed:

- **craftory typecheck (14 errors):**
  - `hooks/register.tsx` (~356-478): the `Edit`/`Write` tool-call hook fields are now `unknown`, and the shared `guard` handler no longer fits the `Edit`/`Write` overloads.
  - The site context now requires `isCollapsed`: `tests/band.test.ts`, `handoff.test.ts`, `harness.ts`, `rail.test.ts`, `retro-on-pr.test.ts`.
- **session-activity typecheck (4 errors):** the same `isCollapsed` gap in `tests/band.test.ts` and `tests/harness.ts`.
- **craftory tests (2 fail):** "another mod's row stays in its own row above the notice" and "another mod's row is drawn in its own row above the rail". The band layout changed.
- **session-activity tests (4 fail):** "the band keeps another mod content first", "an asked call that runs ends as approved, not pending", "every observed event reaches the caller exactly as the engine answered it", "an asked call that never ran shows a denied toast". The first looks like the same band change. The other three are permission-result behaviour.
- **`validate --strict`:** fails for both mods. Warnings not yet read.

## Re-check on the new version

- "Claude Code 2.1.302 attaches no surface for a mod" in VS Code (`mods/craftory/README.md`, `mods/session-activity/README.md`, `docs/design/*`). Verify it still holds.
- "A toast carries no action in 2.1.302" (`mods/craftory/src/signals.ts`, automations spec).
- `docs/design/*/plan.md` cite line numbers in the 2.1.302 snapshot. Leave them as history, or say which snapshot they refer to.
- Ticket 11 in `craftory-automations-hooks` records the live check on 2.1.321 and 2.1.322. Note the version if you redo any of it.
