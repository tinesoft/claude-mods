/**
 * The opt-in automation notice, shared by every automation (handoff at 80%, retro on PR, the
 * weekly architecture check, the unmet Done-when nudge):
 *
 * - off until its switch is on, and visible before it acts: a band notice, never a toast;
 * - drawn only while no turn runs ({@link whileIdle});
 * - one action at most, a skill submitted on the click; Craftory edits no files for it;
 * - once per scope ({@link isArmed}): a press or a dismiss both leave the scope fired.
 */
import type { AutomationNotice, EventNotice } from '../types'
import { namespaced, SKILLS } from './phases'

/** A scope fired with this prefix re-arms when a new session starts. */
export const SESSION_SCOPE = 'session:'

export const isArmed = (fired: readonly string[], scope: string) => !fired.includes(scope)

/** Fired scopes a new session keeps: every one but the session's own. */
export const rearmSession = (fired: readonly string[]) =>
  fired.filter(scope => !scope.startsWith(SESSION_SCOPE))

/** Held notices the band may draw now: automations wait while a turn runs. */
export const whileIdle = <N extends EventNotice>(notices: readonly N[], isWorking: boolean) =>
  isWorking ? notices.filter(n => n.kind !== 'automation') : [...notices]

/** The share of the main session's context window that raises the handoff notice. */
export const HANDOFF_AT = 0.8

export const HANDOFF_SCOPE = `${SESSION_SCOPE}handoff`

/** Tokens a response was answered over: the status line's input side, cached or not. */
export const contextTokens = (usage: {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}) => usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens

export const isHandoffDue = (tokens: number, window: number) =>
  window > 0 && tokens >= HANDOFF_AT * window

export const handoffNotice = (): AutomationNotice => ({
  kind: 'automation',
  id: 'handoff',
  scope: HANDOFF_SCOPE,
  text: 'Context is 80% full · write a handoff so a fresh session can pick up',
  run: { label: 'Write handoff', skill: SKILLS.handoff, args: '' },
})

/** The handoff skill, by the name a skill prompt carries. */
export const isHandoffSkill = (name: string) =>
  name.replace(/^\//, '') === namespaced(SKILLS.handoff)

/** A file the handoff run wrote that can be its document: anything but Craftory's own state. */
export const isHandoffDocument = (path: string) => !/(^|\/)\.craftory\//.test(path)

/** What a finished handoff run links: its last document, unless the run was cancelled. */
export const handoffLink = (run: { path: string | null }, isAborted: boolean) =>
  isAborted ? null : run.path
