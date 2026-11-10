# 08: Cloud text summary: next action, branch tests and docs

**What to build:** A user running `/craftory` on claude.ai/code cloud or `claude -p` gets the text summary of the active Feature, optionally ending with the next action. The "No feature in flight" and unsupported-version replies are covered by tests, and DESIGN.md and the README describe the chat and `claude -p` replies as they actually behave.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The summary can name the next action
- [ ] Tests cover the three branches: a Feature in flight, "No feature in flight", an unsupported Claude Code version
- [ ] DESIGN.md and the README match the code's chat and `claude -p` replies
