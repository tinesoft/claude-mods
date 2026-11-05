# 12 - Does summary.ts cover the cloud text summary?

Ticket: `.scratch/craftory-mvp/issues/12-cloud-summary.md` (Status untouched).

## Verdict

Yes for the core: `markdownSummary` in `mods/craftory/src/summary.ts` produces the "text summary of the active feature, at most" that DESIGN.md Surfaces promises for claude.ai/code cloud, and `/craftory` returns it. Gaps are small and mostly about tests and one DESIGN/README disagreement.

## Evidence

- DESIGN.md Surfaces: cloud row "`/craftory` replies with a text summary of the active feature, at most"; chat and `claude -p` row "Nothing" (`docs/design/craftory/DESIGN.md` lines 35-36). README.md line 68-69 says the same for cloud, but for chat/`-p`: "Nothing is drawn. `/craftory` replies in text where it is available".
- `mods/craftory/src/summary.ts` `markdownSummary(flow, plugin)`:
  - plugin missing -> `Craftory needs mattpocock-skills 1.3.x.`
  - no feature -> `No feature in flight. Start one with /grill-with-docs.`
  - otherwise `## <title>` plus one line per phase: `N. **Label** · State · meta` (meta from `phaseMeta`, state label from `PHASE_LOOKS`). Plain Markdown, no UI elements.
- Wiring: `mods/craftory/hooks/register.tsx` `command.run` for `craftory`: if `!(await drawsAnything($))` (unsupported Claude Code version, or `$.session.surfaces()` empty) it returns `{ text: markdownSummary(...) }` and opens no pane; otherwise opens the pane and replies `Opened the Craftory pane.` The command is registered `immediate: true` at `session.start`.
- Tests: `mods/craftory/tests/summary.test.ts` (2 tests) with `surfaces: []`: full 7-phase list for the feature fixture, asserts no pane opened; and the missing-plugin message. `pnpm nx test craftory` passes.

## Gaps

1. Cloud is not identified, only "no surfaces". The code cannot tell cloud from chat or `claude -p`; all three get the summary. This matches README ("replies in text where it is available") but contradicts the DESIGN.md "Nothing" row for chat and `-p`. Decide which doc is right and align the other. Likely there is no way for a mod to command-run on chat/`-p` anyway, so the DESIGN row is probably just "no UI". (Not verified against the Claude Code types; check `$.session.surfaces()` docs in `tools/claude-code-types/2.1.302/index.d.ts` ~line 2872 if it matters.)
2. Untested branch: "No feature in flight. Start one with /grill-with-docs." The second test is titled "with no feature or no plugin" but only covers the missing-plugin case. Nothing asserts the no-feature text.
3. Untested: unsupported Claude Code version on a drawing surface also takes the text path (`drawsAnything` includes `isSupported`). Behaviour is reasonable but unasserted.
4. Content is a phase list only. It does not state which phase is in focus or the next action (the band chip does, via `chipText`), the ticket list, or which feature is active when several exist. "At most" is satisfied; add these only if the MVP wants a more useful cloud reply.
5. No `claude plugin test` coverage of `summary.ts` as a pure helper (tests go through the command harness). Acceptable since the helper takes plain data.

## Suggested follow-ups (not done; no source edited)

- Add a test for the no-feature message and rename the second test.
- Reconcile DESIGN.md chat/`-p` row with README.
