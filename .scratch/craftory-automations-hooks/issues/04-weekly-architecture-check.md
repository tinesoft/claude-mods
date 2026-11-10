# 04: Weekly architecture check and repo state file

**What to build:** With `automation.weeklyArchitecture` on, at `session.start` a band notice offers `/improve-codebase-architecture` when the repo's last run is over 7 days old and no Feature is mid-Build. Its findings arrive as `needs-triage` items in the Inbox. The last run lives in a new git-ignored, per-repo `.craftory/state.json` as `architectureLastRun` (ISO date), written only when the skill reports done, so a cancelled run does not count. Config stays settings only. Uses the automation notice from 01.

**Blocked by:** 01 (Automation notice pattern, proven with Handoff at 80%)

**Status:** resolved

- [x] Off by default
- [x] Notice when the last run is missing or over 7 days old; silent when within 7 days
- [x] Skipped while any Feature is mid-Build
- [x] The click submits `/improve-codebase-architecture`; findings show as `needs-triage` Inbox items
- [x] `architectureLastRun` is written on the skill's done report, not on submit; a cancelled run leaves it unchanged
- [x] `.craftory/state.json` is git-ignored by the setup Craftory writes
- [x] Silent after dismiss for the session
- [x] Settings exposes `weeklyArchitecture` as active
- [x] Fake-world tests cover the 7-day rule, the mid-Build rule, cancelled run and dismiss
