# 06: Capture GitHub and GitLab fixtures from sandbox repos

**What to build:** Real `gh` and `glab` output for the wayfinder map shapes, captured from sandbox repos, so the readers are tested against what the CLIs actually return. The agent cannot do this: it needs sandbox repos and a logged-in `gh` and `glab`. Capture a representative map on each tracker, then rare states are hand-edited and marked "hand-made" in their header. Hand-made GitLab output is checked against the `glab` docs. Tickets 05 and 07 start with hand-made files and swap these in; they are not blocked on this.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] Sandbox repos exist on GitHub and GitLab with a map, sub-issues, an assignee, a blocker and closed items
- [ ] Raw `gh` and `glab` output is captured and handed over as fixture files
- [ ] Fixture headers state "captured" or "hand-made"
