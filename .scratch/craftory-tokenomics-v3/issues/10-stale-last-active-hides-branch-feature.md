# 10: A stale remembered Feature can hide the Feature on the current branch

**What to build:** Find out whether a stale `lastActive` in the plugin store keeps Craftory from seeing the Feature on the current branch, and fix it if so.

Probe 08 (2026-11-19, Claude Code 2.1.328) hit it in the demo repo. `~/.claude/plugins/store/craftory_inline-*.json` is shared by every inline run of Craftory, whatever the repo, and held a `lastActive` draft from an earlier session. `loadFeatures` (`hooks/shell/features.ts`) calls `pickActive` with `git: null`, so its first rule, a record whose `integrationBranch` is the current branch, cannot apply, and a live `lastActive` wins over the specced `csv-export`. The probe's `prompt.submit` read `activeKey` as `draft:d1794855222550` and `activeRecord` as null, so no integration line was added to `/implement-spec`, typed or pressed. With the store moved aside, the line appeared.

To settle:

1. Does a later git sync move the active Feature to the one on the branch, or does the stale one stay until the person switches? Check in an interactive session.
2. Is the store really keyed per plugin and not per repo? If so, a draft from one repo can be the remembered one in another.
3. If either is a problem, pick the on-branch Feature once the git snapshot is known (or give `loadFeatures` the branch), and keep `lastActive` per repo.

**Blocked by:** none

**Status:** needs-triage

- [ ] The three questions answered, with the store contents and the log lines
- [ ] A test where `lastActive` names another Feature or a draft, and the Feature on the branch is the active one
- [ ] `pnpm nx affected -t lint typecheck validate test` passes
