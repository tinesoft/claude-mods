---
name: land-pr
description: Check out a PR, check its status and CI, rebase-merge it into develop, and clean up the branch.
argument-hint: [pr-number]
disable-model-invocation: true
---

# Land a PR

Takes one PR from open to merged, with the branch gone and the checkout back on the base branch. The merge is the human's decision: the skill stops and asks before it.

## Steps

1. **Check out.** With `$ARGUMENTS`, run `gh pr checkout $ARGUMENTS`. Without it, use the current branch's PR. Stop and report if `git status --short` shows uncommitted changes, since the checkout and the switch back would carry them along.

2. **Report.** Run `gh pr view --json number,title,state,isDraft,baseRefName,headRefName,url,reviewDecision,mergeable,body,reviews,comments` and `gh pr checks`. Tell the user: the state, mergeable, CI, reviews and comments, then what the PR does in one short list taken from its body. Done when each of those has a value.

3. **Green CI.** If a check is pending, run `gh pr checks --watch --interval 20`. Done when every check reads `pass`. On any `fail`, stop and report the failing job's link; the merge does not happen.

4. **Ask.** Ask the user to confirm the rebase merge into the PR's `baseRefName`, naming the PR. Merge only on a yes.

5. **Merge.** Run `gh pr merge <number> --rebase --delete-branch`. This rebases onto the base, deletes the remote and local branch, and switches to the base branch.

6. **Sync.** Run `git checkout <base>` if it is not already checked out, then `git pull --ff-only`.

7. **Verify.** Done when all of these hold, each read from a command and not assumed:
   - `gh pr view <number> --json state` is `MERGED`.
   - `git branch --show-current` is the base branch, and `git log --oneline -1` is the merged commit.
   - `git branch --list <head>` and `git ls-remote --heads origin <head>` are empty.
   - `git status --short` is empty.

   Tell the user the merge commit, the branch now checked out, and anything above that did not hold.

If `--delete-branch` leaves the local branch behind, delete it with `git branch -D <head>`: a rebase merge gives the commits new SHAs, so `-d` does not see the branch as merged. The PR's `MERGED` state, read in step 7, is the proof it landed.
