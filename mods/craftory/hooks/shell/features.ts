import { atom, type EngineInterface, read, update } from 'claude-code'
import { isoOf, recordOf } from '../../src/build'
import {
  applyChange,
  applyDraftChange,
  bindSpec,
  draftKey,
  type FeatureChange,
  featureOf,
  featurePath,
  FEATURES_DIR,
  draftsToStore,
  lastActiveEntry,
  lastActiveOf,
  mergeFeature,
  newDraft,
  parseDrafts,
  parseFeature,
  pickActive,
  promote,
  serialiseFeature,
  specKey,
  STORE_DRAFTS,
  STORE_LAST_ACTIVE,
} from '../../src/features'
import { parentOf } from '../../src/tracker'
import type {
  AgentRun,
  BudgetScope,
  FeatureKey,
  FeatureRecord,
  IssueRef,
  PhaseId,
  TrackerSnapshot,
} from '../../types'
import { listDir, readText, repoRoot, sh, writableContext, writeRepoFile } from './repo'
import { trackerOf } from './tracker'

const MAX_SAVES = 5

const featuresState = atom({ plugin: 'craftory', key: 'features' } as const, {})

const draftsState = atom({ plugin: 'craftory', key: 'drafts' } as const, {})

const activeState = atom({ plugin: 'craftory', key: 'active' } as const, null)

export function featuresOf($: EngineInterface) {
  return read($, featuresState)
}

export function draftsOf($: EngineInterface) {
  return read($, draftsState)
}

export function activeKey($: EngineInterface) {
  return read($, activeState)
}

async function readFeatures($: EngineInterface) {
  const entries = await listDir($, FEATURES_DIR).catch(() => [])
  const records = await Promise.all(
    entries
      .filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
      .map(async entry => parseFeature((await readText($, `${FEATURES_DIR}${entry.name}`)) ?? '')),
  )
  const features: Record<string, FeatureRecord> = {}
  for (const loaded of records)
    if (loaded.state === 'ok') features[loaded.value.spec] = loaded.value
  return features
}

/** Re-reads the records on disk only: drafts and the active feature are the user's, not the disk's. */
export async function reloadFeatures($: EngineInterface) {
  const features = await readFeatures($)
  await update($, featuresState, () => features)
}

export async function loadFeatures($: EngineInterface) {
  const features = await readFeatures($)
  const [root, branch, last, storedDrafts] = await Promise.all([
    repoRoot($),
    currentBranch($),
    $.store.get(STORE_LAST_ACTIVE),
    $.store.get(STORE_DRAFTS),
  ])
  const drafts = parseDrafts(storedDrafts, root)
  await update($, featuresState, () => features)
  await update($, draftsState, () => drafts)
  await update($, activeState, () =>
    pickActive({ features, drafts, git: { branch }, lastActive: lastActiveOf(last, root) }),
  )
}

/** The branch checked out now, or null when git cannot say (no repo, a detached HEAD). */
async function currentBranch($: EngineInterface): Promise<string | null> {
  const shown = await sh($, ['git', 'branch', '--show-current'])
  const name = shown?.exitCode === 0 ? shown.stdout.trim() : ''
  return name === '' ? null : name
}

/**
 * Every change of the active feature is remembered for the next session, so the one rule is
 * that nothing writes the active atom except here. Loading is not a change: it reads the
 * remembered key and picks from it.
 */
export async function setActive($: EngineInterface, key: FeatureKey | null) {
  await update($, activeState, () => key)
  if (key === null) await $.store.delete(STORE_LAST_ACTIVE)
  else await $.store.set(STORE_LAST_ACTIVE, lastActiveEntry(await repoRoot($), key))
}

/** The Feature to show after the active one is archived: the newest unarchived one, or none. */
export async function reselectActive($: EngineInterface) {
  const [features, drafts] = await Promise.all([featuresOf($), draftsOf($)])
  await setActive($, pickActive({ features, drafts, git: null, lastActive: null }))
}

export async function activeRecord($: EngineInterface): Promise<FeatureRecord | null> {
  const feature = featureOf(
    await read($, activeState),
    await read($, featuresState),
    await read($, draftsState),
  )
  return feature?.kind === 'specced' ? feature.record : null
}

/** The wayfinder map the active Feature names, whether it is a spec'd Feature or still a draft. */
export async function activeMapLink($: EngineInterface): Promise<IssueRef | null> {
  const feature = featureOf(
    await read($, activeState),
    await read($, featuresState),
    await read($, draftsState),
  )
  if (feature === null) return null
  return (feature.kind === 'draft' ? feature.draft.map : feature.record.map) ?? null
}

export async function featureOfTicket(
  $: EngineInterface,
  ticket: string,
): Promise<FeatureRecord | null> {
  const parent = parentOf(await trackerOf($), ticket)
  return parent ? ((await read($, featuresState))[parent] ?? null) : null
}

async function persistDrafts($: EngineInterface) {
  const [root, stored, mine] = await Promise.all([
    repoRoot($),
    $.store.get(STORE_DRAFTS),
    read($, draftsState),
  ])
  await $.store.set(STORE_DRAFTS, draftsToStore(stored, mine, root))
}

async function saveFeature($: EngineInterface, record: FeatureRecord): Promise<FeatureRecord> {
  const path = featurePath(record.spec)
  const raw = await readText($, path)
  const disk = raw === null ? null : parseFeature(raw)
  const merged = mergeFeature(disk?.state === 'ok' ? disk.value : null, record)
  const after = serialiseFeature(merged)
  if (after !== raw) await writeRepoFile($, { path, before: raw, after }, await writableContext($))
  return merged
}

/**
 * Writes the session's copy of a record to disk. The copy lives in the atom, which serialises
 * every change, and a save is a join with the disk copy, so a write that raced another save
 * is repeated until the atom holds nothing the last write lacked.
 */
async function persistFeature(
  $: EngineInterface,
  spec: IssueRef,
): Promise<FeatureRecord | undefined> {
  let last: FeatureRecord | undefined
  for (let attempt = 0; attempt < MAX_SAVES; attempt++) {
    const mine = (await read($, featuresState))[spec]
    if (mine === undefined) return last
    const saved = await saveFeature($, mine)
    await update($, featuresState, held => ({
      ...held,
      [spec]: mergeFeature(held[spec] ?? null, saved),
    }))
    last = (await read($, featuresState))[spec]
    if (last !== undefined && serialiseFeature(last) === serialiseFeature(saved)) return last
  }
  return last
}

export async function adoptRecord($: EngineInterface, record: FeatureRecord) {
  await update($, featuresState, held => ({
    ...held,
    [record.spec]: mergeFeature(held[record.spec] ?? null, record),
  }))
  return (await persistFeature($, record.spec)) ?? record
}

export async function recordChange($: EngineInterface, key: FeatureKey, change: FeatureChange) {
  const feature = featureOf(key, await read($, featuresState), await read($, draftsState))
  if (feature === null) return
  if (feature.kind === 'draft') {
    const next = applyDraftChange(feature.draft, change)
    await update($, draftsState, held => ({ ...held, [next.draftId]: next }))
    await persistDrafts($)
    return
  }
  const { spec } = feature.record
  await update($, featuresState, held => ({
    ...held,
    [spec]: applyChange(held[spec] ?? feature.record, change),
  }))
  await persistFeature($, spec)
}

/**
 * The one writer of a Feature's own dollar budget, for Raise budget and the Flow tab's field:
 * whole dollars, `0` for none, `null` to drop it so the default applies again.
 */
export async function setOwnBudget(
  $: EngineInterface,
  key: FeatureKey,
  scope: BudgetScope,
  usd: number | null,
) {
  await recordChange($, key, { kind: 'budget', target: scope, usd })
}

/** The agent's ledger run, written onto the feature that owns its ticket. */
export async function recordRun($: EngineInterface, run: AgentRun) {
  const record = (await featureOfTicket($, run.ticket)) ?? (await activeRecord($))
  if (record !== null)
    await recordChange($, specKey(record.spec), { kind: 'agent', record: recordOf(run) })
}

/** A new draft becomes the active feature. */
export async function createDraft(
  $: EngineInterface,
  from: { title: string; entry: PhaseId; enteredFrom: IssueRef | null },
): Promise<FeatureKey> {
  const now = await $.clock.now()
  const draft = newDraft({ draftId: `d${now}`, ...from, at: isoOf(now), root: await repoRoot($) })
  await update($, draftsState, held => ({ ...held, [draft.draftId]: draft }))
  await persistDrafts($)
  const key = draftKey(draft.draftId)
  await setActive($, key)
  return key
}

/**
 * Turns each draft the tracker now shows a spec for into a feature record. The active key
 * follows the draft; the key pairs are returned for whoever else holds a draft key.
 */
export async function promoteDrafts(
  $: EngineInterface,
  tracker: Extract<TrackerSnapshot, { rich: true }>,
  integrationBranchOf: (title: string) => string,
): Promise<{ from: FeatureKey; to: FeatureKey }[]> {
  const bound = new Set(Object.keys(await read($, featuresState)))
  const moved: { from: FeatureKey; to: FeatureKey }[] = []
  for (const draft of Object.values(await read($, draftsState))) {
    const spec = bindSpec(draft, tracker, bound)
    if (spec === undefined) continue
    const record = await adoptRecord($, promote(draft, spec, integrationBranchOf(spec.title)))
    bound.add(spec.ref)
    await update($, draftsState, held =>
      Object.fromEntries(Object.entries(held).filter(([id]) => id !== draft.draftId)),
    )
    const from = draftKey(draft.draftId)
    const to = specKey(record.spec)
    if ((await read($, activeState)) === from) await setActive($, to)
    await persistDrafts($)
    moved.push({ from, to })
  }
  return moved
}
