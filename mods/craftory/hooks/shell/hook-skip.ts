import { atom, type EngineInterface, read, update } from 'claude-code'
import { PLUGIN } from '../../src/phases'
import { addNotice, holdsNotice, removeNotices } from './notices'

/** Set once the user pressed **Turn off hook events**, or the switch was refused and explained. */
const STORE_HANDLED = 'hookSkipHandled'
const MISSES_TO_NOTICE = 2
const OPTION = 'craftory.hook_events'
const ROW = 'Skill prompt events'
const NOTICE_ID = 'hook-skip'

const pendingState = atom({ plugin: 'craftory', key: 'hookSkipPending' } as const, [])
const missesState = atom({ plugin: 'craftory', key: 'hookSkipMisses' } as const, 0)

/** A new session starts the count again, and a notice left from the last one goes. */
export async function resetHookSkip($: EngineInterface) {
  await update($, pendingState, () => [])
  await update($, missesState, () => 0)
  await removeNotices($, n => n.kind === 'hook-skip')
}

/**
 * A Matt skill started by a typed command or a Skill call while `hook_events` is on. It adds nothing
 * to the run: `skill.prompt` is what starts it, and clears this.
 */
export async function noteSkillSeen($: EngineInterface, skill: string) {
  if (!skill.startsWith(`${PLUGIN}:`)) return
  await update($, pendingState, held => [...held, skill])
}

/** `skill.prompt` arrived for the skill: its start was not skipped. */
export async function noteSkillPrompt($: EngineInterface, skill: string) {
  await update($, pendingState, held => {
    const at = held.indexOf(skill)
    return at < 0 ? held : held.filter((_, i) => i !== at)
  })
}

/**
 * The main turn ended. Starts still pending after a normal end are misses; an interrupted or failed
 * turn clears them uncounted. Raises the notice at the second miss, unless the user already acted on
 * it, and only where something draws it.
 */
export async function noteHookSkipTurnEnd(
  $: EngineInterface,
  e: { reason: string; isAborted: boolean },
  draws: boolean,
) {
  const pending = await read($, pendingState)
  if (pending.length === 0) return
  await update($, pendingState, () => [])
  if (e.reason !== 'answer' || e.isAborted) return
  const before = await read($, missesState)
  const misses = before + pending.length
  await update($, missesState, () => misses)
  // Once, at the crossing: a **Not now** holds until the next session.
  if (before >= MISSES_TO_NOTICE || misses < MISSES_TO_NOTICE || !draws) return
  if ((await $.store.get(STORE_HANDLED)) === true || (await holdsNotice($, NOTICE_ID))) return
  await addNotice($, { kind: 'hook-skip', id: NOTICE_ID, state: 'ask' })
  $.ui.invalidate('ui.render')
}

/** **Turn off hook events**: the switch `/config` has, then what the user does next. */
export async function turnOffHookEvents($: EngineInterface, noticeId: string) {
  const result = await $.config.set({ key: OPTION, value: false })
  await $.store.set(STORE_HANDLED, true)
  const text =
    result.deny === undefined
      ? 'Hook events off. Run `/reload-plugins` to apply.'
      : `${result.deny} Change "${ROW}" under /config instead.`
  await addNotice($, { kind: 'hook-skip', id: noticeId, state: 'done', text })
  $.ui.invalidate('ui.render')
}
