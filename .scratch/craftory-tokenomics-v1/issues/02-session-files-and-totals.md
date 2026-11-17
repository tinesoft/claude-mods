# 02: Committed session files and totals across sessions

**What to build:** This session's rollup is flushed to `.craftory/spend/<feature-slug>/<sessionId>.json` on main `turn.complete`, on `session.end`, and every 30 seconds while Build runs. Totals are read by summing every file in the folder, with this session's unflushed entries added on top. Two sessions or two people never write the same file, so there are no git conflicts.

**Blocked by:** 01

**Status:** resolved

- [x] `isWritable` allows `.craftory/spend/<slug>/<id>.json` only; it still refuses `..`, `.git` and other names (tests)
- [x] The file shape is `{ version: 1, session, user?, startedAt, rows }`; `user` comes from `git config user.email`, left out when unset
- [x] Flush points and the 30-second debounce; a failed write is retried at the next flush
- [x] `sumFiles` across sessions and people; a corrupt file is skipped and remembered for the Spend tab
- [x] Read on session start and on each tracker refresh; the status line shows the feature's total across sessions
- [x] Fake-world test: a second session's file is summed and never rewritten
