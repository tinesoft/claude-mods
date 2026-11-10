# 04: Weekly architecture check and repo state file

**What to build:** With `automation.weeklyArchitecture` on, at `session.start` a band notice offers `/improve-codebase-architecture` when the repo's last run is over 7 days old and no Feature is mid-Build. Its findings arrive as `needs-triage` items in the Inbox. The last run lives in a new git-ignored, per-repo `.craftory/state.json` as `architectureLastRun` (ISO date), written only when the skill reports done, so a cancelled run does not count. Config stays settings only. Uses the automation notice from 01.

**Blocked by:** 01 (Automation notice pattern, proven with Handoff at 80%)

**Status:** ready-for-agent

- [ ] Off by default
- [ ] Notice when the last run is missing or over 7 days old; silent when within 7 days
- [ ] Skipped while any Feature is mid-Build
- [ ] The click submits `/improve-codebase-architecture`; findings show as `needs-triage` Inbox items
- [ ] `architectureLastRun` is written on the skill's done report, not on submit; a cancelled run leaves it unchanged
- [ ] `.craftory/state.json` is git-ignored by the setup Craftory writes
- [ ] Silent after dismiss for the session
- [ ] Settings exposes `weeklyArchitecture` as active
- [ ] Fake-world tests cover the 7-day rule, the mid-Build rule, cancelled run and dismiss
