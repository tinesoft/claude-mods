# The demo repo

A recording needs a project for the mod to look at. Build one per mod at `mods/<mod>/demo/`, never record against this repo's own working tree: it changes, and it leaks real names and paths.

```
mods/<mod>/demo/
  setup.mjs      builds .workspace/ from template/, then adds anything that needs git or the clock
  template/      the sample project, as plain files (no .git)
  tour.json      the keystrokes, see tour-format.md
  README.md      what the workspace shows, and how to reset and re-record
  .gitignore     .workspace/
```

## `setup.mjs`

- Delete `.workspace/`, copy `template/` into it, then `git init -b <default branch>`, commit, and switch to the branch the scenario needs. Set `GIT_AUTHOR_*` and `GIT_COMMITTER_*` to a neutral demo identity.
- Create things that must be real with real commands: git worktrees (`git worktree add`), branches, files.
- Write anything with a timestamp from the clock at setup time (`Date.now() - minutes`), so "5 minutes ago" is true whenever the demo runs.
- `--run` rebuilds and then starts `claude --plugin-dir <mod>` in the workspace, for manual poking.
- It must be safe to run repeatedly: every run starts from nothing.

## What the sample project should show

Design the state from the mod's README: list each surface the mod draws, and give the workspace one example of every state worth showing, such as empty, in progress, blocked and done. A boring, plausible project (a small invoicing library, a todo CLI) is better than a clever one; the viewer should look at the mod, not the project. Keep names neutral: nothing real, nothing private.

If the mod reads files from the repo, write those files in the shape the mod's own tests use. Fixtures under the mod's `tests/` are the quickest guide.

## Worked example

`mods/craftory/demo/`: a sample "Invoicely" library on branch `feat/csv-export`, with a Craftory feature mid-Build and two real git worktrees, three untriaged bugs in the Inbox, a wayfinder map with decided, claimed, takeable and blocked tickets, and the `docs/agents/` files that make Craftory's setup offer go away.
