# 05: Test hook after a Build implementer's final turn

**What to build:** A developer sets `worktrees.test` to their project's test command. After a Build implementer's final turn, Craftory runs it in that ticket's worktree, once per turn end. A non-zero exit marks the ticket Failed with the output tail on the ticket card; exceeding `worktrees.testTimeoutSec` (default 600) marks it Failed with the reason "timed out". `keepFailed` keeps the failed worktree. The next implementer turn re-runs the test and clears Failed on success, because state is recomputed from evidence. With `worktrees.test` unset the hook does nothing; Craftory never guesses a command. It never fires mid-run or for the main session, never re-prompts the agent and never blocks the turn (it calls `next(e)`).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `worktrees.test` (unset by default) and `worktrees.testTimeoutSec` (default 600, validated range) parse in config and appear in Settings
- [x] Unset command: no run, no state change
- [x] Runs only after a Build implementer's final turn, in its ticket worktree; never mid-run, never for the main session
- [x] Non-zero exit → ticket Failed with the output tail on its card
- [x] Timeout → ticket Failed with "timed out"
- [x] `keepFailed` keeps the worktree of a failed ticket
- [x] A passing re-run on the next turn clears Failed
- [x] The hook never blocks the turn or re-prompts the agent
- [x] Fake-world tests cover Failed, "timed out", cleared and unset; config tests pin defaults; latency test covers the hook
