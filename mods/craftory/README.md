<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/images/craftory-dark.svg">
  <img alt="craftory — guide a feature from idea to merged PR" src="../../assets/images/craftory-light.svg" width="128">
</picture>

# Craftory

[![CI](https://github.com/tinesoft/claude-mods/actions/workflows/ci.yml/badge.svg)](https://github.com/tinesoft/claude-mods/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A52.1.299-D97757.svg)](https://claude.com/claude-code)

</div>

A Claude Code mod that guides a feature from idea to merged PR in seven phases: Align, Spec, Tickets, Build, Review, Ship and Retro. Each phase runs one of Matt Pocock's skills from the [`mattpocock-skills`](https://github.com/mattpocock/skills) plugin. Craftory does not do the work itself. A phase rail above the prompt shows where the active feature is and what to run next, the `/craftory` pane holds the tickets, worktrees, glossary and settings, and Craftory steers the parallel agents that `/implement-spec` starts.

```text
 Inbox 3 │ ✓ Align ─ ✓ Spec #42 ─ ✓ Tickets 5 ─ ◐ Build 1/5 ─ ⊘ Review ─ Ship ─ Retro   Export invoices as CSV ⚙
╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ > _                                                                                                              │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
  Export invoices as CSV · Build 1/5 · /craftory
```

---

## ✨ Features

- 🧭 **A rail for the active feature.** Seven steps, each with a state glyph, a text badge and what it produced, such as `#42` or `1/5`.
- 🔍 **A card per phase.** Press a step to see what the phase does, the command that starts it, the skills it uses, what it wrote, and its gate.
- 🚦 **Soft gates.** Starting a phase whose gated predecessor is not done asks first, with **Run anyway** and **Diagnose**. Nothing is refused.
- 🤖 **Build steering.** One git worktree and branch per implementer, at most `maxParallel` at a time, and a token budget per agent with a live Agents list.
- 📋 **A full pane.** `/craftory` opens Flow, Tickets with a triage Inbox, Worktrees, Glossary and Settings.
- ⚙️ **Settings that edit the repo's own files.** The tracker, triage labels, docs layout and glossary are written where Matt's skills read them, exactly as `/setup-matt-pocock-skills` writes them.
- 📖 **Glossary in replies.** On Desktop and mobile, glossary terms in Claude's replies link to `/wait-what` and have a hover card.
- ♿ **Never colour alone.** Every state is also a word, and `ascii_glyphs` draws the rail with plain characters.

---

## 📦 Installation

Requires Claude Code 2.1.299 or later. On an older version the mod draws nothing and says to run `claude update`. Tested with 2.1.302.

Install the mod from `main`, which holds released code only:

```sh
claude plugin install craftory --marketplace tinesoft/claude-mods@main
```

Craftory needs `mattpocock-skills` 1.3.x. If the plugin is missing, the band shows **Craftory needs mattpocock-skills 1.3.x** with **Install** and **Not now**. **Install** runs `claude plugin install mattpocock-skills@claude-plugins-official` after you press it, then asks you to restart. A version outside 1.3.x shows the same notice with **Update**. You can also install it yourself:

```sh
claude plugin install mattpocock-skills@claude-plugins-official
```

The first time Craftory runs in a repo without `docs/agents/`, the band offers **Set up Craftory**. It opens Settings pre-filled from the repo (its remote, `CLAUDE.md` or `AGENTS.md`, `GLOSSARY.md`, `CONTEXT.md`). **Save setup** writes the same files `/setup-matt-pocock-skills` would, plus `.craftory/config.json` and a `.worktrees/` line in `.gitignore`.

### Surfaces

| Surface                               | What you get                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Terminal (`claude`, editor terminals) | The rail and card above the prompt, drawn with glyphs, the pane and the status line                |
| Claude Desktop app, Code tab          | The same with `Svg` icons, exact colours, hover and clicks, and glossary links and hover cards     |
| Mobile                                | The pane, whose Flow tab starts with the rail, and glossary links. Settings are read-only. No band |
| VS Code                               | Nothing. Claude Code 2.1.302 attaches no surface for a mod there                                   |
| claude.ai/code cloud sessions         | Text only: `/craftory` replies with a summary of the active feature                                |
| claude.ai chat, `claude -p`           | Nothing is drawn. `/craftory` replies in text where it is available                                |

---

## 🚀 Usage

### The phases

| #   | Phase   | Command                                     | Helper skills                                  | Done when                                                                | Gate |
| --- | ------- | ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| 1   | Align   | `/grill-with-docs` (or `/grill-me`)         | grilling, domain-modeling, prototype, research | The grill ended and a later phase started, or you marked it done         | On   |
| 2   | Spec    | `/to-spec` (or `/wayfinder` for large work) |                                                | A spec issue exists on the tracker                                       | On   |
| 3   | Tickets | `/to-tickets`                               |                                                | Child tickets of the spec exist                                          | Off  |
| 4   | Build   | `/implement-spec` (or `/implement` for one) | tdd, diagnosing-bugs, codebase-design          | Every ticket meant for an agent is merged into the integration branch    | On   |
| 5   | Review  | None: the close-out of `/implement-spec`    | code-review                                    | `code-review` ran on the integration branch after the last ticket merged | On   |
| 6   | Ship    | None: Claude uses `pr` on the draft PR      | pr                                             | The PR from the integration branch is ready for review                   | Off  |
| 7   | Retro   | `/retro`                                    |                                                | `retro` ran after Ship                                                   | Off  |

The rail shows commands short (`/to-spec`) and runs them namespaced (`/mattpocock-skills:to-spec`). A typed command is recognised in either form. The short form counts only when no built-in, project or other plugin command has the same name, so Craftory never gates a command that is not Matt's. The namespaced form is always Matt's. Craftory works out each phase's state from evidence: the tracker, git, and which skills ran. It stores only the facts it cannot work out again.

A spec is an issue with `type: spec` in its front matter, or a body with the `to-spec` template's `## Problem Statement` and `## User Stories` headings. `to-spec` 1.3.1 applies no spec label.

### Step states

| State       | Terminal | Meaning                                                                                   |
| ----------- | -------- | ----------------------------------------------------------------------------------------- |
| Done        | `✓`      | Its evidence exists. The badge names what it produced                                     |
| Up next     | `▸`      | The suggested next step. Its card has the command ready                                   |
| Running     | `◐◓◑◒`   | A skill is working, with progress such as `1/5`                                           |
| Needs you   | `?`      | A grill waits for your answer, or a ticket is ready for a human                           |
| Gated       | `⊘`      | The gate is on and the phase before is not done. It runs after you confirm                |
| Failed      | `▲`      | Its card offers `diagnosing-bugs` instead of moving on                                    |
| Over budget | `▲`      | An agent reached its token budget and was stopped. Its worktree is kept                   |
| Skipped     | `–`      | Off in Settings, skipped for this feature, or before the phase a triaged issue entered at |

With `ascii_glyphs` on, the rail uses `>`, `x`, `!`, `v` and `|/-\` instead.

The rail reads left to right: the triage button (`Inbox 3` when items wait), the seven steps, the feature title (a switcher when several features are in flight), and a gear that opens Settings. Press a step to open its card above the rail. Press it again, or **Close**, to close it. When the band is narrow, or `rail_layout` is `summary`, the rail becomes one chip such as `Export invoices as CSV · Build 2/5`. The status line under the prompt shows the same text.

When the plugin is missing, setup has not run, or no feature is in flight, a notice takes the rail's place.

### Gates

A gate is soft. When you start a phase whose gated predecessor is not done, Craftory drops the command and asks in the band, for example "Review is gated: #44 has 2 failing tests. Run anyway?". **Run anyway** runs the command once. **Diagnose** runs `/diagnosing-bugs`. When Claude itself reaches for `code-review` before Build is done, Craftory asks in a dialog instead. If the dialog cannot be shown, the call goes ahead.

Craftory asks in the band, so it gates a typed command only where a band is drawn: the terminal and Claude Desktop. On mobile and in VS Code a typed command always runs. On mobile, a gated button in the pane shows the same question, with **Run anyway** and **Diagnose**, at the top of the Flow tab. Align gates the next phase only until it has run. A grill ends when you move on, so typing `/to-spec` after a grill that ran is not gated, and Spec stays gated if no grill ran.

### Build

`/implement-spec` starts one implementer per ticket. Craftory steers each one:

- It gives the implementer its own worktree, `.worktrees/<ticket>-<slug>`, on the branch `craftory/<ticket>-<slug>`, cut from the integration branch. When you start Build with a typed or rail command, Craftory tells Claude which branch to integrate on and where the worktrees live. If that branch does not exist when the first implementer starts, Craftory creates it from your checkout's `HEAD`. It copies the files listed in `copy` and runs the `setup` command there. `copy` takes relative paths inside the repo and never `.git`. Craftory skips any other entry and says so on the card. The first time a `setup` command other than the built-in `pnpm install --frozen-lockfile` is about to run on your machine, Craftory asks **Run** or **Skip**, and remembers a **Run**. After a **Skip**, or when nobody can answer, the agent starts without the setup and the card says so.
- At most `maxParallel` implementers run at once. Craftory refuses an extra spawn with a reason that names the running tickets and asks Claude to start the ticket after one of them returns.
- Tickets that are blocked or ready for a human never get an agent.
- Each agent has a token budget, 80k by default, counted as input, cache-creation and output tokens. The bar turns amber at 80%. At 100% Craftory stops the agent and ends its turn with a note: the agent's next step is answered without a request, and the note goes to Claude as the Agent result, saying the ticket ran out of budget, that its worktree is kept, and not to restart it. The ticket is marked over budget. An agent that finishes by itself on the step that crossed the budget is marked done. The card offers **Raise budget** and **Diagnose**.
- When the integration branch moves, Craftory tells the running agents to merge it. It never rebases a worktree under an agent. A merge conflict stops the agent the same way, with a note about the conflict, and the band offers **Resolve**.
- An agent recorded as running by a session that has since ended is marked stopped when the next session starts, so its worktree is kept as stopped work and not defended as a running agent.
- Craftory refuses a `git worktree remove` or an `rm` of a worktree it keeps (running, failed, stopped or over budget). The check reads the command's words and is best-effort. It does not follow variables, globs or a preceding `cd`.

The Build card lists every agent with its ticket, status, TDD step when the agent reports one, token bar, time, worktree, branch, `+added −removed` lines and commits. **Pause all** stops new spawns and sends the running agents a message to finish their current step, commit and report. **Open panel** opens the Worktrees tab.

### The pane

Open it with `/craftory`, the gear, **Open panel** or a card button. The tabs have hotkeys `1` to `5`.

- **Flow** (`1`). The seven phases with their command and a one-line result. On mobile the tab starts with the rail.
- **Tickets** (`2`). The tracker header, the **Inbox**, then the spec's tickets with status, blocking edges and `/implement #n` on ready ones, and `/implement-spec #42 · run all in parallel`. In the Inbox, a `needs-triage` item offers `/triage #51`, a `ready-for-agent` item offers **Start feature**, and a `ready-for-human` item gets no agent. A started feature enters at the phase set in Settings › Entry points. By default a bug enters at Build and anything else at Align. GitLab and Other trackers show links only.
- **Worktrees** (`3`). Your checkout, the integration worktree, one per agent and stale ones, each with its branch and sync state. **Diff** shows the change size, **Open terminal** copies `cd <path>` (a mod cannot open a terminal), **Remove** asks first for a kept worktree, and **Prune** removes stale ones.
- **Glossary** (`4`). Search, the terms added this session, **Used in last reply**, then every term with its definition and the words to avoid. **Edit** jumps to Settings › Glossary.
- **Settings** (`5`). See below.

### Glossary in replies

On Desktop and mobile, the first mention of each glossary term in Claude's reply is a link that runs `/wait-what <term>`. A row of terms under the reply has a hover card on Desktop with the definition, the words to avoid, `/wait-what` and **Edit term**. The terminal never rewrites a reply. Use **Used in last reply** in the Glossary tab instead. Turn this off with Settings › Automation › Underline glossary terms.

When Review or Ship starts, Craftory scans the lines the integration branch adds for words the glossary says to avoid. A hit shows a toast such as `Glossary drift · the diff says "line item" 4 times` and a **Rename** action in the band.

---

## ⚙️ Settings

The Settings tab writes each value where it belongs and saves as you go. The first change to a file that Matt's skills or your teammates also edit asks first and shows what changes. **Reset to defaults** resets `.craftory/config.json` and your personal settings only. **Re-run /setup-matt-pocock-skills** runs Matt's setup skill.

| Section       | Values                                                                                                                   | Written to                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Entry points  | Triage on or off and the phase a ready-for-agent item enters at, the wayfinder suggestion (marked "Not active yet")      | `.craftory/config.json`                                                 |
| Issue tracker | Local Markdown, GitHub, GitLab or Other with their fields, and the label for each triage role                            | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`          |
| Docs layout   | Glossary file, ADR folder, research notes, steering file (`CLAUDE.md` or `AGENTS.md`)                                    | `docs/agents/domain.md` and the steering file's `## Agent skills` block |
| Glossary      | Add, edit and delete terms, and import terms from `CONTEXT.md`                                                           | `GLOSSARY.md`                                                           |
| Pipeline      | Each phase on or off, its command and its gate. Helper skills are shown, not edited                                      | `.craftory/config.json`                                                 |
| Worktrees     | Folder, integration branch, ticket branch, parallel limit, token budget, setup command, files to copy, and four switches | `.craftory/config.json`                                                 |
| Automation    | Suggest the next phase, live agents, underline glossary terms, and three switches marked "Not active yet"                | `.craftory/config.json`                                                 |
| Personal      | The options below                                                                                                        | `$.store`, on your machine                                              |

The Local Markdown tracker keeps issues in `docs/issues/<n>-<slug>.md` with a `status` in the front matter. It also reads the `Status:` and `Blocked by:` lines that `to-tickets` writes. When you choose Local and the repo has a `.scratch/` folder, Settings offers to import it. It writes numbered issue files after you confirm and moves nothing.

The personal options are plugin options (`/config`, or `pluginConfigs` in settings). Changes made in the pane override them and persist across sessions.

| Option         | Default | Effect                                                                                                   |
| -------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `rail`         | `true`  | Show the phase rail above the prompt                                                                     |
| `rail_layout`  | `row`   | `row` of steps, or one `summary` chip                                                                    |
| `theme`        | `auto`  | `light` or `dark` colours, or `auto` to follow the Claude Code theme, then the terminal, then the system |
| `ascii_glyphs` | `false` | Draw the rail with plain characters for terminals that draw symbols two cells wide                       |

---

## 🔒 Data, programs and permissions

The mod makes no network calls of its own. The `gh` and `claude` commands below reach GitHub and the plugin catalog the way they do when you run them yourself.

**What it reads**

- The events Claude Code raises: the skills that run, typed commands, the Agent, Skill and Bash tool calls, agent spawns and steps (for token use), and the end of each turn. It keeps the skill names, ticket ids, token counts and the last reply's text (to find glossary terms), not the conversation.
- The repo files listed below, the issue files of a Local tracker, and `CONTEXT.md` and `.scratch/` when you import them.
- The `COLORFGBG` environment variable, to guess whether the terminal is light or dark. No other variable and no credential is read.

**What it writes**

Craftory writes only these files, and checks each write against this list:

| Path                                                            | Shared with                          |
| --------------------------------------------------------------- | ------------------------------------ |
| `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md` | `/setup-matt-pocock-skills`          |
| The `## Agent skills` block of `CLAUDE.md` or `AGENTS.md`       | `/setup-matt-pocock-skills`          |
| `GLOSSARY.md` (or the glossary file set in Settings)            | `grill-with-docs`, `domain-modeling` |
| `.gitignore` (the `.worktrees/` line)                           | Your repo                            |
| `.craftory/config.json`, `.craftory/features/<spec>.json`       | Craftory, committed                  |
| `docs/issues/<n>-<slug>.md`, only when importing `.scratch/`    | Matt's skills                        |

It never writes under `.git/`, the glossary file must end in `.md`, and the issues folder cannot be `.craftory/`. It never touches content outside the sections it owns. A write to a shared file fails and reloads if the file changed since Craftory read it. Personal settings and pre-spec drafts are saved with `$.store`, on your machine. Feature records are written as soon as they change. Commit them so teammates see the same rail.

**What it runs**

| When                                | Command                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session start                       | `claude plugin list --json`, to read the `mattpocock-skills` version                                                                                                                              |
| You press **Install** or **Update** | `claude plugin install mattpocock-skills@claude-plugins-official` (or `update`)                                                                                                                   |
| A GitHub tracker refresh            | `gh issue list`, `gh api …/sub_issues`, `gh api …/dependencies/blocked_by`, `gh pr view <branch>`                                                                                                 |
| A Build agent starts                | `git branch <integration> HEAD` when the integration branch is missing, `git worktree add -b <branch> <path> <base>`, `cp` for each file in `copy`, then your `setup` command once you approve it |
| Worktrees tab, cleanup, drift scan  | `git worktree list`, `git status`, `git diff`, `git rev-list`, `git rev-parse`, `git log`, `git branch`, `git remote get-url origin`, `git worktree remove`, `git worktree prune`                 |
| Every five seconds                  | The system appearance probe that session-activity runs (`defaults`, `gsettings` or `reg`), 1.5 s timeout                                                                                          |

It starts no other program. The `setup` command is the one in `.craftory/config.json`, which your team commits, so Craftory asks before it runs a command you have not approved on this machine.

**What its hooks decide**

- `prompt.submit` drops a gated command, where a band can show **Run anyway**. For a typed or rail `/implement-spec` or `/implement` it adds a line of context naming the integration branch and the worktree folder. It answers nothing else.
- `tool.call` on `Agent` gives a Build implementer its name and drops `isolation`, or refuses it when the queue is full, the ticket is blocked, or the ticket is for a human. Other Agent calls pass through.
- `agent.spawn` points a Build implementer at its worktree with `cwd`.
- `turn.step` ends an agent's step only after that agent passed its token budget or stopped on a merge conflict.
- `tool.call` on `Skill` asks before a gated `code-review`. `tool.call` on `Bash` refuses `git worktree remove` and `rm` of a kept worktree, best-effort.
- `skill.prompt`, `turn.complete`, the other `tool.call`s and `ui.render` pass their result through unchanged. On Desktop and mobile, `ui.render` on `AssistantMessage` adds glossary links to the drawing only. The stored reply never changes.
- `/craftory` is the only command the mod registers.

---

## ⚠️ Limits

- The kept-worktree guard on Bash is best-effort. A command that builds the path with a variable, a glob or a `cd` is not caught.
- VS Code draws nothing: Claude Code 2.1.302 attaches no surface for a mod there.
- Where an organization manages Claude Code, `skill.prompt` hooks do not reach user plugins, so phases started by a skill are seen only through typed commands and the tracker.
- A toast cannot carry a button, so each toast's action sits in the band or the pane.
- The `Q6 of ~14` progress of a grill is not visible to a mod. The step shows Needs you without a count.
- An agent's TDD step shows only when the agent writes it as `red · test 4 of 5`.
- The token budget counts input, cache-creation and output tokens. It may differ from Claude Code's own per-agent total.
- A refused spawn relies on Claude waiting as the reason asks. Claude may try again sooner.
- Copying files into a worktree uses `cp`, which Windows lacks outside WSL.
- Glyphs such as `▲`, `◐` and `–` are one cell wide in Claude Code's layout. A terminal that draws them two cells wide misaligns the rail. Turn on `ascii_glyphs`.
- GitLab and Other trackers show links only, so their Spec, Tickets and Build states come from the skills that ran and from **Mark done**.
- The wayfinder parent rail, a multi-context `GLOSSARY-MAP.md` and the automations marked "Not active yet" are not built.

---

## 🛠️ Development

From the repository root:

```sh
pnpm nx dev craftory                    # claude --plugin-dir mods/craftory
pnpm nx run-many -t lint typecheck validate test
```

`hooks/register.tsx` registers every hook. The modules under `hooks/shell/` hold the rest of the `$` calls. Each one declares the session state it owns and is the only code that reads or writes it, because Claude Code's state scan accepts `read` and `update` only in the file that declares the atom. `repo.ts` owns the repo snapshot, plugin status and the one file writer. `flow.ts` owns the tracker, feature records, gates, notices and the Build ledger. `build.ts` owns the Worktrees tab and agent seats, `settings.ts` the Settings tab and glossary edits, and `ui.ts` the pane tab, tone and personal settings. `src/` holds pure helpers that take plain data: `phases.ts` (the phase registry), `evidence.ts` (facts to phase states), `gates.ts`, `build.ts` (the agent ledger, queue and budget), `git.ts`, `glossary.ts` (lossless `GLOSSARY.md` edits), `agents-md.ts` and `templates.ts` (the setup files), `config.ts`, `features.ts`, `tracker/`, `drift.ts`, `signals.ts` (toasts), `rail.tsx`, `pane.tsx`, `settings.tsx` and `sections.ts` (the Settings table), `reply.tsx` and `theme.ts`. Tests in `tests/` run under `claude plugin test`.

`src/templates.ts` holds copies of the `mattpocock-skills` 1.3.1 setup templates. `validate` fails when they drift from `tests/fixtures/`. To move to a new version, run `node tools/vendor-craftory-templates.mjs --from <setup-matt-pocock-skills folder>`.

---

## 🤝 Contributing

Contributions are welcome! See the [repository README](../../README.md#development) for setup, branch flow, commit conventions and releases.

---

## 📄 License

[MIT](../../LICENSE) © 2026 Tine Kondo. Not affiliated with or endorsed by Anthropic.
