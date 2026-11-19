# 08: Probe whether a pressed command's context reaches its turn

**What to build:** A spike, following `docs/agents/probing.md`, that answers how the context Craftory adds to a command it runs itself reaches the model. Three features depend on it, and no test can show it, because the fake world raises no `prompt.submit` for a plugin's `$.command.run`:

- the retry line of a pressed **Retry on …** (`/implement <ticket>`, decision 03);
- the spend summary of a pressed or automated `/retro` (decision 06);
- v1's integration context for a pressed `/implement-spec` or `/implement` (the line naming the integration branch and the worktree folder).

Today each line is added by `startContext` in the `prompt.submit` hook. The fallback from the review adds the retry line and the summary in Craftory's own `command.run` hook too. But the 2.1.325 contract skips the calling plugin's own hooks on every op ("The hooks of the calling plugin are skipped here as on every op", `tool.list`), and the fake world does the same: that hook never sees Craftory's own `$.command.run`.

The probe is a throwaway mod with a band button that calls `$.command.run` for a skill command, plus `command.run`, `prompt.submit` and `skill.prompt` hooks that log what they see. Run it twice: once as the plugin that presses, and once with a second probe plugin doing the hooking. It answers:

1. Does a plugin's `$.command.run` of a skill command (a Matt skill, such as `/mattpocock-skills:retro`) raise `prompt.submit`? If it does, with what `origin` and `command`? And do the calling plugin's own `prompt.submit` hooks run for it?
2. Does the calling plugin's own `command.run` hook run for its own `$.command.run`? What does a second plugin's `command.run` hook see?
3. Does a `context` entry that a `command.run` hook adds after `next(e)` reach the skill's turn (the model reads it), for a skill command and not only a `local` one?
4. Does `skill.prompt` fire for the pressed skill, and do the calling plugin's own `skill.prompt` hooks see it?
5. Each answer again for v1's pressed `/implement-spec`. Does its integration context reach the turn today?

**Blocked by:** none

**Status:** resolved

- [x] Answers 1 to 5 , with the Claude Code version (and whether it is newer than the pinned 2.1.325), the date and the log lines, in the Comments below
- [x] The answers recorded in the spec's "Decisions made while building", and decisions (03) and (06) corrected if they are wrong
- [x] `prompt.submit` reaches the turn, so no new path is needed; the README's "Data, programs and permissions" is corrected, and ticket 09 removes the `command.run` fallback
- [x] The probe is not committed

## Comments

- 2026-11-19: probe run headless, Claude Code 2.1.328 (newer than the pinned 2.1.325), haiku, one run each. Plugin `pa` presses `$.command.run({ command: 'pa:echo' })` from a `turn.complete` hook (from `prompt.submit` the host refuses: "called from a prompt.submit hook, it would wait on the turn this hook is holding; run it from a later event (turn.complete)"). `pa:echo` is a skill that lists any hidden note containing `PROBE-CTX`. A second plugin `pb` only hooks. The probe lives in the session scratchpad and is not committed.
  1. A plugin's `$.command.run` of a skill command raises `prompt.submit` with `origin {kind:'plugin',name:'pa'}` and `command {name:'pa:echo',args:''}`. The calling plugin's own `prompt.submit` hook runs for it, and so does `pb`'s.
  2. The calling plugin's own `command.run` hook runs for its own `$.command.run`, against the contract text. `pb`'s sees it too, with the same plugin origin.
  3. A `context` entry a `command.run` hook adds after `next(e)` does not reach a skill command's turn (`pa` alone, and `pa` with `pb`: the model answered `NONE`; `$.command.run` resolved to `{}`). A `context` entry added on the way down in `prompt.submit` (`next({ ...e, context: [...(e.context ?? []), line] })`) does: the model listed `PROBE-CTX-SUBMIT-A-4417` with `pa`, and both `A` and `B` with `pa` and `pb`.
  4. `skill.prompt` did not fire for the pressed skill, for either plugin.
  5. Run on 2026-11-19 in the demo repo (`mods/craftory/demo`, branch `feat/csv-export`, Craftory loaded, a second probe plugin pressing `$.command.run` for `/mattpocock-skills:implement-spec csv-export`, with args telling the model to implement nothing). Craftory's `prompt.submit` added `Craftory: use \`feat/csv-export\` as the integration branch (…); implementer worktrees live under \`.claude/worktrees/\`.`, the context that entered held it, and the model quoted it. So a pressed `/implement-spec` gets its integration context today. A first attempt got nothing, typed or pressed: the plugin's store (`~/.claude/plugins/store/craftory_inline-*.json`, shared by every inline run) held an old `lastActive`draft, and`loadFeatures`calls`pickActive`with`git: null`, so the on-branch rule cannot apply and a live `lastActive`wins over the specced feature.`activeRecord` was then null. With the store moved aside the line appeared.
  - Log lines: `PROBE {"tag":"A","ev":"prompt.submit","text":"/pa:echo","origin":{"kind":"plugin","name":"pa"},"command":{"name":"pa:echo","args":""}}`, `PROBE {"tag":"A","ev":"command.run","command":"pa:echo","origin":{"kind":"plugin","name":"pa"}}`, `PROBE {"tag":"A","ev":"run.done","r":{}}`.
