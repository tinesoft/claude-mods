# Handoff: session-activity mod (claude-mods)

Oct 15, 2026 · @Tine Kondo

## Summary

Build `session-activity`, a Claude Code mod that shows chips in the band above the prompt for each skill, agent, MCP server, permission decision, settings hook and rule that activated during the session. It is the first plugin in a new Nx monorepo, `github.com/tinesoft/claude-mods`, which doubles as a plugin marketplace.

The validated mockups were drawn as a GUI. A mod draws in Claude Code's terminal and Desktop app with a small element set (`Box`, `Text`, `Button`, `Input`, `Select`, `Markdown`), so the design translates as follows:

| Mockup board | In the mod | Render site / API |
| --- | --- | --- |
| Chip row above the prompt | One row of plain buttons with an icon glyph, label and count, coloured by type; overflow as `+N more` | `ui.render` on `AbovePrompt` |
| Chip popover | Detail view for the focused chip inside the tray pane (no floating popovers exist) | `ui.render` on `Pane` |
| Expanded tray | A pane with type filters, grouped rows, mute/unmute | `$.ui.open` + `Pane`, opened by `/session-activity` or the `+N more` button |
| Settings board | Plugin `userConfig` (persistent defaults) plus a Settings tab in the pane for session toggles | `plugin.json` `userConfig`, `$.store` |
| Types and states sheet | Glyph + colour + text badge per type and state; never colour alone | `Text` `color`, `bold`, `dimColor`, `inverse` |
| Mobile board | Out of scope: mods run in the terminal and Desktop only | n/a |

Target: Claude Code v2.1.287 or later, the first version with mods. Events and methods can change between releases, so the generated `.claude-plugin/types/claude-code/index.d.ts` overrides this document wherever they disagree.

## Open decisions

The build can start on the recommended defaults below; items 1 to 4 change scope and should be settled before milestone M2.

| # | Question | Why it matters | Recommended default |
| --- | --- | --- | --- |
| 1 | Rules: show rules that were **loaded**, or rules that were **applied**? | No event says a CLAUDE.md line shaped an action. "Applied" needs a `$.model.classify` call per turn (tokens, latency). | v1 shows loaded rule files and their line counts; "applied" is a later optional type. |
| 2 | Hooks: is an event-level chip acceptable if per-command detail isn't exposed? | `classic.<Event>` gives the event's stdin JSON; whether a mod can see each configured command and its exit code needs a spike. | Spike in M1. Fallback chip: `PreToolUse hooks ×4`, with "Blocked" from the tool result. |
| 3 | Permissions: is "asked → approved by you" vs "auto-allowed" enough, without once/always? | `tool.check` exposes the rule decision (`allow`, `ask`, `deny`); the prompt itself isn't a render site. | Show the three outcomes: auto-allowed, asked and ran, denied. |
| 4 | Marketplace `name` | The repo can be `claude-mods`, but names that look like Anthropic's can be refused, and the `claude-` prefix is risky. | Repo `claude-mods`, marketplace name `tinesoft-mods`. Verify `claude-mods` with `claude plugin validate` before deciding. |
| 5 | Which branch should users install from? | A marketplace added as `tinesoft/claude-mods` tracks the default branch, `develop`, which is unreleased. | Document `claude plugin marketplace add tinesoft/claude-mods@main`, and pin each entry's `source.ref` to its release tag. |
| 6 | Release mechanics on `main` | Decides the tooling and tag format. | `nx release` with conventional commits, each mod versioned and released independently (all affected mods on push to main, or one via workflow\_dispatch), tags `session-activity@x.y.z`, GitHub Release + changelog. |
| 7 | Package manager and Node version for tooling | The mod needs no runtime deps; tooling does (Nx, husky, commitlint, lint-staged). | pnpm, Node 22 LTS. |
| 8 | Desktop app support in v1? | Desktop draws the same tree and allows `Svg`. | Terminal-first; Desktop must render without errors, no Desktop-only polish. |
| 9 | Where settings live | `userConfig` is set at install or in `pluginConfigs`; in-pane toggles need `$.store`. | `userConfig` = defaults; pane toggles override them and persist in `$.store`. |
| 10 | History scope | Chips per session, or a history across sessions? | Per session in `$.state`, reset on `/clear`, `/resume`, `/branch`. |
| 11 | Optional types with no clear signal (checkpoints, memory) | No event names them directly. | Ship the five with clear signals first; checkpoints and memory only after a spike. |
| 12 | License | Needed for a public marketplace. | MIT. |

## M1 findings (Claude Code 2.1.302)

The spikes were answered from the generated declarations and checked in a live `claude --plugin-dir` session.

| Question | Finding | What v1 does |
| --- | --- | --- |
| Hooks: command and exit code visible? | No. `classic.<Event>` gives the stdin JSON and, after `next(e)`, the event's merged result (`deny` for `PreToolUse`, `block` or `preventContinuation` for the rest). `$.settings.read()` lists configured commands; plugin-configured hooks are not in it. Each `classic.*` event fires whether or not a hook is configured. | One chip per event, recorded only when a settings hook matches or the event was blocked. Label is the script name for one command, else `<Event> hooks`. |
| Rules: which fields name instruction files? | `classic.InstructionsLoaded` carries `file_path`, `memory_type` and `load_reason` for every load. `prompt.context` also lists `instructionFiles`, for the same loads, so using both counts each file twice. | `classic.InstructionsLoaded` only; the line count comes from `$.fs.read`. |
| Permissions: "once" vs "always"? | Not visible. `tool.check` resolves `{ decision, reason, rule, hook }`. | Rule allows, denies and asks get chips; an ask settles to approved or declined from the `tool.call` result. Mode-only allows are skipped, and a hook's allow or deny is left to its hook chip. |
| `skill.prompt` fields, `agent.spawn` type | `skill.prompt` has `skill`, `source`, `pluginName`, `path`. `agent.spawn` has `subagentType`, `description`, `background`; `next(e)` gives `agentId`, and `turn.complete` with that `agentId` is the finish. | As specified. |
| Typecheck in CI | Snapshot chosen: `tools/claude-code-types/2.1.302/index.d.ts`, named by the mod's own `tsconfig.json`. | Refresh on each Claude Code bump. |
| `$.state` on `/clear` | The types do not promise a reset. `session.end` fires with `reason: 'clear'` or `'resume'`, and no `session.start` follows. | The mod empties activations, mute and selection itself in `session.end`. Overrides live in `$.store`, so they survive. |
| Glyph widths | `⚡` (U+26A1) is East Asian Wide, two cells. `⚷`, `◉`, `⇌` and `↯` are narrow. | Hooks use `↯`. The other glyphs render one cell wide in xterm.js; iTerm2, Terminal.app, Windows Terminal and Ghostty are still unchecked. |
| Managed installs | `claude plugin validate` reports that `skill.prompt`, `classic.*` and `session.compact` reach only organization-listed plugins where Claude Code is managed. | Documented in the mod README. |

Memory and checkpoints have no event that names them, so they are cut from v1 and their `userConfig` rows removed. The plugins option is dropped too: chips carry their plugin in the pane detail whenever the event names one.

## Repository

`tinesoft/claude-mods` is one Nx workspace and one plugin marketplace: each mod is an Nx project under `mods/`, and the root `.claude-plugin/marketplace.json` lists them. Claude Code loads `.ts` directly, so there is no build target; Nx runs lint, type-check, validate, test and release.

```text
claude-mods/
├── .claude-plugin/
│   └── marketplace.json          # name, owner, metadata.pluginRoot: "./mods"
├── .github/workflows/
│   ├── ci.yml                    # PRs and pushes to develop
│   └── release.yml               # pushes to main
├── .husky/
│   ├── pre-commit                # pnpm lint-staged
│   └── commit-msg                # pnpm commitlint --edit "$1"
├── mods/
│   └── session-activity/         # the plugin root (see Mod structure)
│       ├── .claude-plugin/plugin.json
│       ├── hooks/hooks.json
│       ├── hooks/register.ts
│       ├── src/…                 # pure helpers, imported by relative path
│       ├── tests/*.test.ts
│       ├── types/index.d.ts
│       ├── package.json          # private; carries the version for nx release
│       ├── project.json
│       ├── README.md
│       └── CHANGELOG.md
├── tools/sync-plugin-version.mjs # copies package.json version into plugin.json
├── commitlint.config.mjs
├── .lintstagedrc.mjs
├── nx.json
├── package.json
├── pnpm-workspace.yaml           # mods/*
├── CLAUDE.md                     # conventions for Claude working in this repo
├── LICENSE
└── README.md                     # install instructions, mod index
```

The marketplace file starts as:

```json
{
  "name": "tinesoft-mods",
  "owner": { "name": "tinesoft", "url": "https://github.com/tinesoft" },
  "description": "Claude Code mods by tinesoft",
  "metadata": { "pluginRoot": "./mods" },
  "plugins": [
    {
      "name": "session-activity",
      "source": "session-activity",
      "description": "Chips above the prompt for the skills, agents, MCP servers, permissions, hooks and rules that activated this session",
      "category": "productivity",
      "tags": ["mod", "observability", "ui"]
    }
  ]
}
```

The Nx targets in `mods/session-activity/project.json`, all `nx:run-commands`:

| Target | Command | Cached |
| --- | --- | --- |
| `lint` | `eslint .` | Yes |
| `typecheck` | `tsc -p . --noEmit` (uses the generated `tsconfig.json`) | Yes |
| `validate` | `claude plugin validate . --strict` | Yes |
| `test` | `claude plugin test` | Yes |
| `dev` | `claude --plugin-dir .` | No |

The workflow, given `develop` as the default branch and `main` as the release trigger:

1. Branch from `develop` as `feat/…`, `fix/…`, `chore/…`; open a PR to `develop`. CI runs `nx affected -t lint typecheck validate test`.
2. Commits follow Conventional Commits. `commitlint` uses `@commitlint/config-conventional` plus `@commitlint/config-nx-scopes`, so the scope is a project name (`session-activity`) or one of `repo`, `ci`, `deps`, `release`.
3. `lint-staged` runs Prettier and ESLint on staged `*.{ts,mjs,json,md}`, and `claude plugin validate` on any mod whose files are staged, when the `claude` CLI is on the PATH.
4. To release, open a PR from `develop` to `main` and merge it with a merge commit, so the commit history `nx release` reads stays intact.
5. `release.yml` on push to `main`: `nx release --skip-publish` bumps each affected mod's `package.json`, runs `tools/sync-plugin-version.mjs` to write the same version into `.claude-plugin/plugin.json`, updates `CHANGELOG.md`, commits `chore(release): …`, tags `session-activity@x.y.z`, and creates a GitHub Release.
6. The same workflow opens or fast-forwards a back-merge from `main` to `develop`, so the version bump reaches `develop`.

Versioning is independent per mod (`projectsRelationship: "independent"`). The version in `plugin.json` is what Claude Code caches by, so the sync script is mandatory: an unbumped version means users never receive the update.

Each mod is released on its own: a release of `session-activity` never bumps, tags or changelogs another mod. The `nx.json` release block:

```json
{
  "release": {
    "projects": ["mods/*"],
    "projectsRelationship": "independent",
    "releaseTagPattern": "{projectName}@{version}",
    "version": {
      "conventionalCommits": true,
      "preVersionCommand": "pnpm nx affected -t validate test"
    },
    "changelog": {
      "projectChangelogs": { "createRelease": "github" },
      "workspaceChangelog": false
    },
    "git": { "commit": true, "tag": true }
  }
}
```

With that config:

- **Automatic, on push to `main`**: `nx release` only bumps mods that have releasable commits (`feat`, `fix`, breaking) scoped to their files since their last tag; unchanged mods are skipped.
- **One mod by hand**: `release.yml` also has a `workflow_dispatch` input `project`, which runs `nx release --projects=<project>`, plus an optional `specifier` (`patch`, `minor`, `major`, or an exact version) to override the conventional-commit bump.
- **Dry run**: `nx release --projects=session-activity --dry-run` locally, to preview the version, changelog and tag.

The version sync into `.claude-plugin/plugin.json` runs per released project, so each mod's manifest only changes when that mod is released. A new mod joins releases by being placed under `mods/` with its own `package.json`; no change to `nx.json` is needed.

## Mod structure

The mod is a plugin with three required files plus a types file for `$.state`. Settings from the Settings board map one-to-one onto `userConfig`, which Claude Code shows as `/config` rows and passes to `register(on, options)`.

`mods/session-activity/.claude-plugin/plugin.json`:

```json
{
  "name": "session-activity",
  "displayName": "Session Activity",
  "version": "0.1.0",
  "description": "Chips above the prompt for the skills, agents, MCP servers, permissions, hooks and rules that activated this session",
  "author": { "name": "tinesoft", "url": "https://github.com/tinesoft" },
  "homepage": "https://github.com/tinesoft/claude-mods/tree/main/mods/session-activity",
  "repository": "https://github.com/tinesoft/claude-mods",
  "license": "MIT",
  "keywords": ["mod", "session", "observability"],
  "types": "./types/index.d.ts",
  "userConfig": {
    "enabled":          { "type": "boolean", "title": "Show chips above the prompt", "description": "Blocked and denied actions are always shown while this is on", "default": true },
    "layout":           { "type": "string",  "title": "Layout", "description": "A row of chips, or one summary chip", "options": ["row", "summary"], "default": "row" },
    "show_skills":      { "type": "boolean", "title": "Skills", "description": "Skills Claude loaded", "default": true },
    "show_agents":      { "type": "boolean", "title": "Agents", "description": "Subagents Claude started", "default": true },
    "show_mcp":         { "type": "boolean", "title": "MCP servers", "description": "MCP servers whose tools were called", "default": true },
    "show_permissions": { "type": "boolean", "title": "Permissions", "description": "Auto-allowed, asked and denied tool calls", "default": true },
    "show_hooks":       { "type": "boolean", "title": "Hooks", "description": "Settings hooks that ran", "default": true },
    "show_rules":       { "type": "boolean", "title": "Rules", "description": "CLAUDE.md and .claude/rules files loaded", "default": true },
    "show_commands":    { "type": "boolean", "title": "Slash commands", "description": "Optional", "default": false },
    "show_context":     { "type": "boolean", "title": "Context", "description": "Optional: compaction and context use", "default": false },
    "show_model":       { "type": "boolean", "title": "Output style and model", "description": "Optional", "default": false },
    "show_background":  { "type": "boolean", "title": "Background tasks", "description": "Optional", "default": false },
    "max_chips":        { "type": "number",  "title": "Chips before overflow", "description": "Chips shown before +N more", "default": 6, "min": 1, "max": 20 }
  }
}
```

`options` on `layout` needs Claude Code v2.1.271 or later, which v2.1.287 already covers.

`mods/session-activity/hooks/hooks.json`:

```json
{
  "description": "session-activity hooks module",
  "modules": ["./register.ts"]
}
```

The module is split so that the logic is testable without the mods API:

| File | Responsibility |
| --- | --- |
| `hooks/register.ts` | Every `on(...)` call and every `$.` call, written in full so `claude plugin validate` can read them |
| `src/model.ts` | `Activation` type, reducer `record(list, event)`, dedupe by `kind + key`, counters, sort order |
| `src/classify.ts` | Pure functions from event data to an `Activation`: MCP server from `mcp__<server>__<tool>`, rule file from a path, and so on |
| `src/render.ts` | Pure functions that build the band and pane trees from the element functions passed in |
| `src/theme.ts` | Glyph, colour and label per type and state |
| `types/index.d.ts` | `PluginState` for `session-activity`: `activations`, `muted`, `selected`, `paneTab`, `filter` |

Two rules from the validator shape the code: never alias `$` or a namespace (`const ui = $.ui` fails), and pass `$` only to top-level functions in `register.ts` or to the `read`/`update` helpers from `claude-code`. The `src/` helpers therefore receive plain data and element constructors, never `$`.

## Data model and event mapping

Every chip is one `Activation`, deduplicated by `kind` and `key`; a repeat increments `count` and updates `lastAt`. The list lives in `$.state` so it survives module reloads, and Claude Code resets it to empty on `/clear`, `/resume` and `/branch`.

```ts
type Kind = 'skill' | 'agent' | 'mcp' | 'perm' | 'hook' | 'rule'
          | 'command' | 'memory' | 'plugin' | 'context' | 'checkpoint' | 'model' | 'background'

type Status = 'active' | 'running' | 'ok' | 'blocked' | 'denied' | 'error'

interface Activation {
  kind: Kind
  key: string            // e.g. 'docx', 'github', 'Bash:git push', '.claude/hooks/block-secrets.sh'
  label: string          // what the chip shows
  detail: string         // the "why" line in the pane
  source?: string        // file path or settings path, shown in the pane
  meta?: string          // e.g. 'PreToolUse · Bash', 'get_pull_request · create_review'
  status: Status
  count: number
  firstAt: number        // $.clock.now()
  lastAt: number
  agentId?: string       // set when a subagent caused it
}
```

Chip order in the band: `blocked`, `denied` and `error` first, then `running`, then by `lastAt` newest first. Muted keys are hidden from the band but stay in the pane.

| Type | Signal | Key and label | States | Confidence |
| --- | --- | --- | --- | --- |
| Skill | `skill.prompt` (observe, return `next(e)`); fallback `tool.call` with `{ tool: 'Skill' }` | Skill name | active | Documented event; field names from the generated types |
| Agent | `agent.spawn` for start, `turn.complete` with `e.agentId` for finish | Subagent type, e.g. `code-reviewer`, `Explore` | running, ok, error | Documented |
| MCP | `tool.call` with `{ tool: /^mcp__/ }`; `await next(e)` for the outcome | Server from `mcp__<server>__<tool>`; tools listed in `meta` | ok, error | Documented |
| Permission | `tool.check`: `await next(e)` gives `allow`, `ask` or `deny`; the `tool.call` result tells whether an asked call ran | `Tool:command` summary, e.g. `Bash:git push` | ok (auto), ok (asked), denied | Documented; "once" vs "always" needs a spike |
| Hook | `classic.PreToolUse`, `classic.PostToolUse`, `classic.Stop`, `classic.SessionStart` and the other `classic.*` events; configured commands from `$.settings.read` | Hook command or script name, else `<Event> hooks` | ok, blocked, error | Needs spike (open decision 2) |
| Rule | `prompt.context` and `prompt.attachment` for loaded instruction files; `classic.InstructionsLoaded` if the build has it | File path, e.g. `CLAUDE.md`, `.claude/rules/testing.md` | active | Needs spike; "applied" is out of v1 (open decision 1) |
| Slash command (optional) | `command.run` (observe) | Command name | ok | Documented |
| Plugin (optional) | `next.origin.plugin` on observed events | Tag on other chips, not its own chip | n/a | Documented |
| Context (optional) | `session.compact`, `session.measure`, `$.session.usage()` | `context`; label `62% used` or `Compacted` | active | Documented |
| Model and style (optional) | `turn.step` model, `config.set` for output style | `model` | active | Documented |
| Background task (optional) | `process.spawn`; `tool.call` with `{ tool: 'Bash' }` and `run_in_background` | Command summary | running, ok, error | Needs spike |
| Memory (optional) | `tool.call` on memory file paths; `prompt.attachment` kinds | Memory file | active | Needs spike |
| Checkpoint (optional) | No documented event | n/a | n/a | Blocked: cut unless a signal turns up |

All observer hooks must return `next(e)` or the result of `await next(e)` unchanged. The mod never answers or rewrites an event, so it can't change Claude's behaviour. A hook that throws before calling `next` is skipped by Claude Code and the event goes on, which is the right failure mode here, so add no `.catch` that denies. Pure helpers in `src/` return safe defaults on unexpected input instead of throwing.

## UI spec

The band shows one line of chips. Pressing a chip, or `+N more`, opens the pane on that item, and the pane carries everything the popover, tray and settings boards held. Terminal rendering of the default board, at 100 columns:

```text
 Done. The summary is in release-summary.docx, and the settings page now passes lint.

 1 ↯ block-secrets  BLOCKED   2 ◉ code-reviewer   3 ⇌ github ×3   4 ⚷ git push   5 ↯ lint-staged ×4   +10 more
╭────────────────────────────────────────────────────────────────────────────────────────────────╮
│ > _                                                                                             │
╰────────────────────────────────────────────────────────────────────────────────────────────────╯
```

And the pane, opened on the blocked hook:

```text
╭ Session activity ────────────────────────────────────────────────────────────────────────── ✕ ╮
│ a: All 16   s: Skills 2   g: Agents 2   p: MCP 2   k: Permissions 3   h: Hooks 4   r: Rules 3   │
│                                                                                                 │
│ ▸ ↯ block-secrets   PreToolUse · Bash    ×1 · 3 min   BLOCKED                                    │
│     Stopped `cat .env` before it ran. Nothing was exposed.                                      │
│     .claude/hooks/block-secrets.sh                        [ m: Mute ]  [ c: Copy path ]          │
│   ◉ code-reviewer   .claude/agents        ×1 · 1 min                                            │
│   ⇌ github          get_pull_request · …  ×3 · 1 min                                            │
│   …                                                                                             │
│ 1: Activity   2: Settings                                                                       │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

### Band (`AbovePrompt`)

1. One `Box` row, `columnGap: 3`, width `e.props.bodyColumns`, which already leaves out the engine's five `[-]` cells. When another mod draws in the band too, its content comes first and the row can wrap.
2. Each chip is a `Button` with `plain: true`, a digit `hotkey` 1–9 in band order, and `key: 'chip-<kind>-<key>'`. Its label is glyph, label, then `×N` when `count > 1`. A digit typed alone into an empty prompt presses it.
3. Status badges are `Text` with `inverse` and `bold`: `BLOCKED`, `DENIED`, `ERROR` in red, `RUNNING` dimmed. Text always carries the meaning, so colour is never the only signal.
4. Visible chips = as many as fit in `bodyColumns`, capped by `max_chips`. Blocked, denied and error chips always fit first. The rest fold into a `+N more` button.
5. Layout `summary` replaces the row with one button: `16 active · ▤2 ◉2 ⇌2 ⚷3 ↯4 ▣3`, plus `· 2 stopped` when anything was blocked or denied.
6. With nothing recorded yet, or `enabled` off, return `next(e)` so the band stays empty and other mods' content still shows.
7. Call `await next(e)` and put its result first in the row, so this mod never hides another mod's band content.

### Pane (`Pane`, id `session-activity`)

1. Opened with `$.ui.open({ id: 'session-activity', title: 'Session activity', focus: true, closeOnEscape: true })` from a chip press, `+N more`, or `/session-activity` registered with `immediate: true`.
2. Two tabs as plain buttons, `1: Activity` and `2: Settings`, as in the docs' `hello-tabs` pattern.
3. Activity: a filter row of plain buttons with letter hotkeys, then grouped rows. The selected row expands to show its `detail` and `source`, which replaces the mockup's popover. Row actions are `m: Mute` / `Unmute` and `c: Copy path` (`$.ui.copy`).
4. Settings: a `Select` for layout and one plain button per type that toggles it, grouped into "Shown by default" and "Optional", plus `Reset to defaults` and `Turn everything on`. Toggles write overrides to `$.store`; `userConfig` stays the default.

### Glyphs and colours

| Type | Glyph | Terminal colour | Desktop hex (from the mockups) |
| --- | --- | --- | --- |
| Skill | `▤` | blue | `#1F4FC1` |
| Agent | `◉` | magenta | `#5B3A99` |
| MCP | `⇌` | magenta, dim | `#9C1F62` |
| Permission | `⚷` | cyan | `#0E6159` |
| Hook | `↯` | yellow | `#9A4A0B` |
| Rule | `▣` | default text | `#2A2D35` |
| Optional types | `/` `◔` `≡` `▶` | dim | `#2A2D35` on `#F0F1F4` |

Every glyph must be one cell wide. Hooks use `↯` because `⚡` is two cells wide (see M1 findings). M3 checks the rest in iTerm2, Terminal.app, Windows Terminal and Ghostty, and swaps `⚷` for `⌐` if needed. Use theme keys from the generated types instead of named colours where one fits, so the chips follow the user's theme.

### Desktop

The same tree renders in the Desktop app. `e.surface === 'desktop'` may use the hex colours above, but v1 adds no Desktop-only elements.

## Testing, validation and CI

All tests run under `claude plugin test`, which needs no session, sign-in or network, so the same command runs locally and in CI. Pure helpers in `src/` are tested there too, so the repo needs no second test runner.

Test files under `mods/session-activity/tests/`:

| File | Covers |
| --- | --- |
| `model.test.ts` | Dedupe, counters, sort order (blocked first), mute filtering |
| `classify.test.ts` | `mcp__github__get_pull_request` → server `github`; rule paths; command summaries |
| `events.test.ts` | Fire `tool.call`, `tool.check`, `agent.spawn`, `skill.prompt`, `classic.*`; assert the recorded activations; assert every hook passes the event on unchanged |
| `band.test.ts` | Render `AbovePrompt` at 60, 100 and 200 columns; overflow count; `summary` layout; empty state returns `next(e)` |
| `pane.test.ts` | Press a chip's hotkey → pane opens on that item; filters; mute; settings toggles persist to a stubbed `$.store` |
| `reset.test.ts` | Activations are empty after `/clear`, and settings survive it |

A minimal events test, in the style of the docs' tutorial:

```ts
import { expect, test } from 'claude-code/testing'

test('an MCP call records one github chip', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'mcp__github__get_pull_request', number: 418 })
  await $.tool.call({ tool: 'mcp__github__create_review', number: 418 })
  // read the band and check the chip label and count
  // exact helpers for rendering a site come from claude-code/testing in your build
})
```

CI in `.github/workflows/ci.yml`, on pull requests and pushes to `develop`:

1. Check out with `fetch-depth: 0` so `nx affected` and `nx release` can read history.
2. Set up pnpm and Node 22, then `pnpm install --frozen-lockfile`.
3. Install the Claude Code CLI at a pinned version (v2.1.287 or the version you tested), following the official install instructions.
4. Run `claude plugin validate . --strict` at the repo root, which checks `marketplace.json`.
5. Run `pnpm nx affected -t lint typecheck validate test`.
6. Lint the PR title with commitlint, so squash merges keep Conventional Commit messages.

The `.claude-plugin/types/` folder Claude Code generates is git-ignored, so `typecheck` in CI needs those declarations from somewhere. Two options: commit a snapshot of `claude-code.d.ts` from the Claude Code repository at the pinned version, or generate it in CI by loading the mod once. Pick in M1; the snapshot is simpler.

## Milestones and acceptance criteria

Six milestones in order; each ends in a PR to `develop`, and M5 ends in the first release from `main`.

**M0 · Repo scaffold**

- [ ] `tinesoft/claude-mods` created with `develop` as the default branch and `main` protected
- [x] Nx workspace, pnpm workspace, husky, commitlint (config-conventional + nx-scopes), lint-staged and Prettier/ESLint in place
- [x] `.claude-plugin/marketplace.json` passes `claude plugin validate . --strict` with the chosen marketplace name
- [ ] `ci.yml` green on an empty mod that only registers `/session-activity`
- [x] Root `README.md` with install instructions pinned to `@main`, `CLAUDE.md`, `LICENSE`

**M1 · Spikes** (one throwaway branch, findings written into this file)

- [x] Log every `classic.*` event and the result of `next(e)` for a `PreToolUse` hook that blocks: can a mod see the hook command and its exit code?
- [x] Log `prompt.context` and `prompt.attachment` payloads at startup: which fields name CLAUDE.md and rules files?
- [x] Log `tool.check` decisions through an asked-and-approved call: is "once" vs "always" visible?
- [x] Confirm `skill.prompt` field names and whether `agent.spawn` exposes the subagent type
- [x] Decide how `typecheck` gets declarations in CI

**M2 · Core model and band**

- [x] Skills, agents, MCP, permissions recorded from real events; hooks and rules per M1 findings
- [x] Band renders chips with glyph, label, count, status badges, overflow and the summary layout
- [x] Blocked and denied always visible and first; digit hotkeys press chips
- [x] Hooks never change event results (a test asserts this for each hooked event)
- [x] `claude plugin validate --strict` and `claude plugin test` green

**M3 · Pane and settings**

- [x] `/session-activity` and chip presses open the pane on the right item, at any terminal width
- [x] Filters, row detail (replaces popover), mute/unmute, copy path
- [x] Settings tab toggles each type; `userConfig` defaults apply; overrides persist across sessions and survive `/clear`
- [ ] Glyph widths checked in four terminals; Desktop renders without refusal lines

**M4 · Optional types**

- [x] Slash commands, context, model/style, background tasks, all off by default
- [x] Memory and checkpoints only if M1 found a signal; otherwise listed in the README as not yet supported

**M5 · Release**

- [ ] `release.yml` runs `nx release`, syncs the version into `plugin.json`, tags `session-activity@0.1.0`, publishes a GitHub Release and back-merges to `develop`
- [ ] Clean install works: `claude plugin marketplace add tinesoft/claude-mods@main`, then `/plugin install session-activity@tinesoft-mods`
- [ ] Mod README states the tested Claude Code version and includes a screenshot of the band and the pane

## Risks and references

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Mods API changes between Claude Code releases | Events or props break silently | Pin the tested version in CI and the README; regenerate types on each bump; re-run `validate` |
| Hook and rule signals are thinner than the design assumes | Hook and rule chips show less detail | M1 spikes decide; event-level fallback is already specified |
| The band is shared with other mods | Chips push out, or hide, another mod's content | Always include `await next(e)`; one row only |
| Wide glyphs misalign the row | Chips overlap in some terminals | M3 terminal check; one-cell fallbacks |
| Marketplace name refused | Users can't add the marketplace | Validate the name in M0 before any docs mention it |
| Unbumped `plugin.json` version | Installed users never get updates | `tools/sync-plugin-version.mjs` in the release job, and a CI check that `plugin.json` matches `package.json` |
| `develop` as default branch | Users who add the marketplace without a ref get unreleased code | Install docs always use `@main` |

References (as of the date above; Claude Code v2.1.287):

- [Create a mod](https://code.claude.com/docs/en/plugins/mods/create)
- [Draw in the interface with a mod](https://code.claude.com/docs/en/plugins/mods/interface): band, pane, elements, `$.state`, `$.store`
- [React to events with a mod](https://code.claude.com/docs/en/plugins/mods/events): `tool.call`, `tool.check`, `classic.*`, ordering
- [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference): events, API, render sites, limits
- [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference): `userConfig`, `options`
- [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference): `metadata.pluginRoot`, reserved names, `ref` pinning
- Design source: `DESIGN.md` and `artboards/` next to this file
