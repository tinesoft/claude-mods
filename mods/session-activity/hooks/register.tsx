import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, Timer } from 'claude-code'

import type { Overrides, PaneView, Settings, Toggle } from '../types'
import {
  fromBackground,
  fromCommand,
  fromCompaction,
  fromContextUsage,
  fromHook,
  fromInstructions,
  fromMcpCall,
  fromMemoryWrite,
  fromModel,
  fromPermission,
  fromSkill,
  fromSpawn,
  hookCommands,
  hookTarget,
  lineCount,
  stopNotice,
} from '../src/classify'
import {
  bandCandidates,
  finishAgent,
  inPane,
  nextFadeAt,
  record,
  resolveSettings,
  settleAsked,
  type Observed,
} from '../src/model'
import { parseColorFgBg, SYSTEM_PROBES } from '../src/appearance'
import { ENGINE_FLOOR, meetsFloor } from '../src/engine'
import { renderPane, type PaneFlag } from '../src/pane'
import { lineSummary, markdownSummary } from '../src/summary'
import { renderBand, type Ui } from '../src/render'
import { resolveTone, SPIN_MS, TOGGLE_ORDER, type Tone } from '../src/theme'

const PANE = 'session-activity'
const COMMAND = 'session-activity'
const STORE_OVERRIDES = 'overrides'
const TOAST_MS = 4000
const APPEARANCE_MS = 60_000
const PROBE_TIMEOUT_MS = 1500
const DETAIL_PANE_ROWS = 10

type Options = Readonly<Record<string, unknown>>

const activations = atom({ plugin: 'session-activity', key: 'activations' } as const, [])
const muted = atom({ plugin: 'session-activity', key: 'muted' } as const, [])
const selected = atom({ plugin: 'session-activity', key: 'selected' } as const, null)
const paneView = atom({ plugin: 'session-activity', key: 'paneView' } as const, 'activity')
const filter = atom({ plugin: 'session-activity', key: 'filter' } as const, 'all')
const model = atom({ plugin: 'session-activity', key: 'model' } as const, null)
const overrides = atom({ plugin: 'session-activity', key: 'overrides' } as const, null)
const appearance = atom({ plugin: 'session-activity', key: 'appearance' } as const, {
  system: null,
  colorFgBg: null,
})

let spinner: Timer | undefined
let appearanceTimer: Timer | undefined
let fadeTimer: Timer | undefined

async function probeSystem($: EngineInterface): Promise<Tone | null> {
  for (const probe of SYSTEM_PROBES) {
    try {
      const result = await $.process.run(probe.argv, { timeoutMs: PROBE_TIMEOUT_MS })
      const tone = probe.read(result)
      if (tone !== undefined) return tone
    } catch {
      // The command is not installed here, or this surface cannot run commands.
    }
  }
  return null
}

async function refreshAppearance($: EngineInterface) {
  const current = {
    system: await probeSystem($),
    colorFgBg: parseColorFgBg(await $.env.get('COLORFGBG')) ?? null,
  }
  await update($, appearance, old =>
    old.system === current.system && old.colorFgBg === current.colorFgBg ? old : current,
  )
}

/** Reads the system appearance off the render path, now and every minute. */
function watchAppearance($: EngineInterface) {
  appearanceTimer?.cancel()
  appearanceTimer = $.clock.every(APPEARANCE_MS, () => refreshAppearance($))
  $.clock.after(0, () => refreshAppearance($))
}

async function readOverrides($: EngineInterface): Promise<Overrides> {
  const held = await read($, overrides)
  if (held !== null) return held
  const stored = await $.store.get(STORE_OVERRIDES)
  return stored !== null && typeof stored === 'object' ? (stored as Overrides) : {}
}

const settingsOf = async ($: EngineInterface, options: Options) =>
  resolveSettings(options, await readOverrides($))

async function refresh($: EngineInterface, options: Options) {
  const list = await read($, activations)
  const settings = await settingsOf($, options)
  const active = settings.enabled ? bandCandidates(list, settings, await read($, muted)).length : 0
  $.ui.status(active > 0 ? `${active} active · /session-activity` : undefined)
  const isRunning = list.some(a => a.status === 'running' && inPane(a, settings))
  if (isRunning && spinner === undefined) {
    spinner = $.clock.every(SPIN_MS, () => $.ui.invalidate('ui.render'))
  } else if (!isRunning && spinner !== undefined) {
    spinner.cancel()
    spinner = undefined
  }
}

async function commit(
  $: EngineInterface,
  options: Options,
  change: (list: Parameters<typeof record>[0]) => ReturnType<typeof record>,
) {
  await update($, activations, change)
  await refresh($, options)
  await scheduleFade($, options)
}

/** One timer redraws as the next fresh dots fade, instead of one per activation. */
async function scheduleFade($: EngineInterface, options: Options) {
  if (fadeTimer !== undefined) return
  const now = await $.clock.now()
  const at = nextFadeAt(await read($, activations), await settingsOf($, options), now)
  if (at === undefined) return
  fadeTimer = $.clock.after(at - now, async () => {
    fadeTimer = undefined
    $.ui.invalidate('ui.render')
    await scheduleFade($, options)
  })
}

async function notify(
  $: EngineInterface,
  options: Options,
  stopped: Parameters<typeof stopNotice>[0],
) {
  const text = stopNotice(stopped)
  if (text !== undefined && (await settingsOf($, options)).toastOnBlock) {
    $.ui.toast(text, { timeoutMs: TOAST_MS })
  }
}

async function observe(
  $: EngineInterface,
  options: Options,
  seen: Observed | undefined,
  { isSettling = false } = {},
) {
  if (seen === undefined) return
  const at = await $.clock.now()
  await commit($, options, list => record(list, seen, at, { isSettling }))
  await notify($, options, seen)
}

async function loadOverrides($: EngineInterface, options: Options) {
  const stored = await $.store.get(STORE_OVERRIDES)
  if (stored !== null && typeof stored === 'object') {
    await update($, overrides, () => stored as Overrides)
  }
  await refresh($, options)
}

async function writeOverrides(
  $: EngineInterface,
  options: Options,
  change: (old: Overrides) => Overrides,
) {
  const base = await readOverrides($)
  let written = base
  await update($, overrides, held => (written = change(held ?? base)))
  await $.store.set(STORE_OVERRIDES, written)
  await refresh($, options)
}

async function toneOf(
  $: EngineInterface,
  settings: Settings,
  surface: RenderSurface,
): Promise<Tone | undefined> {
  const theme = (await $.config.list()).find(row => row.key === 'theme')
  const { system, colorFgBg } = await read($, appearance)
  return resolveTone({
    chipStyle: settings.chipStyle,
    chipTheme: settings.chipTheme,
    claudeTheme: theme?.value,
    surface,
    colorFgBg: colorFgBg ?? undefined,
    system: system ?? undefined,
  })
}

async function openPane($: EngineInterface, view: PaneView, id?: string, rows?: number) {
  if (id !== undefined) {
    await update($, selected, () => id)
    await update($, filter, () => 'all')
  }
  await update($, paneView, () => view)
  await $.ui.open({
    id: PANE,
    title: 'Session activity',
    focus: true,
    closeOnEscape: true,
    ...(rows !== undefined && { rows }),
  })
}

const isSupported = async ($: EngineInterface) => meetsFloor((await $.session.version()).base)

const drawsAnything = async ($: EngineInterface) =>
  (await isSupported($)) && (await $.session.surfaces()).length > 0

/** `Svg` is handed to every surface whose element table has it; the terminal never draws one. */
function uiFor($: EngineInterface, event: Parameters<EngineInterface['ui']['resolve']>[0]): Ui {
  const table = $.ui.resolve(event)
  const { Box, Text, Button } = table
  return event.surface !== 'terminal' && 'Svg' in table
    ? { Box, Text, Button, Svg: table.Svg }
    : { Box, Text, Button }
}

async function copyPath($: EngineInterface, surface: RenderSurface, text: string) {
  await $.ui.copy({ text, surface })
  $.ui.toast(`Copied ${text}`)
}

async function toggleMuted($: EngineInterface, options: Options, id: string) {
  await update($, muted, list => (list.includes(id) ? list.filter(m => m !== id) : [...list, id]))
  await refresh($, options)
}

async function resetActivity($: EngineInterface, options: Options) {
  await update($, activations, () => [])
  await update($, muted, () => [])
  await update($, selected, () => null)
  await refresh($, options)
}

function blockedBy(result: Record<string, unknown>): string | undefined {
  if (typeof result.deny === 'string') return result.deny
  if (typeof result.block === 'string') return result.block
  if (result.preventContinuation === true) {
    return typeof result.stopReason === 'string' ? result.stopReason : 'stopped the turn'
  }
  return undefined
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'session-activity',
      description:
        'Show the skills, agents, MCP servers, permissions, hooks and rules of this session',
      immediate: true,
    })
    await loadOverrides($, options)
    watchAppearance($)
    if (!(await isSupported($))) {
      $.ui.toast(`session-activity needs Claude Code ${ENGINE_FLOOR} or later. Run claude update.`)
    }
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'fork') await resetActivity($, options)
    await loadOverrides($, options)
    return next(e)
  })

  on('command.run', { command: 'session-activity' }, async $ => {
    if (!(await drawsAnything($))) {
      const settings = await settingsOf($, options)
      return { text: markdownSummary(await read($, activations), settings, await read($, muted)) }
    }
    await openPane($, 'activity')
    return { text: 'Opened the session activity pane.' }
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== COMMAND) await observe($, options, fromCommand(e.command, e.args))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') await resetActivity($, options)
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    await observe($, options, fromSkill(e))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny === undefined) await observe($, options, fromSpawn(e, spawned.agentId))
    return spawned
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const status = e.reason === 'answer' ? 'ok' : 'error'
      const at = await $.clock.now()
      await commit($, options, list => finishAgent(list, agentId, status, at))
      return next(e)
    }
    const answered = await next(e)
    const settings = await settingsOf($, options)
    if (!settings.textSummary || !settings.enabled || (await drawsAnything($))) return answered
    const line = lineSummary(await read($, activations), settings, await read($, muted))
    if (line === undefined) return answered
    // A text other than the answer is shown beneath it, so the answer is neither lost nor repeated.
    return { ...answered, text: answered.text === e.answer ? line : `${answered.text}\n${line}` }
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id === undefined) return next(e)
    const cwd = await $.session.cwd()
    await observe($, options, fromPermission(e.tool, e.input, verdict, cwd, e.tool_use_id))
    // At tool.check next(e) replays the settled verdict, it does not ask again.
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      await observe($, options, fromMcpCall(e.tool, ran.isError === true))
      if (ran.isError !== true) await observe($, options, fromMemoryWrite(e.tool, e))
      if (e.tool === 'Bash' && e.run_in_background === true) {
        await observe($, options, fromBackground(e.command, await $.session.cwd()))
      }
    }
    const asked = (await read($, activations)).find(a => a.askedCallId === e.tool_use_id)
    if (asked === undefined) return ran
    const at = await $.clock.now()
    await commit($, options, list => settleAsked(list, e.tool_use_id, ran.deny === undefined, at))
    if (ran.deny !== undefined) {
      await notify($, options, { status: 'denied', label: asked.label, meta: asked.meta })
    }
    return ran
  })

  on('classic.*', async ($, e, next) => {
    const event = 'hook_event_name' in e ? String(e.hook_event_name) : 'PreToolUse'
    const target = hookTarget(e)
    const commands = hookCommands(await $.settings.read(), event, target)
    const isStarted = commands.length > 0
    if (isStarted) await observe($, options, fromHook(event, commands, 'running', target))
    const result = (await next(e)) as Record<string, unknown>
    const blocked = blockedBy(result)
    await observe(
      $,
      options,
      fromHook(event, commands, blocked === undefined ? {} : { blocked }, target),
      { isSettling: isStarted },
    )
    return result as never
  })

  on('classic.InstructionsLoaded', async ($, e, next) => {
    const lines = await $.fs.read(e.file_path).then(lineCount, () => undefined)
    await observe(
      $,
      options,
      fromInstructions(
        { path: e.file_path, tier: e.memory_type, reason: e.load_reason, lines },
        await $.session.cwd(),
      ),
    )
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (!('skip' in compacted)) await observe($, options, fromCompaction(e.trigger))
    return compacted
  })

  on('session.measure', async ($, e, next) => {
    if (e.context.percent !== undefined) {
      await observe($, options, fromContextUsage(e.context.percent))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const last = await read($, model)
      await update($, model, () => e.model)
      if (last !== null && last !== e.model) await observe($, options, fromModel(e.model))
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await isSupported($))) return below
    const settings = await settingsOf($, options)
    if (!settings.enabled) return below
    const chips = bandCandidates(await read($, activations), settings, await read($, muted))
    if (chips.length === 0) return below
    return renderBand({
      ui: uiFor($, e),
      surface: e.surface,
      columns: e.props.bodyColumns,
      maxRows: e.props.maxRows,
      now: await $.clock.now(),
      tone: await toneOf($, settings, e.surface),
      chips,
      settings,
      selected: await read($, selected),
      below,
      on: {
        pick: async (id, fitsCard) => {
          if (fitsCard) await update($, selected, old => (old === id ? null : id))
          else await openPane($, 'detail', id, DETAIL_PANE_ROWS)
        },
        open: async () => {
          const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
          if (isUp && (await read($, paneView)) === 'activity') await $.ui.close({ id: PANE })
          else await openPane($, 'activity')
        },
        settings: async () => {
          const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
          if (isUp && (await read($, paneView)) === 'settings') await $.ui.close({ id: PANE })
          else await openPane($, 'settings')
        },
        close: () => update($, selected, () => null),
        mute: async id => {
          await update($, selected, () => null)
          await toggleMuted($, options, id)
        },
        copy: text => copyPath($, e.surface, text),
      },
    })
  })

  on('ui.render', { component: 'Pane', requestId: 'session-activity' }, async ($, e) => {
    const settings = await settingsOf($, options)
    const change = (patch: (old: Overrides) => Overrides) => writeOverrides($, options, patch)
    return renderPane({
      ui: uiFor($, e),
      surface: e.surface,
      columns: e.props.bodyColumns,
      now: await $.clock.now(),
      tone: await toneOf($, settings, e.surface),
      tintedTone: await toneOf($, { ...settings, chipStyle: 'tinted' }, e.surface),
      activations: await read($, activations),
      settings,
      muted: await read($, muted),
      selected: await read($, selected),
      view: await read($, paneView),
      filter: await read($, filter),
      on: {
        view: view => update($, paneView, () => view),
        filter: value => update($, filter, () => value),
        select: id => update($, selected, old => (old === id ? null : id)),
        mute: id => toggleMuted($, options, id),
        copy: text => copyPath($, e.surface, text),
        set: patch => change(old => ({ ...old, ...patch })),
        toggle: (flag: PaneFlag) =>
          change(old => ({ ...old, [flag]: !resolveSettings(options, old)[flag] })),
        toggleShown: (toggle: Toggle) =>
          change(old => {
            const shown = !resolveSettings(options, old).shown[toggle]
            return { ...old, shown: { ...old.shown, [toggle]: shown } }
          }),
        reset: () => change(() => ({})),
        allOn: () =>
          change(old => ({
            ...old,
            enabled: true,
            shown: Object.fromEntries(TOGGLE_ORDER.map(toggle => [toggle, true])),
          })),
      },
    })
  })
}
