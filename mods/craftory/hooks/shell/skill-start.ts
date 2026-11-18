import type { EngineInterface } from 'claude-code'
import { noteHandoffStart, noteSkillStarted } from './automations'
import { skillStarted } from './flow'

/**
 * A skill began. `skill.prompt` reports it; where `hook_events` is off, the Skill call and the typed
 * `/skill` do, and never both for one start.
 */
export async function onSkillStart($: EngineInterface, skill: string) {
  await skillStarted($, skill)
  await noteSkillStarted($, skill)
  await noteHandoffStart($, skill)
}
