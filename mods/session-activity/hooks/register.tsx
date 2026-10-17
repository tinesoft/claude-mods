import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Overrides } from '../types'
import {
  fromBackground,
  fromCommand,
  fromCompaction,
  fromContextUsage,
  fromHook,
  fromInstructions,
  fromMcpCall,
  fromModel,
  fromPermission,
  fromSkill,
  fromSpawn,
  hookCommands,
  hookTarget,
  lineCount,
} from '../src/classify'
import {
  bandCandidates,
  finishAgent,
  record,
  resolveSettings,
  settleAsked,
  type Observed,
} from '../src/model'
import { renderBand, renderPane } from '../src/render'
import { KIND_ORDER } from '../src/theme'

const PANE = 'session-activity'
const COMMAND = 'session-activity'
const STORE_OVERRIDES = 'overrides'

const activations = atom({ plugin: 'session-activity', key: 'activations' } as const, [])
const muted = atom({ plugin: 'session-activity', key: 'muted' } as const, [])
const selected = atom({ plugin: 'session-activity', key: 'selected' } as const, null)
const paneTab = atom({ plugin: 'session-activity', key: 'paneTab' } as const, 'activity')
const filter = atom({ plugin: 'session-activity', key: 'filter' } as const, 'all')
const overrides = atom({ plugin: 'session-activity', key: 'overrides' } as const, null)

async function observe($: EngineInterface, seen: Observed | undefined) {
  if (seen === undefined) return
  const at = await $.clock.now()
  await update($, activations, list => record(list, seen, at))
}

async function readOverrides($: EngineInterface): Promise<Overrides> {
  const held = await read($, overrides)
  if (held !== null) return held
  const stored = await $.store.get(STORE_OVERRIDES)
  return stored !== null && typeof stored === 'object' ? (stored as Overrides) : {}
}

async function writeOverrides($: EngineInterface, change: (old: Overrides) => Overrides) {
  const base = await readOverrides($)
  let written = base
  await update($, overrides, held => (written = change(held ?? base)))
  await $.store.set(STORE_OVERRIDES, written)
}

async function openPane($: EngineInterface, id?: string) {
  if (id !== undefined) {
    await update($, selected, () => id)
    await update($, filter, () => 'all')
    await update($, paneTab, () => 'activity')
  }
  await $.ui.open({ id: PANE, title: 'Session activity', focus: true, closeOnEscape: true })
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
    })
    const stored = await $.store.get(STORE_OVERRIDES)
    if (stored !== null && typeof stored === 'object') {
      await update($, overrides, () => stored as Overrides)
    }
    return next(e)
  })

  on('command.run', { command: 'session-activity' }, async $ => {
    await openPane($)
    return { text: 'Opened the session activity pane.' }
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== COMMAND) await observe($, fromCommand(e.command, e.args))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await update($, activations, () => [])
      await update($, muted, () => [])
      await update($, selected, () => null)
    }
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    await observe($, fromSkill(e))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny === undefined) await observe($, fromSpawn(e, spawned.agentId))
    return spawned
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const status = e.reason === 'answer' ? 'ok' : 'error'
      const at = await $.clock.now()
      await update($, activations, list => finishAgent(list, agentId, status, at))
    }
    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id === undefined) return verdict
    const cwd = await $.session.cwd()
    await observe($, fromPermission(e.tool, e.input, verdict, cwd, e.tool_use_id))
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      await observe($, fromMcpCall(e.tool, ran.isError === true))
      if (e.tool === 'Bash' && e.run_in_background === true) {
        await observe($, fromBackground(e.command, await $.session.cwd()))
      }
    }
    const at = await $.clock.now()
    await update($, activations, list =>
      settleAsked(list, e.tool_use_id, ran.deny === undefined, at),
    )
    return ran
  })

  on('classic.*', async ($, e, next) => {
    const result = (await next(e)) as Record<string, unknown>
    const event = 'hook_event_name' in e ? String(e.hook_event_name) : 'PreToolUse'
    const target = hookTarget(e)
    const commands = hookCommands(await $.settings.read(), event, target)
    const blocked = blockedBy(result)
    await observe($, fromHook(event, commands, blocked === undefined ? {} : { blocked }, target))
    return result as never
  })

  on('classic.InstructionsLoaded', async ($, e, next) => {
    const lines = await $.fs.read(e.file_path).then(lineCount, () => undefined)
    await observe(
      $,
      fromInstructions(
        { path: e.file_path, tier: e.memory_type, reason: e.load_reason, lines },
        await $.session.cwd(),
      ),
    )
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (!('skip' in compacted)) await observe($, fromCompaction(e.trigger))
    return compacted
  })

  on('session.measure', async ($, e, next) => {
    if (e.context.percent !== undefined) await observe($, fromContextUsage(e.context.percent))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) await observe($, fromModel(e.model))
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const settings = resolveSettings(options, await readOverrides($))
    if (!settings.enabled) return below
    const chips = bandCandidates(await read($, activations), settings, await read($, muted))
    if (chips.length === 0) return below
    return renderBand({
      ui: $.ui.resolve(e),
      surface: e.surface,
      columns: e.props.bodyColumns,
      chips,
      settings,
      below,
      onOpen: id => openPane($, id),
    })
  })

  on('ui.render', { component: 'Pane', requestId: 'session-activity' }, async ($, e) => {
    const current = await readOverrides($)
    const settings = resolveSettings(options, current)
    return renderPane({
      ui: $.ui.resolve(e),
      surface: e.surface,
      columns: e.props.bodyColumns,
      now: await $.clock.now(),
      activations: await read($, activations),
      settings,
      muted: await read($, muted),
      selected: await read($, selected),
      tab: await read($, paneTab),
      filter: await read($, filter),
      on: {
        tab: tab => update($, paneTab, () => tab),
        filter: next => update($, filter, () => next),
        select: id => update($, selected, old => (old === id ? null : id)),
        mute: id =>
          update($, muted, list =>
            list.includes(id) ? list.filter(m => m !== id) : [...list, id],
          ),
        copy: text => $.ui.copy({ text, surface: e.surface }),
        layout: layout => writeOverrides($, old => ({ ...old, layout })),
        toggleKind: kind =>
          writeOverrides($, old => ({
            ...old,
            shown: { ...old.shown, [kind]: !resolveSettings(options, old).shown[kind] },
          })),
        toggleEnabled: () =>
          writeOverrides($, old => ({ ...old, enabled: !resolveSettings(options, old).enabled })),
        reset: () => writeOverrides($, () => ({})),
        allOn: () =>
          writeOverrides($, old => ({
            ...old,
            enabled: true,
            shown: Object.fromEntries(KIND_ORDER.map(kind => [kind, true])),
          })),
      },
    })
  })
}
