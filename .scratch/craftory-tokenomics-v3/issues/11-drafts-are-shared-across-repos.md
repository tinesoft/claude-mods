# 11: Drafts are shared across repos

**What to build:** Keep a draft in the repo it was started in, so another repo never picks it up as its active Feature.

A draft is a Feature with no spec yet, and so no record file in `.craftory/features/`. It lives only in the plugin's store under `drafts`, with its spend under `spend:<draft key>`. The store (`~/.claude/plugins/store/craftory_inline-*.json` for an inline run) is the plugin's own and is shared by every repo, and a draft carries no repo. Ticket 10 scoped `lastActive` to its repo and made the Feature on the checked-out branch win, but `pickActive` still ends with "the newest draft" (`src/features.ts`), over every draft in the store. In a repo with no Feature and no remembered one, a draft from another repo becomes active.

Found by probe 08 (2026-11-19): a draft from an earlier dev session in this repo (`d1794855222550`, "New feature", Align and Retro run on 2026-11-16 and 11-18) was active in the demo workspace. The same draft would show in any other repo with nothing of its own.

To settle:

1. Record the repo root on a draft when it is created (`createDraft`, `promoteDrafts`), in `DraftFeature` and its parse and serialise.
2. Read only this repo's drafts at load (`loadFeatures`): a draft with no root (made by an older version) stays visible everywhere, as a bare `lastActive` key does.
3. Decide what the Spend tab and the spend files do with a draft's `spend:<key>` entry from another repo, and what `spendGroup` and `moveDraftSpend` need.
4. Decide whether a draft whose repo no longer exists is ever cleaned up.

**Blocked by:** none

**Status:** needs-triage

- [ ] The four points settled, with the store shape before and after
- [ ] A test where the store holds a draft made in another repo, this repo has no Feature and nothing remembered, and no draft is active
- [ ] A draft made by an older version (no root) still opens
- [ ] `pnpm nx affected -t lint typecheck validate test` passes
