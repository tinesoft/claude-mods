# 10: Release cleanup

**What to build:** The plan, README and Settings agree with the code for 1.0.0. Tick the stale M0, M2 and M3 boxes in the Craftory plan, close open items O1 and O2, and lift the "not built" and "Not active yet" wording in the README and Settings now that the features exist, using the Local tracker default from 09. Confirm the glossary and agent docs are committed (they appear to be already). Versions and `CHANGELOG.md` are never edited by hand.

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09

**Status:** resolved

- [x] Stale M0, M2 and M3 boxes ticked in the plan
- [x] O1 and O2 closed in the plan
- [x] No "not built" or "Not active yet" wording remains for built features in the README or Settings
- [x] README states the Local tracker default chosen in 09
- [x] Glossary and agent docs confirmed committed
- [x] No version or `CHANGELOG.md` edits

## Notes

- Plan: M0, M2, M3 and the M6 automations box ticked; M6 "Wayfinder parent rail; cloud text summary" ticked, with multi-context `GLOSSARY-MAP.md` recorded as left out of 1.0.0 on purpose. O1 and O2 moved into Decisions 23 and 24. The M1 glyph-width box and the M5 live-check and release box stay open for a human (tickets 11 and 12).
- Settings: the path hint now points at `.scratch/`, and the unused "Not active yet" row note is removed.
- README: Automations section, the test command under Build, a config keys table (`worktrees.test`, `worktrees.testTimeoutSec`, `automation.*`, `deny.*`), `.craftory/state.json` and the test command in the data tables, the `.scratch/` default, and the `GLOSSARY-MAP.md` exclusion.
