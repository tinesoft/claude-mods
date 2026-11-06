# 07: GitLab map reader

**What to build:** A developer on GitLab gets the same reading as GitHub instead of links only. A new reader uses the `wayfinder:map` label, `Part of #<map>` links and native blocking links (Premium), with a `Blocked by:` line as fallback, and returns the shared model. The surfaces light up with the kicker `Wayfinder · GitLab · #12`. Other trackers still get links only. Adds the same six scenarios as GitHub, hand-made until ticket 06 supplies captured output, and checked against the `glab` docs.

**Blocked by:** 05 (GitHub map reader)

**Status:** ready-for-agent

- [ ] GitLab is no longer links-only for maps
- [ ] State rules match GitHub's: structural children, closed is decided, assignee means claimed, native blocking first
- [ ] `no-native-links` fallback is covered
- [ ] Hand-made output is checked against the `glab` docs and headed "hand-made"
- [ ] Reader test file asserts every scenario; no live tracker is touched
