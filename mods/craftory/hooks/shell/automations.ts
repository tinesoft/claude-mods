import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  contextTokens,
  HANDOFF_SCOPE,
  handoffNotice,
  isArmed,
  isHandoffDue,
  rearmSession,
  SESSION_SCOPE,
} from '../../src/automations'
import type { AutomationNotice } from '../../types'
import { addNotice, removeNotices } from './notices'
import { repoFacts } from './repo'

const firedState = atom({ plugin: 'craftory', key: 'automationsFired' } as const, [])

async function hasFired($: EngineInterface, scope: string) {
  return !isArmed(await read($, firedState), scope)
}

/** Holds the notice once per scope; the band draws it when no turn runs. False when already fired. */
export async function raiseAutomation($: EngineInterface, notice: AutomationNotice) {
  if (await hasFired($, notice.scope)) return false
  await update($, firedState, fired => [...fired, notice.scope])
  await addNotice($, notice)
  $.ui.invalidate('ui.render')
  return true
}

/** A new session re-arms the session-scoped automations. */
export async function rearmAutomations($: EngineInterface) {
  await update($, firedState, rearmSession)
  await removeNotices($, n => n.kind === 'automation' && n.scope.startsWith(SESSION_SCOPE))
}

/** One main-session step answered: offers the handoff once its context reaches 80%. */
export async function noteMainStep(
  $: EngineInterface,
  usage: {
    input_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  } | null,
) {
  if (usage === null) return
  const { config } = await repoFacts($)
  if (!config.automation.handoffAt80 || (await hasFired($, HANDOFF_SCOPE))) return
  const window = await $.session
    .usage()
    .then(u => u.context.window)
    .catch(() => 0)
  if (isHandoffDue(contextTokens(usage), window)) await raiseAutomation($, handoffNotice())
}
