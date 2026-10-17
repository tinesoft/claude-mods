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
  lineCount,
} from '../src/classify'
import {
  bandCandidates,
  finishAgent,
  record,
  resolveSettings,
  settle,
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
const overrides = atom({ plugin: 'session-activity', key: 'overrides' } as const, {})
const overridesRef = { plugin: 'session-activity', key: 'overrides' } as const

async function observe($: EngineInterface, seen: Observed | undefined) {
  if (seen === undefined) return
  const at = await $.clock.now()
  await update($, activations, list => record(list, seen, at))
}

/** The store keeps overrides across sessions; `$.state` holds the copy the drawings subscribe to. */
async function readOverrides($: EngineInterface): Promise<Overrides> {
  const held = await $.state.get(overridesRef)
  if (held.version > 0 && held.value !== undefined) return held.value
  const stored = await $.store.get(STORE_OVERRIDES)
  return stored !== null && typeof stored === 'object' ? (stored as Overrides) : {}
}

async function writeOverrides($: EngineInterface, change: (old: Overrides) => Overrides) {
  const next = change(await readOverrides($))
  await update($, overrides, () => next)
  await $.store.set(STORE_OVERRIDES, next)
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
  // Asked permission chips wait for the call's outcome, by tool_use_id. A reload
  // forgets them, and those chips then keep their "asked" status.
  const asked = new Map<string, string>()

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
      const status = e.reason === 'error' || e.reason === 'refusal' ? 'error' : 'ok'
      const at = await $.clock.now()
      await update($, activations, list => finishAgent(list, agentId, status, at))
    }
    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id === undefined) return verdict
    const cwd = await $.session.cwd()
    const seen = fromPermission(e.tool, e.input, verdict, cwd)
    if (seen !== undefined && verdict.decision === 'ask') asked.set(e.tool_use_id, seen.key)
    await observe($, seen)
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const isError = ran.isError === true
    await observe($, fromMcpCall(e.tool, isError))
    if (e.tool === 'Bash' && e.run_in_background === true && ran.deny === undefined) {
      await observe($, fromBackground(e.command, await $.session.cwd()))
    }
    const key = asked.get(e.tool_use_id)
    if (key !== undefined) {
      asked.delete(e.tool_use_id)
      const wasDenied = ran.deny !== undefined
      const at = await $.clock.now()
      await update($, activations, list =>
        settle(
          list,
          'perm',
          key,
          wasDenied ? 'denied' : 'ok',
          at,
          wasDenied
            ? 'Claude asked you, and it did not run.'
            : 'Claude asked you, and you let it run.',
        ),
      )
    }
    return ran
  })

  on('classic.*', async ($, e, next) => {
    const result = (await next(e)) as Record<string, unknown>
    const event = 'hook_event_name' in e ? String(e.hook_event_name) : 'PreToolUse'
    const target =
      'tool_name' in e && typeof e.tool_name === 'string'
        ? e.tool_name
        : 'tool' in e && typeof e.tool === 'string'
          ? e.tool
          : undefined
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
            shown: { ...old.shown, [kind]: !settings.shown[kind] },
          })),
        toggleEnabled: () => writeOverrides($, old => ({ ...old, enabled: !settings.enabled })),
        reset: () => writeOverrides($, () => ({})),
        allOn: () =>
          writeOverrides($, () => ({
            enabled: true,
            shown: Object.fromEntries(KIND_ORDER.map(kind => [kind, true])),
          })),
      },
    })
  })
}
