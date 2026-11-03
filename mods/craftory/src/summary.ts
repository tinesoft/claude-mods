import type { PluginStatus } from '../types'
import type { Flow } from './evidence'
import { chipText, phaseMeta } from './card-model'
import { PHASES, PLUGIN, TESTED_RANGE } from './phases'
import { PHASE_LOOKS } from './theme'

export const statusLine = (flow: Flow | null): string | undefined =>
  flow === null ? undefined : `${chipText(flow)} · /craftory`

export function markdownSummary(flow: Flow | null, plugin: PluginStatus): string {
  if (plugin.kind === 'missing') return `Craftory needs ${PLUGIN} ${TESTED_RANGE.label}.`
  if (flow === null) return 'No feature in flight. Start one with /grill-with-docs.'
  const rows = flow.phases.map(view => {
    const meta = phaseMeta(view, flow)
    const state = PHASE_LOOKS[view.state.kind].label
    return `${PHASES[view.phase].n}. **${PHASES[view.phase].label}** · ${state}${meta ? ` · ${meta}` : ''}`
  })
  return [`## ${flow.title}`, ...rows].join('\n')
}
