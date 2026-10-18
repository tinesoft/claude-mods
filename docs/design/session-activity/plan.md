# Handoff: session-activity mod (claude-mods)

Oct 15, 2026 · @Tine Kondo

## Summary

Build `session-activity`, a Claude Code mod that shows chips in the band above the prompt for each skill, agent, MCP server, permission decision, settings hook and rule that activated during the session. It is the first plugin in a new Nx monorepo, `github.com/tinesoft/claude-mods`, which doubles as a plugin marketplace.

The validated mockups were drawn as a GUI. A mod draws in Claude Code's terminal and Desktop app with a small element set (`Box`, `Text`, `Button`, `Input`, `Select`, `Markdown`), so the design translates as follows:

| Mockup board | In the mod | Render site / API |
| --- | --- | --- |
| Chip row above the prompt | One row of plain buttons with an icon glyph, label and count, coloured by type; overflow as `+N more` | `ui.render` on `AbovePrompt` |
| Chip popover | Detail card that grows in the band under the selected chip; small pane as fallback (see UI spec, U2) | `ui.render` on `AbovePrompt`, else `Pane` |
| Expanded tray | A pane with type filters, grouped rows, mute/unmute | `$.ui.open` + `Pane`, opened by `/session-activity` or the `+N more` button |
| Settings board | `2: Settings` tab in the pane, with live preview, saved in `$.store`; `userConfig` holds defaults (U5) | `Pane`, `$.store`, `plugin.json` `userConfig` |
| Types and states sheet | Glyph + colour + text badge per type and state; never colour alone | `Text` `color`, `bold`, `dimColor`, `inverse` |
| Mobile board | Out of scope: mods run in the terminal and Desktop only | n/a |

Surfaces, as agreed with the owner:

| Surface | Scope |
| --- | --- |
| Terminal (`claude`, including editor terminals and JetBrains) | Full UI |
| Claude Desktop app, Code tab | Full UI, first-class: clicks, hover, exact colours, `Svg` icons; the closest to the design |
| claude.ai/code cloud sessions | Optional milestone M6: text summaries only, after a spike confirms the plugin can be installed and the text shows |
| Remote Control from claude.ai or mobile | Nothing to build: the chips appear in the terminal on the user's machine |
| claude.ai chat, VS Code chat panel, `claude -p` | Out of scope: claude.ai chat has no mod support; the other two run hooks but draw nothing |
| Desktop WSL sessions | Out of scope: plugins don't load there |

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
| 8 | Desktop app support in v1? | Desktop draws the same tree, adds clicks, hover, exact hex colours and `Svg`. | Decided: Desktop is a first-class target with its own rendering path (see UI spec, Desktop). claude.ai chat is out of scope; cloud sessions get optional text summaries (M6). |
| 9 | Where settings live | `userConfig` is set at install or in `pluginConfigs`; in-pane toggles need `$.store`. | Decided (U5): pane Settings tab is primary, saved in `$.store`; `userConfig` = defaults. |
| 10 | History scope | Chips per session, or a history across sessions? | Per session in `$.state`, reset on `/clear`, `/resume`, `/branch`. |
| 11 | Optional types with no clear signal (checkpoints, memory) | No event names them directly. | Ship the five with clear signals first; checkpoints and memory only after a spike. |
| 12 | License | Needed for a public marketplace. | MIT. |

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
    "show_memory":      { "type": "boolean", "title": "Memory", "description": "Optional", "default": false },
    "show_plugins":     { "type": "boolean", "title": "Plugins", "description": "Optional: tag chips with their plugin", "default": false },
    "show_context":     { "type": "boolean", "title": "Context", "description": "Optional: compaction and context use", "default": false },
    "show_checkpoints": { "type": "boolean", "title": "Checkpoints", "description": "Optional", "default": false },
    "show_model":       { "type": "boolean", "title": "Output style and model", "description": "Optional", "default": false },
    "show_background":  { "type": "boolean", "title": "Background tasks", "description": "Optional", "default": false },
    "max_chips":        { "type": "number",  "title": "Chips before overflow", "description": "Chips shown before +N more", "default": 6, "min": 1, "max": 20 },
    "chip_style":       { "type": "string",  "title": "Chip style", "description": "Tinted chips, or coloured text only", "options": ["tinted", "text"], "default": "tinted" },
    "chip_hotkeys":     { "type": "boolean", "title": "Digit hotkeys on chips", "description": "Type 1-9 alone in an empty prompt to open a chip", "default": false },
    "toast_on_block":   { "type": "boolean", "title": "Toast when blocked or denied", "description": "Show a short notice when an action is blocked or denied", "default": true },
    "text_summary":     { "type": "boolean", "title": "Text summary after each answer", "description": "Where nothing can be drawn (cloud sessions), add a one-line activity summary", "default": false }
  }
}
```

`options` on `layout` and `chip_style` needs Claude Code v2.1.271 or later, which v2.1.287 already covers.

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
| `src/icons.ts` | `Svg` path strings for the Desktop icons, taken from the artboards |
| `src/theme.ts` | Glyph, label, light and dark palettes per type and state; theme detection from `$.config.list()` rows |
| `types/index.d.ts` | `PluginState` for `session-activity`: `activations`, `muted`, `selected`, `paneView`, `filter`, `prefs` (settings loaded from `$.store`) |

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

The terminal UI follows the design files in `artboards/` as closely as the mods interface allows. Every decision below was settled with the owner; the table maps each design element to its terminal form and how faithful it is.

### Decisions

| # | Topic | Decision |
| --- | --- | --- |
| U1 | Chip look | Tinted chips, as in the design. Light palette for light themes, dark palette for dark themes, picked from Claude Code's theme read through `$.config.list()`. If the theme can't be read (M1 spike), fall back to coloured text with no background. Setting `chip_style: tinted \| text` overrides. |
| U2 | Chip popover | The band grows under the chip row to show the detail card (anchored, like the design). When `e.props.maxRows` is too small for the card, open the pane in its `detail` view instead (`rows: 10`). |
| U3 | Digit hotkeys on the band | Off by default (a bare `1` typed into the prompt would open a chip). Setting `chip_hotkeys` turns them on. Keyboard path: Ctrl+X then Tab to focus, Up/Down, Enter. Mouse: click, in fullscreen mode and Desktop. |
| U4 | Footer counter | `$.ui.status` line under the prompt: `16 active · /session-activity`. `PromptHint` is left alone. |
| U5 | Settings | The pane's `2: Settings` tab is the main place; changes are saved per user in `$.store`. `userConfig` holds install-time defaults only; "Reset to defaults" returns to them. |
| U6 | Toast | A 4-second `$.ui.toast` when an action is blocked or denied, e.g. `↯ block-secrets blocked Bash`. Setting `toast_on_block`, on by default. Not in the design; agreed addition. |

Input model: keyboard first. Mouse clicks only reach Claude Code in fullscreen rendering (`/tui fullscreen`, a research preview) and in the Desktop app; whether a click presses a mod's `Button` in the terminal is an M1 spike. Nothing may require the mouse.

### Mapping: chip row (`Main.dc.html`)

| Design | Terminal | Fidelity |
| --- | --- | --- |
| Rounded tinted chip: icon, label, `×N` | `Box` with the type's `backgroundColor` and `paddingX: 1`, holding a coloured glyph `Text`, a `Button` (`plain: true`) for the label, and a `×N` `Text` | Close: same tints and order, square ends |
| Type colours | Palette tokens below (light and dark), with theme keys as fallback | Exact in truecolor terminals, approximate in 256-colour |
| `Blocked` / `Denied` badge | `Text` with `inverse`, `bold`, red: ` BLOCKED ` | Exact |
| Selected chip, focus ring | Claude Code's focus highlight plus `underline` on the selected label | Close |
| `+N more`, dashed outline | Plain `Button`, `dimColor`, label `+10 more` (no dashed borders exist) | Approximate |
| One row, overflow | One row sized to `e.props.bodyColumns`, first row 2 cells shorter, blocked/denied/error first, rest folded into `+N more` | Exact |
| Footer "16 active · Customize chips" | `$.ui.status`: `16 active · /session-activity` (U4) | Close |

### Mapping: chip popover

| Design | Terminal | Fidelity |
| --- | --- | --- |
| Card above the chip row | Detail card drawn in the band under the chips (U2); pane `detail` view as fallback | Close (band) / framed (pane) |
| Eyebrow `TYPE · event`, name | Coloured `Text` small-caps-style eyebrow (`SKILL · Loaded on match`), bold name | Exact |
| Why line | `Text`, `wrap: 'wrap'` | Exact |
| Three stat tiles | Three `Box`es in a row, `backgroundColor` = neutral tile token, each a dim label over a bold value | Close |
| Source path | `Text`, `dimColor`, `wrap: 'truncate-middle'` | Exact |
| Open source, Mute for this session | `[ o: Open source ]` copies the path (`$.ui.copy`; a mod can't open an editor), `[ m: Mute ]` | Close |
| Close ✕ | Esc, or pressing the same chip again | Exact behaviour |

### Mapping: expanded tray (`Expanded.dc.html`)

| Design | Terminal | Fidelity |
| --- | --- | --- |
| Panel above the composer | Pane id `session-activity`, title `Session activity`; inline above the prompt, or a sidebar in wide fullscreen | Exact / docked |
| Header line with counts | First row: `16 items · 27 activations · started 18 min ago` | Exact |
| Segmented filter with counts | Plain buttons `a: All 16  s: Skills 2  g: Agents 2  p: MCP 2  k: Permissions 3  h: Hooks 4  r: Rules 3`; inactive ones `dimColor` | Close |
| Group headers | Coloured eyebrow `Text` + dim count | Exact |
| Row: tinted icon tile, name, meta, badge, why, `×N · last` | Glyph `Text` on tint, bold name, dim meta, badge, why line below, right-aligned `×N · last`; the row is a focusable `Button` | Close |
| Per-row Mute / Unmute | Up/Down to a row, then `m` (one hotkey per drawing, so it acts on the focused row) | Same result, different input |
| Muted row at 60% opacity | `dimColor` + `Muted` badge | Close |
| Collapse chevron | Esc, or `+N more` again | Exact behaviour |
| Customize link | `,: Settings` switches to the Settings tab | Exact |

### Mapping: settings (`Settings.dc.html`)

| Design | Terminal | Fidelity |
| --- | --- | --- |
| Settings page with left nav | Tab `2: Settings` in the pane (tabs `1: Activity`, `2: Settings`) | Approximate |
| Master switch | Plain button `● Show chips above the prompt` / `○ …` | Close |
| Live preview + layout segmented control | The real band renderer drawn inside the tab, with plain buttons `Chip row` / `Collapsed summary` | Exact |
| "Shown by default" and "Optional · N of 7 on" | Two titled groups; each row a button toggling `●`/`○`, dimmed when off, description below | Close |
| Reset to defaults, Turn everything on | Bracketed buttons | Exact |
| Extra rows (not on the board) | `Chip style` (tinted / text), `Digit hotkeys on chips`, `Toast when blocked or denied` | Additions from U1, U3, U6 |

### Mapping: types and states (`States.dc.html`)

| Design | Terminal | Fidelity |
| --- | --- | --- |
| Just activated: halo + dot, 4 s | `bold` + `●` prefix, cleared by `$.clock.after(4000)` | Close |
| Running: spinner ring | Glyph cycles `◐◓◑◒` on `$.clock.every(150)`, started only while something runs | Close |
| Repeated `×N` | Same | Exact |
| Blocked / Denied | Red ` BLOCKED ` / ` DENIED ` badge, sorted first, plus toast (U6) | Exact + |
| Hook failed: dashed red outline, triangle | Red `▲` glyph + ` ERROR ` badge | Close |
| Muted: struck through | Hidden from the band; dim + `Muted` in the tray (`Text` has no strikethrough) | Approximate |
| Pinned | Out of scope for v1 | n/a |
| Collapsed summary chip | One tinted `Box`: `16 active · ▤2 ◉2 ⇌2 ⚷3 ↯4 ▣3 · ● 2 stopped` | Exact |

`Mobile.dc.html` is out of scope.

### Band (`AbovePrompt`) rules

1. One chip row; the detail card (U2) adds rows below it only while a chip is selected.
2. Width `e.props.bodyColumns`, first row 2 cells shorter. Respect `e.props.maxRows`; hide entirely while `e.props.hasSurvey` is true.
3. Always include `await next(e)` first, so other mods' band content stays.
4. Nothing recorded, or disabled: return `next(e)`.
5. Chip buttons get a `hotkey` digit only when `chip_hotkeys` is on.

### Pane (`Pane`, id `session-activity`) rules

1. Opened with `$.ui.open({ id: 'session-activity', title: 'Session activity', focus: true, closeOnEscape: true })` from `+N more`, `/session-activity` (registered with `immediate: true`), or the fallback of U2 (`rows: 10`, view `detail`).
2. Views: `detail` (one item, popover content), `activity` (tab 1), `settings` (tab 2), kept in `$.state` as `paneView`.
3. Opened only by user action, so it places at any width.

### Palette

Light palette = the design's hex values. Dark palette = same hue, deeper tint, lighter text. Tune both in M3 against real terminals.

| Type | Glyph | Light fg / tint | Dark fg / tint | Theme-key fallback |
| --- | --- | --- | --- | --- |
| Skill | `▤` | `#1F4FC1` / `#EDF2FD` | `#8FB0FF` / `#1B2A4A` | blue |
| Agent | `◉` | `#5B3A99` / `#F3EEFB` | `#C3A8F5` / `#2C2147` | magenta |
| MCP | `⇌` | `#9C1F62` / `#FCEEF5` | `#F29BC8` / `#3D1A2D` | magenta |
| Permission | `⚷` | `#0E6159` / `#E8F5F2` | `#7FD6C8` / `#123A35` | cyan |
| Hook | `↯` | `#9A4A0B` / `#FDF1E6` | `#F5B47A` / `#3D2614` | yellow |
| Rule | `▣` | `#2A2D35` / `#FFFFFF` | `#D5D8DE` / `#24262C` | default |
| Optional | `/ ✎ ⬡ ◔ ⚑ ≡ ▶` | `#2A2D35` / `#F0F1F4` | `#C9CCD3` / `#2A2C31` | dim |
| Blocked / error | — | `#FFFFFF` on `#B42318` | `#FFFFFF` on `#B42318` | red |
| Stat tile | — | `#F5F6F8` | `#2A2C31` | — |

Every glyph must be one cell wide. `↯` replaces `⚡` for hooks; `⚷` is checked in M3 and swapped for `⌐` if it renders two cells wide.

### Desktop

The Desktop app (Code tab) is a first-class target. The same hooks render both surfaces, branching on `e.surface === 'desktop'` only where Desktop can get closer to the design:

| Design element | Terminal (above) | Desktop |
| --- | --- | --- |
| Chip icon | One-cell Unicode glyph | `Svg` icon redrawn from the artboards (layers, robot, plug, key, bolt, shield; optional-type icons), 14 px, in the type colour |
| Chip shape | Tinted `Box`, square ends | Tinted `Box` with `borderStyle: 'round'` and the type's border colour, if the M1 spike shows it reads as a pill; else tinted `Box` without border |
| Colours | Palette with theme-key fallback | Exact hex values from the light or dark palette, matching the app's theme |
| Selecting a chip, filters, toggles, Mute | Keyboard first; clicks only in fullscreen mode | Click (and keyboard) |
| Hover | None | `hover` on chips and tray rows: tint one step darker |
| Popover | Detail card grown in the band | Same card, with `Svg` icon and stat tiles; still anchored in the band, not floating |
| Settings switches | `●` / `○` buttons | Same buttons, plus an `Svg` switch drawing beside each label |
| Spinner (running) | Cycling glyphs | `Svg` ring, redrawn on the same timer |

Rules for the Desktop path:

1. No Desktop-only behaviour: every action stays reachable in the terminal; Desktop only changes how things look and adds clicks.
2. `Svg` icons live in `src/icons.ts` as path strings taken from the artboards' SVG markup; each stays far below the 131,072-character limit.
3. Never use elements the reference marks terminal-only on the Desktop path, and never `Svg` on the terminal path (it doesn't draw there).
4. The `Client` element (a region drawn by a second file, with pointer input) is not used in v1. M1 checks what it can render on Desktop; if it can draw the chip row pixel-close to the design, it becomes a later option.

### claude.ai/code cloud sessions (optional, M6)

Nothing a mod draws appears in a cloud session, and a cloud session doesn't install plugins from the repo's `enabledPlugins` or from user settings. If the M1 spike shows the environment's setup script can install the plugin (`claude plugin marketplace add tinesoft/claude-mods@main` then `claude plugin install session-activity@tinesoft-mods`), the mod falls back to text when `$.session.surfaces` has no drawing surface:

- `/session-activity` replies with a Markdown summary grouped like the tray.
- An optional one-line summary after each answer through `turn.complete`, e.g. `Activity: ▤ docx · ◉ code-reviewer · ↯ block-secrets BLOCKED`, behind a `text_summary` setting (off by default).

## Testing, validation and CI

All tests run under `claude plugin test`, which needs no session, sign-in or network, so the same command runs locally and in CI. Pure helpers in `src/` are tested there too, so the repo needs no second test runner.

Test files under `mods/session-activity/tests/`:

| File | Covers |
| --- | --- |
| `model.test.ts` | Dedupe, counters, sort order (blocked first), mute filtering |
| `classify.test.ts` | `mcp__github__get_pull_request` → server `github`; rule paths; command summaries |
| `events.test.ts` | Fire `tool.call`, `tool.check`, `agent.spawn`, `skill.prompt`, `classic.*`; assert the recorded activations; assert every hook passes the event on unchanged |
| `band.test.ts` | Render `AbovePrompt` on both the terminal and desktop surfaces, at 60, 100 and 200 columns; `Svg` only on desktop; overflow count; `summary` layout; detail card under a selected chip and pane fallback at small `maxRows`; `chip_style: text`; no hotkeys unless `chip_hotkeys`; empty state returns `next(e)` |
| `pane.test.ts` | Press a chip's hotkey → pane opens on that item; filters; mute; settings toggles persist to a stubbed `$.store` |
| `reset.test.ts` | Activations are empty after `/clear`, and settings survive it |
| `fallback.test.ts` | With no drawing surface, `/session-activity` replies with the Markdown summary and `text_summary` adds one line per turn |
| `toast.test.ts` | A denied `tool.check` or blocked call shows one toast; none when `toast_on_block` is off |

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

Six milestones in order, plus an optional seventh; each ends in a PR to `develop`, and M5 ends in the first release from `main`.

**M0 · Repo scaffold**

- [ ] `tinesoft/claude-mods` created with `develop` as the default branch and `main` protected
- [ ] Nx workspace, pnpm workspace, husky, commitlint (config-conventional + nx-scopes), lint-staged and Prettier/ESLint in place
- [ ] `.claude-plugin/marketplace.json` passes `claude plugin validate . --strict` with the chosen marketplace name
- [ ] `ci.yml` green on an empty mod that only registers `/session-activity`
- [ ] Root `README.md` with install instructions pinned to `@main`, `CLAUDE.md`, `LICENSE`

**M1 · Spikes** (one throwaway branch, findings written into this file)

- [ ] Log every `classic.*` event and the result of `next(e)` for a `PreToolUse` hook that blocks: can a mod see the hook command and its exit code?
- [ ] Log `prompt.context` and `prompt.attachment` payloads at startup: which fields name CLAUDE.md and rules files?
- [ ] Log `tool.check` decisions through an asked-and-approved call: is "once" vs "always" visible?
- [ ] Confirm `skill.prompt` field names and whether `agent.spawn` exposes the subagent type
- [ ] Decide how `typecheck` gets declarations in CI
- [ ] Read Claude Code's theme from `$.config.list()`: which row and values? Decides U1 (tinted vs text fallback)
- [ ] In fullscreen rendering (`/tui fullscreen`), does clicking a mod `Button` call `onPress`? Does Ctrl+X then Tab focus the band?
- [ ] Check that hex `backgroundColor` renders in truecolor terminals and degrades acceptably in a 256-colour one
- [ ] Desktop: how the app styles a `Button`; whether a tinted `Box` with `borderStyle: 'round'` reads as a pill; `hover` behaviour; `Svg` icon sizing next to text
- [ ] Desktop: what the `Client` element can render and whether it receives clicks (decides if a pixel-close chip row is a later option)
- [ ] Cloud: can a cloud environment's setup script install the plugin, and does a `/session-activity` text reply or a `turn.complete` line show in the claude.ai/code transcript? (decides M6)

**M2 · Core model and band**

- [ ] Skills, agents, MCP, permissions recorded from real events; hooks and rules per M1 findings
- [ ] Band renders chips with glyph, label, count, status badges, overflow and the summary layout
- [ ] Blocked and denied always visible and first; toast on block/deny (U6)
- [ ] Tinted chips with light and dark palettes, text fallback (U1); status line counter (U4)
- [ ] Detail card grows in the band under the selected chip, pane fallback when `maxRows` is too small (U2)
- [ ] Hooks never change event results (a test asserts this for each hooked event)
- [ ] `claude plugin validate --strict` and `claude plugin test` green

**M3 · Pane and settings**

- [ ] `/session-activity` and chip presses open the pane on the right item, at any terminal width
- [ ] Filters, row detail (replaces popover), mute/unmute, copy path
- [ ] Settings tab with live preview, type toggles, chip style, digit hotkeys (off by default) and toast toggle; `userConfig` defaults apply; overrides in `$.store` persist across sessions and are reloaded after `/clear` via `classic.SessionStart`
- [ ] Glyph widths and both palettes checked in four terminals and one light and one dark theme
- [ ] Desktop path: `Svg` icons, exact colours, round tinted chips (per M1), hover, click on every control, light and dark app themes; no refusal lines
- [ ] Every action reachable by keyboard alone

**M4 · Optional types**

- [ ] Slash commands, plugins tag, context, model/style, background tasks, all off by default
- [ ] Memory and checkpoints only if M1 found a signal; otherwise listed in the README as not yet supported

**M5 · Release**

- [ ] `release.yml` runs `nx release`, syncs the version into `plugin.json`, tags `session-activity@0.1.0`, publishes a GitHub Release and back-merges to `develop`
- [ ] Clean install works: `claude plugin marketplace add tinesoft/claude-mods@main`, then `/plugin install session-activity@tinesoft-mods`
- [ ] Mod README states the tested Claude Code version, lists supported surfaces (terminal, Desktop Code tab; not claude.ai chat), and includes terminal and Desktop screenshots of the band and the pane

**M6 · Cloud text summaries** (optional, only if the M1 cloud spike succeeds)

- [ ] README section with the cloud environment setup script that installs the plugin
- [ ] `/session-activity` Markdown reply and the opt-in `text_summary` line, tested with no drawing surface

## Risks and references

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Desktop draws buttons and fonts its own way | Desktop chips look less like the design than hoped | M1 Desktop spike; `Svg` icons and exact colours carry the likeness |
| Users expect the chips on claude.ai | Confusion after install | README and marketplace description state the supported surfaces |
| Mods API changes between Claude Code releases | Events or props break silently | Pin the tested version in CI and the README; regenerate types on each bump; re-run `validate` |
| Hook and rule signals are thinner than the design assumes | Hook and rule chips show less detail | M1 spikes decide; event-level fallback is already specified |
| The band is shared with other mods | Chips push out, or hide, another mod's content | Always include `await next(e)`; one row only |
| Wide glyphs misalign the row | Chips overlap in some terminals | M3 terminal check; one-cell fallbacks |
| Theme can't be detected | Tinted chips look wrong on one theme | Text-only fallback (U1); `chip_style` override |
| Clicks don't press mod buttons in the terminal | Mouse users can't use chips | Keyboard path for everything; clicks are a bonus (fullscreen, Desktop) |
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
