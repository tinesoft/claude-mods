# 07: Deny rules `skipGate` and `editOnIntegrationBranch`

**What to build:** Two opt-in guardrails, off by default. `deny.skipGate` blocks a gated phase's skill until its predecessor is done. `deny.editOnIntegrationBranch` blocks Edit and Write in the main checkout while it is on a `feat/*` branch, so work stays in worktrees. Each denial names the rule and the switch that turns it off. No `maxParallelHard` rule and no generic tool-and-pattern policy language.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `deny.skipGate` and `deny.editOnIntegrationBranch` parse in config, off by default, and appear in Settings
- [x] With switches off, no tool is ever denied by these rules
- [x] `skipGate` denies a gated phase's skill while its predecessor is not done, and allows it once done
- [x] `editOnIntegrationBranch` denies Edit and Write in the main checkout on `feat/*`; worktrees and other branches are unaffected
- [x] Each denial message names the rule and its switch
- [x] Fake-world tests assert each block message and the allowed cases; latency test covers the hooks
