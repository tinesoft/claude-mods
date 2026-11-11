import { atom, type EngineInterface, read, update } from 'claude-code'
import type { Flow } from '../../src/evidence'
import { checkRun, consumePass, issuePass, type RunRequest } from '../../src/gates'
import { diffSignals, signalBasis } from '../../src/signals'
import { repoRoot } from './repo'
import type {
  DraftFeature,
  EventNotice,
  FeatureRecord,
  NoticeKey,
  TrackerSnapshot,
} from '../../types'

const noticesState = atom({ plugin: 'craftory', key: 'notices' } as const, [])

const dismissedState = atom({ plugin: 'craftory', key: 'dismissed' } as const, [])

const passesState = atom({ plugin: 'craftory', key: 'passes' } as const, [])

const signalsState = atom({ plugin: 'craftory', key: 'signals' } as const, null)

export function heldNotices($: EngineInterface) {
  return read($, noticesState)
}

export function dismissedOf($: EngineInterface) {
  return read($, dismissedState)
}

export async function dismissNotice($: EngineInterface, key: NoticeKey) {
  await update($, dismissedState, held => [...held.filter(k => k !== key), key])
  $.ui.invalidate('ui.render')
}

export async function addNotice($: EngineInterface, notice: EventNotice) {
  await update($, noticesState, held => [...held.filter(n => n.id !== notice.id), notice])
}

/** Removes the notices `drops` picks. Callers that show the result settle after. */
export async function removeNotices($: EngineInterface, drops: (notice: EventNotice) => boolean) {
  await update($, noticesState, held => held.filter(n => !drops(n)))
}

export async function holdsNotice($: EngineInterface, id: string) {
  return (await read($, noticesState)).some(n => n.id === id)
}

/** A gate notice outlives its reason: once the phase stops being gated its notice goes. */
export async function pruneGateNotices($: EngineInterface, flow: Flow | null) {
  const stale = new Set(
    (await read($, noticesState)).flatMap(n =>
      n.kind === 'gate' && flow?.phases.find(s => s.phase === n.phase)?.state.kind !== 'gated'
        ? [n.id]
        : [],
    ),
  )
  if (stale.size > 0) await update($, noticesState, list => list.filter(n => !stale.has(n.id)))
}

/** What changed since the last look at the tracker, held notices included. */
export async function newSignals(
  $: EngineInterface,
  held: {
    features: Readonly<Record<string, FeatureRecord>>
    drafts: Readonly<Record<string, DraftFeature>>
    tracker: TrackerSnapshot
  },
) {
  const next = signalBasis({
    ...held,
    notices: await read($, noticesState),
    root: await repoRoot($),
  })
  const signals = diffSignals(await read($, signalsState), next)
  await update($, signalsState, () => next)
  return signals
}

export async function checkGate($: EngineInterface, req: RunRequest, flow: Flow | null) {
  return checkRun(req, flow, await read($, passesState), await $.clock.now())
}

export async function issueGatePass($: EngineInterface, req: RunRequest) {
  const now = await $.clock.now()
  await update($, passesState, held => issuePass(held, req, now))
}

export async function consumeGatePass($: EngineInterface, req: RunRequest) {
  const now = await $.clock.now()
  await update($, passesState, held => consumePass(held, req, now))
}
