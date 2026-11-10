# 03: Retro on PR

**What to build:** With `automation.retroOnPr` on, when the active Feature's PR is merged, a band notice offers `/retro`. The merge is caught by the existing `tool.call` evidence refresh during the session, and at `session.start` for a merge made while away. One notice per Feature; a dismiss is final for that Feature. The Retro phase completes from the ranked suggestions `/retro` produced, read as its evidence. Uses the automation notice from 01.

**Blocked by:** 01 (Automation notice pattern, proven with Handoff at 80%)

**Status:** ready-for-agent

- [ ] Off by default
- [ ] A merge seen in-session raises the notice once the turn is idle
- [ ] A merge made outside the session raises the notice at `session.start`
- [ ] The click submits `/retro`; one notice per Feature; silent after dismiss
- [ ] The Retro phase reads the ranked suggestions as its evidence and completes by fact
- [ ] Settings exposes `retroOnPr` as active
- [ ] Fake-world tests cover in-session and out-of-session merges, once-only, dismiss and switch off
