# 09: Remove the `command.run` context fallback

**What to build:** Probe 08 showed that a plugin's `$.command.run` of a skill command raises `prompt.submit` (with `command` and a plugin origin), that `startContext` there reaches the model's turn, and that a `context` added by a `command.run` hook after `next(e)` does not. Remove the unmatched `command.run` hook in `hooks/register.tsx` that adds the retry line and the spend summary, `commandRunContext` in `hooks/shell/flow.ts`, and the `contextGiven` once-per-run atom (`hooks/shell/context-once.ts`) if nothing else uses it. Update the tests and the README's "Data, programs and permissions" and "Limits" (the `command.run` line and the "not yet confirmed" line).

**Blocked by:** none

**Status:** resolved

- [x] No `command.run` hook adds context; `prompt.submit` still gives the retry line, the spend summary and the integration line once per run
- [x] A test shows a pressed `/retro` and a pressed Retry on … get their line once, from `prompt.submit`
- [x] README matches the code
- [x] `pnpm nx affected -t lint typecheck validate test` passes
