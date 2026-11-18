import { atom, type EngineInterface, read, update } from 'claude-code'
import { noteHandoffStart, noteSkillStarted } from './automations'
import { skillStarted } from './flow'

/**
 * A managed plugin above this one (an organization's default security plugin, say) may end the
 * `skill.prompt` chain before Craftory's hook runs. The skill still starts, so its start is also
 * noted from the Skill tool call and from the typed `/skill` prompt. Each source reports the same
 * start within one turn, so the first in wins and the rest are ignored until the turn ends.
 */
const lastStart = atom(
  { plugin: 'craftory', key: 'lastSkillStart' } as const,
  null as string | null,
)

/** A skill began: from `skill.prompt`, or from a fallback source when that hook was skipped. */
export async function onSkillStart($: EngineInterface, skill: string) {
  const name = skill.replace(/^\//, '')
  if ((await read($, lastStart)) === name) return
  await update($, lastStart, () => name)
  await skillStarted($, skill)
  await noteSkillStarted($, skill)
  await noteHandoffStart($, skill)
}

/** A main turn ended: the next start of the same skill is a new one. */
export async function skillTurnEnded($: EngineInterface) {
  await update($, lastStart, () => null)
}
