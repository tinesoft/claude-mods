import type { GatePass, Millis, PhaseId, SkillName } from '../types'
import type { Flow } from './evidence'
import { PHASES } from './phases'

export const PASS_MS = 30_000

export type RunRequest = {
  skill: SkillName
  args: string
  phase: PhaseId | null
}

export type GateAsk = { kind: 'ask'; phase: PhaseId; by: PhaseId; text: string; reason: string }

export type GateVerdict = { kind: 'go' } | GateAsk

export const passKey = (req: RunRequest) => `${req.skill} ${req.args.trim()}`

const isLive = (pass: GatePass, now: Millis) => pass.until > now

export const gateText = (phase: PhaseId, reason: string) =>
  `${PHASES[phase].label} is gated: ${reason}. Run anyway?`

export const dropText = (verdict: GateAsk) =>
  `${verdict.text} Use Run anyway in the Craftory band above the prompt.`

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

export const issuePass = (
  passes: readonly GatePass[],
  req: RunRequest,
  now: Millis,
): GatePass[] => [
  ...passes.filter(p => isLive(p, now) && p.key !== passKey(req)),
  { key: passKey(req), until: now + PASS_MS },
]

export const consumePass = (
  passes: readonly GatePass[],
  req: RunRequest,
  now: Millis,
): GatePass[] => passes.filter(p => isLive(p, now) && p.key !== passKey(req))
