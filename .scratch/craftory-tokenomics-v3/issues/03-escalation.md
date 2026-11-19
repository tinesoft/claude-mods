# 03: Retry a stuck ticket on a stronger model

**What to build:** In the Build card's agent list, a Failed or Over budget ticket offers **Retry on opus** (`routing.escalateTo`, default `opus`; `session` hides it). It shows only when that model differs from the one the ticket's last agent ran on, which is kept on the agent record at spawn. The press records a pending escalation and submits `/implement <ticket>` with a context line asking Claude to retry in the kept worktree. The next spawn for that ticket gets the escalation model (over Build's routing) and reuses the kept worktree and branch. The pending escalation is then cleared.

**Blocked by:** 01

**Status:** resolved

- [x] `routing.escalateTo` config key; Settings row; config and settings tests
- [x] The agent record keeps the model it spawned on
- [x] Button rule (state, escalateTo, last model); table tests
- [x] The press submits `/implement <ticket>` with the context; the next spawn gets the model and reuses the kept worktree and branch; fake-world tests
