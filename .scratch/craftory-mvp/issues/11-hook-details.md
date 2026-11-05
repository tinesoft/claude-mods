# Details of the added hooks

Type: grilling
Status: resolved

## Question

Following the enforced-vs-guided decision: where does the `turn.complete` test command come from, when does it fire, what wording and trigger does the unmet-Done-when nudge use, and which opt-in deny rules exist with what config shape?

## Answer

All three additions are observation-only except the opt-in deny rules, and every switch is off or inert by default.

- **Test command source**: a new `worktrees.test` string in `.craftory/config.json` (for example `"pnpm nx affected -t test"`). Unset means the hook does nothing. Craftory never guesses and never parses prose.
- **When it fires**: on `turn.complete` for a Build implementer's final turn in its ticket worktree, once per turn end. Never mid-run, never for the main session. It never re-prompts the agent and never blocks the turn.
- **Result**: a non-zero exit marks the ticket Failed, with the output tail shown in the ticket card. `worktrees.testTimeoutSec` (default 600) turns a timeout into Failed with the reason "timed out". `keepFailed` keeps the worktree. The next implementer turn re-runs the test and can clear Failed, since state is recomputed from evidence.
- **Unmet Done-when nudge**: a band notice with no submit action, fired when a turn ends in a Running phase whose Phase-evidence condition is unmet. At most once per phase per Feature; dismissal is per Feature. Wording names the phase and quotes the unmet condition from the Phase evidence table, for example "Align is still running: no spec has been created yet. Ask for it, or mark Align done." Switch: `automation.nudgeUnmetDone`, off by default.
- **Opt-in deny rules**: `{ "deny": { "skipGate": false, "editOnIntegrationBranch": false } }`. `skipGate` blocks a gated phase's skill until its predecessor is done. `editOnIntegrationBranch` blocks Edit and Write in the main checkout on `feat/*`. A denial names the rule and the switch that turns it off. `maxParallelHard` is dropped because the queue covers it, and a generic tool-and-pattern rule list is out as a policy language.
