# Which SDLC behaviors get enforced vs. guided

Type: grilling
Status: resolved

## Question

Does the designed hook set (plan.md "Event mapping") cover the automation and enforcement the SDLC workflow needs, and where does it stop?

## Answer

Coverage today: `session.start`, `skill.prompt` (soft gate confirm), `tool.call` Agent plus `classic.WorktreeCreate` (isolation, `maxParallel` queue), `turn.step` (token budget), `tool.call` (evidence refresh), `turn.complete` (status, next-phase suggestion), `session.end`. The three automations (handoff at 80%, retro on PR, weekly architecture check) are designed but unbuilt and off by default.

Decisions:

- **Soft gates stay the default.** Craftory may gain deny-hooks only as opt-in rules, off by default, one switch per rule in `.craftory/config.json`.
- **Two new observation-only hooks are added:** (b) run the repo's test command on `turn.complete` in a ticket worktree and mark the ticket Failed from the result; (c) a nudge when a turn ends with unmet Done-when evidence.
- **Branch protection (a) is not new work:** worktree isolation already keeps edits off the integration branch. Retro/drift on PR merge (d) is the existing automations item.
- **Mod hooks only.** Craftory ships no `.claude/settings.json` hooks into target repos; that would contradict "repo settings live in the repo".
