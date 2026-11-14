# 12: Release sign-off for `craftory@1.0.0`

**What to build:** The user does the human-only steps before release: README screenshots, a review of the automated end-to-end Local-tracker fixture run's result, and the GitHub and GitLab sandbox live check (captured under the wayfinder-rail spec, ticket 06 there). Then the `craftory@1.0.0` cut runs through `nx release` from `main`, never by hand.

**Blocked by:** 10, 11

**Status:** ready-for-human

- [x] README screenshots taken and committed
- [x] End-to-end Local-tracker fixture run result reviewed
- [ ] GitHub and GitLab sandbox live check done
- [ ] `craftory@1.0.0` released via `nx release` from `main`

## Notes

- Screenshots (2026-11-13): the terminal GIF `assets/screenshots/craftory.gif` and the Desktop GIF `assets/screenshots/craftory-desktop.gif` are in the Craftory README. Both were recorded from `mods/craftory/demo/` with the repo's `screen-recording` skill.
