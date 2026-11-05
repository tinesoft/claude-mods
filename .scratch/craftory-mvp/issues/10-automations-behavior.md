# What the three automations do

Type: grilling
Status: resolved

## Question

Exactly what do handoff at 80% context, retro on PR and the weekly architecture check each do: trigger, what they submit, where output lands, what they never do, and how the 'last run over 7 days' fact is stored and read?

## Answer

All three automations are off by default, one switch each in `.craftory/config.json` (`handoffAt80`, `retroOnPr`, `weeklyArchitecture`). None ever runs without its switch on, submits while a turn is running, edits files itself, auto-submits without a visible band notice first, or repeats after a dismiss. Craftory only submits the command and observes the outcome; the skill decides which files it writes.

- **Handoff at 80%**: 80% of the main session's context window, read from the token counts `turn.step` already sees. Separate from the per-agent token budget; subagents are never handed off. Shows a band notice with a "Write handoff" action that submits `/handoff` on a click. Fires once per session and re-arms only in a new session. Output location is the skill's; Craftory links the handoff document from the Feature's card.
- **Retro on PR**: fires when the mod observes the Feature's PR as merged, from the `tool.call` evidence refresh that already tracks the PR; `session.start` catches a PR merged outside the session. Offers `/retro` as a band notice, one per Feature. `/retro` updates whatever files it needs; Craftory reads the ranked suggestions as the Retro phase evidence.
- **Weekly architecture check**: runs at `session.start` when the last run is over 7 days old, per repo, and only when no Feature is mid-Build. Submits `/improve-codebase-architecture`; findings land as new `needs-triage` items in the Inbox.
- **Last-run fact**: stored in `.craftory/state.json`, git-ignored, per repo: `{ "architectureLastRun": "<ISO date>" }`. Config stays settings only. Written when the skill reports done, not when submitted, so a cancelled run does not count.
