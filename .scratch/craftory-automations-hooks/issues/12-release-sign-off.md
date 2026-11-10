# 12: Release sign-off for `craftory@1.0.0`

**What to build:** The user does the human-only steps before release: README screenshots, a review of the automated end-to-end Local-tracker fixture run's result, and the GitHub and GitLab sandbox live check (captured under the wayfinder-rail spec, ticket 06 there). Then the `craftory@1.0.0` cut runs through `nx release` from `main`, never by hand.

**Blocked by:** 10, 11

**Status:** ready-for-human

- [ ] README screenshots taken and committed
- [ ] End-to-end Local-tracker fixture run result reviewed
- [ ] GitHub and GitLab sandbox live check done
- [ ] `craftory@1.0.0` released via `nx release` from `main`
