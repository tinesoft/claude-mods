import type { PluginStatus } from '../types'
import type { Flow } from './evidence'
import { ENGINE_FLOOR } from './_kit/engine-floor'
import { chipText, phaseMeta } from './card-model'
import { PHASES, PLUGIN, TESTED_RANGE } from './phases'
import { PHASE_LOOKS } from './theme'

/** The status line: the summary chip's text, the Feature's spend when it has any, the command. */
export const statusLine = (flow: Flow | null, spend: string | null = null): string | undefined =>
  flow === null ? undefined : `${chipText(flow, spend)} · /craftory`

export const unsupportedText = `Craftory needs Claude Code ${ENGINE_FLOOR} or later. Run claude update.`

/** The phase up next and the command that starts it, when it has one to type. */
export function nextAction(flow: Flow): string | null {
  const view = flow.phases.find(p => p.phase === flow.next)
  if (view === undefined || view.command === null) return null
  const command = `/${view.command}${view.args ? ` ${view.args}` : ''}`
  return `Next: **${PHASES[view.phase].label}**, run \`${command}\`.`
}

/** The reply where nothing draws: the phases, the Feature's spend line when it has one, what's next. */
export function markdownSummary(
  flow: Flow | null,
  plugin: PluginStatus,
  spend: string | null = null,
): string {
  if (plugin.kind === 'missing') return `Craftory needs ${PLUGIN} ${TESTED_RANGE.label}.`
  if (flow === null) return 'No feature in flight. Start one with /grill-with-docs.'
  const rows = flow.phases.map(view => {
    const meta = phaseMeta(view, flow)
    const state = PHASE_LOOKS[view.state.kind].label
    return `${PHASES[view.phase].n}. **${PHASES[view.phase].label}** · ${state}${meta ? ` · ${meta}` : ''}`
  })
  const next = nextAction(flow)
  return [
    `## ${flow.title}`,
    ...rows,
    ...(spend === null ? [] : ['', spend]),
    ...(next === null ? [] : ['', next]),
  ].join('\n')
}
