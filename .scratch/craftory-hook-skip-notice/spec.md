# Craftory hook-skip notice

Status: needs-triage

Source: grilling thread on 2026-11-21 ("what next for craftory"), decisions Q6, Q7 and Q10. Seen live: in that session `cc-plugin-sec-default` ran first and sent `skill.prompt` past Craftory, and Craftory said nothing. Builds on the `hook_events` option in `mods/craftory/.claude-plugin/plugin.json` and the fallback paths in `mods/craftory/hooks/register.tsx` (`prompt.submit` and `tool.call` `{ tool: 'Skill' }`).

## Problem Statement

Where an organization's security guard runs before every mod, it can send `skill.prompt` on past Craftory's hook. The engine prints a notice per skipped hook, but Craftory never learns of it. The rail then never marks the phase Running, the automations that wait on a skill start never fire, and the user sees a notice about a hook they did not know existed. The fix exists, turning off `hook_events` so the Skill call and the typed command report skill starts instead, but nothing in Craftory tells the user to use it. `register.tsx` says "A mod cannot detect that", and that is true of the skip itself, but not of its effect.

## Solution

Craftory infers the skip from what it can see. A Matt skill started through a typed command or a Skill call, and the turn ended without a `skill.prompt` for it. After two such misses in one session, the band shows a notice once per machine:

> A security guard skips Craftory's `skill.prompt` hook, so phases may not show as Running. **Turn off hook events** · **Not now**

**Turn off hook events** sets `craftory.hook_events` to `false` with `$.config.set`, as if the user changed it in `/config`, and the notice then says to run `/reload-plugins`, since the option is read when the plugin loads. If `$.config.set` answers `{ deny }` (a trusted source owns the row), the notice says where to change it instead. **Not now** hides the notice for the session, and it can show again in a later session.

## User Stories

1. As a developer behind a security guard, I want Craftory to tell me when its skill hook is being skipped, so that I learn why phases do not show as Running.
2. As a developer, I want a button that applies the fix, so that I do not have to find `hook_events` in `/config`.
3. As a developer, I want to be told to run `/reload-plugins` after the switch, so that I know when it takes effect.
4. As a developer whose organization locks the option, I want the notice to say so and where it is set, so that a refused switch does not look like a bug.
5. As a developer, I want the notice at most once per machine after I act on it, so that I am not nagged.
6. As a developer, I want **Not now** to hide it for this session only, so that I can decide later.
7. As a developer, I want no notice from a single miss, so that a slow surface or a race does not raise a false alarm.
8. As a developer with `hook_events` already off, I want no notice, so that the fallback is not mistaken for a skip.
9. As a developer running a skill that is not from `mattpocock-skills`, I want it ignored, so that other plugins' skills cannot raise the notice.
10. As a developer who interrupts a turn before the skill body loads, I want that turn not to count as a miss.
11. As a developer in `claude -p` or a cloud session, where no band draws, I want nothing shown and nothing written.

## Implementation Decisions

- **Watch both sides while `hook_events` is on.** Today the `prompt.submit` and `tool.call` `{ tool: 'Skill' }` skill-start paths only run with `hook_events` off. With it on, they also record a _pending start_ (skill name, turn) and call nothing else, so `onSkillStart` still runs once per start. `skill.prompt` clears the pending start for its skill.
- **A miss** is a pending start for a `mattpocock-skills:` skill still uncleared when the turn completes normally. An interrupted or failed turn clears its pending starts without counting them (check the `turn.complete` outcome field in the pinned types).
- **Threshold.** Two misses in one session raise the notice. The count lives in memory and resets each session.
- **Once per machine.** A `$.store` flag records that the user pressed **Turn off hook events**, or that the switch was denied and explained. Once set, the notice never shows again. **Not now** writes nothing to the store.
- **The switch.** `$.config.set({ key: 'craftory.hook_events', value: false })`. Confirm the exact key with `$.config.list()` in a probe (see `docs/agents/probing.md`). On `{ value }` the notice changes to "Hook events off. Run `/reload-plugins` to apply." On `{ deny }`, it shows the denial reason and the `/config` row's name.
- **Surfaces.** The notice is a band notice (`src/notices.ts`), drawn where the band draws, and in the pane where none does (VS Code, mobile Flow tab), following the existing split. In `-p` and cloud sessions it is never raised.
- **No hook-order assumption.** Craftory does not try to detect _which_ plugin skipped it. The notice says "a security guard" and names no plugin.

## Testing Decisions

- **Seam: the hooks in the fake world** (`tests/harness.ts`). Assert what the user sees and what is written:
  - two typed Matt commands with no `skill.prompt` raise the notice; one does not;
  - a `skill.prompt` that follows clears the pending start, so no notice;
  - a non-Matt skill, `hook_events: false`, an interrupted turn, and a session with no band raise nothing;
  - **Turn off hook events** calls `$.config.set` with `false`, then shows the reload line; a `{ deny }` shows the denial;
  - after the press, a new session with two misses raises nothing; after **Not now** it does.
- **No double start.** With `hook_events` on and `skill.prompt` arriving, `onSkillStart` runs once per start (regression guard for the new observers).
- **Prior art.** `deny-rules.test.ts` and the automation notice tests for band-notice shape.
- Run tests on the pinned Claude Code (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`).

## Out of Scope

- Detecting which plugin skipped the hook, or its order in the fold.
- Working around the skip in any other way than the existing `hook_events` fallback.
- Other skipped hooks (`classic.WorktreeCreate` under managed installs keeps its Risks fallback).

## Further Notes

- Tickets, in vertical slices: (1) probe the `$.config.set` key and the `turn.complete` outcome field on the pinned version; (2) pending starts and the miss count, with the exclusions; (3) the notice, the switch, the store flag and the reload line; (4) README Limits and the `hook_events` description updated to point at the notice. 2 is blocked by 1; 3 by 2.
- Update the comment at `register.tsx:381`, which says a mod cannot detect the skip.
- Commit scope is `craftory`. Do not edit versions or `CHANGELOG.md` by hand.
