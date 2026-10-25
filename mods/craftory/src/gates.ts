/**
 * Soft gates (plan decision 6). A gate never refuses on its own: it turns a run request into
 * "go" or "ask", and the shell decides how to ask. A typed command is dropped and the band
 * offers **Run anyway**; a rail press shows the same notice. Run anyway grants a one-shot pass
 * that expires, so an unconsumed pass cannot linger into a later, unrelated run.
 *
 * One function serves both origins, so the rule exists once.
 */
import type { GatePass, Millis, PhaseId, SkillName } from '../types'
import type { Flow } from './evidence'
import { PHASES } from './phases'

export const PASS_MS = 30_000

export type RunRequest = {
  skill: SkillName
  args: string
  /** The phase this run starts; null for entries and helpers that start nothing. */
  phase: PhaseId | null
}

export type GateAsk = { kind: 'ask'; phase: PhaseId; by: PhaseId; text: string; reason: string }

export type GateVerdict = { kind: 'go' } | GateAsk

/** The key a pass is issued and consumed under: the same skill with the same args. */
export const passKey = (req: RunRequest) => `${req.skill} ${req.args.trim()}`

const isLive = (pass: GatePass, now: Millis) => pass.until > now

/** "Review is gated: #44 has 2 failing tests. Run anyway?" */
export const gateText = (phase: PhaseId, reason: string) =>
  `${PHASES[phase].label} is gated: ${reason}. Run anyway?`

/** The reason the user sees under their dropped prompt. */
export const dropText = (verdict: GateAsk) =>
  `${verdict.text} Use Run anyway in the Craftory band above the prompt.`

/**
 * `ask` when the request starts a phase whose step is gated in `flow`. `go` when there is no
 * active flow, the phase is not gated, or a live pass for this request exists.
 */
export function checkRun(
  req: RunRequest,
  flow: Flow | null,
  passes: readonly GatePass[],
  now: Millis,
): GateVerdict {
  if (req.phase === null || flow === null) return { kind: 'go' }
  const state = flow.steps.find(s => s.phase === req.phase)?.state
  if (state?.kind !== 'gated') return { kind: 'go' }
  const key = passKey(req)
  if (passes.some(p => p.key === key && isLive(p, now))) return { kind: 'go' }
  const reason = state.blockers.join(', ') || `${PHASES[state.by].label} is not done`
  return { kind: 'ask', phase: req.phase, by: state.by, reason, text: gateText(req.phase, reason) }
}

/** Grants a pass for this request and drops the expired ones. */
export const issuePass = (
  passes: readonly GatePass[],
  req: RunRequest,
  now: Millis,
): GatePass[] => [
  ...passes.filter(p => isLive(p, now) && p.key !== passKey(req)),
  { key: passKey(req), until: now + PASS_MS },
]

/** Removes the pass a request just used, and every expired one. */
export const consumePass = (
  passes: readonly GatePass[],
  req: RunRequest,
  now: Millis,
): GatePass[] => passes.filter(p => isLive(p, now) && p.key !== passKey(req))
