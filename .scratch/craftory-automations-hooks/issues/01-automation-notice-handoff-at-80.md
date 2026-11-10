# 01: Automation notice pattern, proven with Handoff at 80%

**What to build:** With `automation.handoffAt80` on, a developer whose main session reaches 80% of its context window sees a band notice with a single **Write handoff** action; clicking it submits `/handoff`. The threshold comes from the token counts `turn.step` already sees, kept separate from the per-agent `worktrees.tokenBudget`. The notice never appears while a turn is running, shows once per session (re-armed only in a new session), stays gone after a dismiss, and is never offered to subagents. Craftory submits the command only; it edits no files. The Settings row for the switch drops its "Not active yet" note. This ticket establishes the shared opt-in automation notice (visible before it acts, idle-only, one action, once per scope, silent after dismiss) that tickets 03, 04 and 06 reuse.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Off by default; with the switch off, no notice at any context level
- [ ] Notice appears at 80% of the main session's context, computed from token counts already seen per step
- [ ] Never shown while a turn runs; shown once the turn is idle
- [ ] **Write handoff** submits `/handoff`; nothing is submitted without the click
- [ ] Once per session; a dismiss silences it for the session; a new session re-arms it
- [ ] Subagents never see it; the per-agent token budget is unaffected
- [ ] Settings exposes `handoffAt80` as active
- [ ] Fake-world tests assert the notice, the submitted command, once-only firing, dismiss, switch off and the subagent case
- [ ] Latency test covers the new `turn.step` work
