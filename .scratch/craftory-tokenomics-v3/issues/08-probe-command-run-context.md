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

**Status:** ready-for-human

- [ ] Answers 1 to 5, with the Claude Code version (and whether it is newer than the pinned 2.1.325), the date and the log lines, in the Comments below
- [ ] The answers recorded in the spec's "Decisions made while building", and decisions (03) and (06) corrected if they are wrong
- [ ] If neither hook reaches the turn, a follow-up ticket for a path that does (`skill.prompt`, the command's args, or another), and the README's "Data, programs and permissions" corrected
- [ ] The probe is not committed
