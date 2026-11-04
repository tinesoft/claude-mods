# Session activity

A Claude Code mod that shows what activated during a session (skills, agents, MCP servers, permissions, hooks, rules) as chips above the prompt.

## Language

### Activity

**Activation**:
One thing that activated in the session, deduplicated by Kind and key. A repeat raises its count instead of adding another.
_Avoid_: Event, item, entry

**Kind**:
The type of an Activation: skill, agent, mcp, perm, hook, rule, or one of the optional kinds (command, memory, plugin, context, checkpoint, model, background).
_Avoid_: Type (in code), category

**Optional kind**:
A Kind that is off by default and set in Settings. Denied permissions still show.

**Status**:
Where an Activation stands: active, running, ok, blocked, denied or error.
_Avoid_: State

**Blocked / Denied**:
The two Statuses where an action was stopped (by a hook, or by a permission rule). They always show and sort first.
_Avoid_: Failed, rejected

**Mute**:
Hiding an Activation from the band for the session. It stays in the pane, marked Muted.
_Avoid_: Hide, dismiss

### Surfaces

**Chip**:
One Activation in the band: a glyph, a label and a count, tinted by Kind.
_Avoid_: Badge, pill, tag

**Band**:
The region above the prompt that holds the chip row, the detail card and the `⚙` button.
_Avoid_: Banner, header

**Overflow chip**:
The `+N more` button that folds the chips that don't fit the row.

**Detail card**:
What grows in the band above the chip row for a selected Chip: why it activated, three stats and its source.
_Avoid_: Popover, tooltip

**Pane**:
The `/session-activity` view with the tabs Activity and Settings. On VS Code and mobile it is the whole UI.
_Avoid_: Tray, panel, dashboard

**Status line**:
The one-line counter under the prompt, such as `16 active · /session-activity`.

**Summary layout**:
The Settings layout that collapses the chip row into one chip with a count per Kind.

**Rich surface**:
Any surface whose element table has `Svg`: Desktop, VS Code, mobile. It gets icons, exact colours, round chips and clicks.
_Avoid_: GUI

**Tone**:
Light, dark, or none (untinted). Resolved from the setting, the Claude Code theme, the terminal and the system appearance.
_Avoid_: Theme (that is Claude Code's own)

### Signals

**Observer hook**:
A hook that records an event and returns it unchanged. The mod never answers or rewrites an event.
_Avoid_: Interceptor
