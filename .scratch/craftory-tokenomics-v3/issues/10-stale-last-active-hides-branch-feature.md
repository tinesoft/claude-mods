# 10: A stale remembered Feature can hide the Feature on the current branch

**What to build:** Find out whether a stale `lastActive` in the plugin store keeps Craftory from seeing the Feature on the current branch, and fix it if so.

Probe 08 (2026-11-19, Claude Code 2.1.328) hit it in the demo repo. `~/.claude/plugins/store/craftory_inline-*.json` is shared by every inline run of Craftory, whatever the repo, and held a `lastActive` draft from an earlier session. `loadFeatures` (`hooks/shell/features.ts`) calls `pickActive` with `git: null`, so its first rule, a record whose `integrationBranch` is the current branch, cannot apply, and a live `lastActive` wins over the specced `csv-export`. The probe's `prompt.submit` read `activeKey` as `draft:d1794855222550` and `activeRecord` as null, so no integration line was added to `/implement-spec`, typed or pressed. With the store moved aside, the line appeared.

To settle:

1. Does a later git sync move the active Feature to the one on the branch, or does the stale one stay until the person switches? Check in an interactive session.
2. Is the store really keyed per plugin and not per repo? If so, a draft from one repo can be the remembered one in another.
3. If either is a problem, pick the on-branch Feature once the git snapshot is known (or give `loadFeatures` the branch), and keep `lastActive` per repo.

**Blocked by:** none

**Status:** resolved

- [x] The three questions answered, with the store contents and the log lines
- [x] A test where `lastActive` names another Feature or a draft, and the Feature on the branch is the active one
- [x] `pnpm nx affected -t lint typecheck validate test` passes

## Comments

- 2026-11-19, answers:
  1. No. Nothing picked the Feature on the branch once the session started: `pickActive` was only ever called with `git: null`, so its on-branch rule never applied. A stale `lastActive` stayed active until the person switched.
  2. Yes. The store is the plugin's own (`~/.claude/plugins/store/craftory_inline-*.json` for an inline run) and holds `drafts` and `lastActive` with no repo in them, so a key chosen in one repo was read in every other.
  3. Fixed. `loadFeatures` now reads the checked-out branch (`git branch --show-current`) and passes it to `pickActive`, so the Feature whose integration branch is checked out wins. `lastActive` is stored as `{ root, key }` and read back only in the repo it was chosen in; a bare key from an older version still stands for any repo. Tests: `tests/last-active.test.ts` (on-branch beats a remembered draft, another repo's entry is ignored, this repo's is kept when no branch matches) and `lastActiveOf` in `tests/features.test.ts`.
  - Not changed: `drafts` is still one list for every repo, so another repo's draft can still be picked when this repo has no Feature and no remembered one.
