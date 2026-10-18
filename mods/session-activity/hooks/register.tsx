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
  record,
  resolveSettings,
  settleAsked,
  type Observed,
} from '../src/model'
import { renderPane, type PaneFlag } from '../src/pane'
import { renderBand, type Ui } from '../src/render'
import { FRESH_MS, paletteFor, SPIN_MS, TOGGLE_ORDER, type Palette } from '../src/theme'

const PANE = 'session-activity'
const COMMAND = 'session-activity'
const STORE_OVERRIDES = 'overrides'
const TOAST_MS = 4000
const DETAIL_PANE_ROWS = 10

type Options = Readonly<Record<string, unknown>>

const activations = atom({ plugin: 'session-activity', key: 'activations' } as const, [])
const muted = atom({ plugin: 'session-activity', key: 'muted' } as const, [])
const selected = atom({ plugin: 'session-activity', key: 'selected' } as const, null)
const paneView = atom({ plugin: 'session-activity', key: 'paneView' } as const, 'activity')
const filter = atom({ plugin: 'session-activity', key: 'filter' } as const, 'all')
const overrides = atom({ plugin: 'session-activity', key: 'overrides' } as const, null)

let spinner: Timer | undefined

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
  const isRunning = list.some(a => a.status === 'running')
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

async function observe($: EngineInterface, options: Options, seen: Observed | undefined) {
  if (seen === undefined) return
  const at = await $.clock.now()
  await commit($, options, list => record(list, seen, at))
  $.clock.after(FRESH_MS, () => $.ui.invalidate('ui.render'))
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

async function toneOf($: EngineInterface, settings: Settings): Promise<Palette> {
  if (settings.chipStyle === 'text') return undefined
  const theme = (await $.config.list()).find(row => row.key === 'theme')
  return paletteFor(theme?.value)
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

/** `Svg` is only handed to Desktop, whatever else the host's element table carries. */
function uiFor($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0]): Ui {
  const table = $.ui.resolve(e)
  const { Box, Text, Button } = table
  return e.surface === 'desktop' && 'Svg' in table
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
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    await loadOverrides($, options)
    return next(e)
  })

  on('command.run', { command: 'session-activity' }, async $ => {
    await openPane($, 'activity')
    return { text: 'Opened the session activity pane.' }
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== COMMAND) await observe($, options, fromCommand(e.command, e.args))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await update($, activations, () => [])
      await update($, muted, () => [])
      await update($, selected, () => null)
      await refresh($, options)
    }
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
    }
    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id === undefined) return verdict
    const cwd = await $.session.cwd()
    await observe($, options, fromPermission(e.tool, e.input, verdict, cwd, e.tool_use_id))
    return verdict
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
    const at = await $.clock.now()
    await commit($, options, list => settleAsked(list, e.tool_use_id, ran.deny === undefined, at))
    if (asked !== undefined && ran.deny !== undefined) {
      await notify($, options, { status: 'denied', label: asked.label, meta: asked.meta })
    }
    return ran
  })

  on('classic.*', async ($, e, next) => {
    const result = (await next(e)) as Record<string, unknown>
    const event = 'hook_event_name' in e ? String(e.hook_event_name) : 'PreToolUse'
    const target = hookTarget(e)
    const commands = hookCommands(await $.settings.read(), event, target)
    const blocked = blockedBy(result)
    await observe(
      $,
      options,
      fromHook(event, commands, blocked === undefined ? {} : { blocked }, target),
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
    if (e.agentId === undefined) await observe($, options, fromModel(e.model))
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const settings = await settingsOf($, options)
    if (!settings.enabled) return below
    const chips = bandCandidates(await read($, activations), settings, await read($, muted))
    if (chips.length === 0) return below
    return renderBand({
      ui: uiFor($, e),
      columns: e.props.bodyColumns,
      maxRows: e.props.maxRows,
      now: await $.clock.now(),
      tone: await toneOf($, settings),
      chips,
      settings,
      selected: await read($, selected),
      below,
      on: {
        pick: async (id, fitsCard) => {
          if (fitsCard) await update($, selected, old => (old === id ? null : id))
          else await openPane($, 'detail', id, DETAIL_PANE_ROWS)
        },
        open: () => openPane($, 'activity'),
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
      columns: e.props.bodyColumns,
      now: await $.clock.now(),
      tone: await toneOf($, settings),
      activations: await read($, activations),
      settings,
      muted: await read($, muted),
      selected: await read($, selected),
      view: await read($, paneView),
      filter: await read($, filter),
      on: {
        view: view => update($, paneView, () => view),
        filter: next => update($, filter, () => next),
        select: id => update($, selected, old => (old === id ? null : id)),
        mute: id => toggleMuted($, options, id),
        copy: text => copyPath($, e.surface, text),
        set: patch => change(old => ({ ...old, ...patch })),
        toggle: (flag: PaneFlag) => change(old => ({ ...old, [flag]: !settings[flag] })),
        toggleShown: (toggle: Toggle) =>
          change(old => ({ ...old, shown: { ...old.shown, [toggle]: !settings.shown[toggle] } })),
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
