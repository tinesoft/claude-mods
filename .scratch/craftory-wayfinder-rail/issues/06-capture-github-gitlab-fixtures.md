# 06: Capture GitHub and GitLab fixtures from sandbox repos

**What to build:** Real `gh` and `glab` output for the wayfinder map shapes, captured from sandbox repos, so the readers are tested against what the CLIs actually return. The agent cannot do this: it needs sandbox repos and a logged-in `gh` and `glab`. Capture a representative map on each tracker, then rare states are hand-edited and marked "hand-made" in their header. Hand-made GitLab output is checked against the `glab` docs. Tickets 05 and 07 start with hand-made files and swap these in; they are not blocked on this.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Sandbox repos exist on GitHub and GitLab with a map, sub-issues, an assignee, a blocker and closed items
- [x] Raw `gh` and `glab` output is captured and handed over as fixture files
- [x] Fixture headers state "captured" or "hand-made"

## Result (2026-11-11)

- Sandbox repos: `tinesoft/craftory-wayfinder-sandbox` on GitHub and on GitLab (both private), each with a `wayfinder:map` and five tickets: one closed, one assigned, three chained by blockers.
- Captured sets sit beside the hand-made ones as `captured/` scenarios under `tests/fixtures/wayfinder/1.3/{github,gitlab}/`, each with a test in `github-map.test.ts` and `gitlab-map.test.ts`.
- **Not swapped in:** the hand-made scenarios stay, because their `#12`–`#18` numbers are baked into many tests. Tickets 05 and 07 said to swap them in; the captured sets cover the real output instead.
- **GitLab gap:** the sandbox is on the free tier, where native blocking links are unavailable (the quick action posts, but no link exists and `/links` returns `[]`). The captured GitLab edges come from `Blocked by:` lines. A native `is_blocked_by` link is covered only by the hand-made files, so those headers still say "hand-made" and keep checking against the `glab` docs.
- GitLab now prints issue URLs as `/-/work_items/N`. Reads of `glab issue list` JSON are unaffected (`web_url` is present), but anything that parses a URL from live `glab issue create` output should accept both forms.
