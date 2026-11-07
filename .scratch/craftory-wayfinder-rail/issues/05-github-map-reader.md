# 05: GitHub map reader

**What to build:** A developer on GitHub sees their map's real state. Maps are issues labelled `wayfinder:map`, with their sub-issues and native dependencies read into the shared model. Without native support it falls back to a task list and `Blocked by:` lines. The surfaces from earlier slices light up for GitHub with the kicker `Wayfinder · GitHub · #12`. When the configured tracker is remote and a Local map also exists, both are read with no prompt. Adds GitHub scenarios `mixed`, `route-clear`, `closed-map`, `stale-link`, `prose-trap` and `no-native-links`, hand-made until ticket 06 supplies captured output (swap them in when it lands). Tests use canned CLI output only.

**Blocked by:** 01 (Local map in the rail chip)

**Status:** resolved

- [x] Children are structural only; a ticket mentioned in a comment never joins the map
- [x] Decided means closed; claimed means open with an assignee; blocked uses native links first, `Blocked by:` as fallback
- [x] `no-native-links` fallback is covered
- [x] Local and GitHub maps appear together without a prompt
- [x] Each fixture's header says "captured" or "hand-made"
- [x] Reader test file asserts state, blockers and claims for every scenario; no live tracker is touched
