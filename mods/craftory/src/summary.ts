import type { PluginStatus } from '../types'
import type { Flow } from './evidence'
import { ENGINE_FLOOR } from './_kit/engine-floor'
import { chipText, phaseMeta } from './card-model'
import { PHASES, PLUGIN, TESTED_RANGE } from './phases'
import { PHASE_LOOKS } from './theme'

export const statusLine = (flow: Flow | null): string | undefined =>
  flow === null ? undefined : `${chipText(flow)} · /craftory`

export const unsupportedText = `Craftory needs Claude Code ${ENGINE_FLOOR} or later. Run claude update.`

/** The phase up next and the command that starts it, when it has one to type. */
export function nextAction(flow: Flow): string | null {
  const view = flow.phases.find(p => p.phase === flow.next)
  if (view === undefined || view.command === null) return null
  const command = `/${view.command}${view.args ? ` ${view.args}` : ''}`
  return `Next: **${PHASES[view.phase].label}**, run \`${command}\`.`
}

export function markdownSummary(flow: Flow | null, plugin: PluginStatus): string {
  if (plugin.kind === 'missing') return `Craftory needs ${PLUGIN} ${TESTED_RANGE.label}.`
  if (flow === null) return 'No feature in flight. Start one with /grill-with-docs.'
  const rows = flow.phases.map(view => {
    const meta = phaseMeta(view, flow)
    const state = PHASE_LOOKS[view.state.kind].label
    return `${PHASES[view.phase].n}. **${PHASES[view.phase].label}** · ${state}${meta ? ` · ${meta}` : ''}`
  })
  const next = nextAction(flow)
  return [`## ${flow.title}`, ...rows, ...(next === null ? [] : ['', next])].join('\n')
}
