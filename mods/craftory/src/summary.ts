import type { PluginStatus } from '../types'
import type { Flow } from './evidence'
import { chipText, stepMeta } from './rail'
import { PHASES, PLUGIN, TESTED_RANGE } from './phases'
import { STEP_LOOKS } from './theme'

export const statusLine = (flow: Flow | null): string | undefined =>
  flow === null ? undefined : `${chipText(flow)} · /craftory`

export function markdownSummary(flow: Flow | null, plugin: PluginStatus): string {
  if (plugin.kind === 'missing') return `Craftory needs ${PLUGIN} ${TESTED_RANGE.label}.`
  if (flow === null) return 'No feature in flight. Start one with /grill-with-docs.'
  const rows = flow.steps.map(step => {
    const meta = stepMeta(step, flow)
    const state = STEP_LOOKS[step.state.kind].label
    return `${PHASES[step.phase].n}. **${PHASES[step.phase].label}** · ${state}${meta ? ` · ${meta}` : ''}`
  })
  return [`## ${flow.title}`, ...rows].join('\n')
}
