import type { FeatureKey, FeatureRecord, IsoTime } from '../types'
import type { Flow } from './evidence'
import { isArchived, specKey } from './features'

export { isArchived }

/** An archived Feature as the pane's Archived list shows it. */
export type ArchivedChoice = { key: FeatureKey; title: string; archivedAt: IsoTime }

/** Every archived Feature, the one archived last first. */
export function archivedChoices(
  features: Readonly<Record<string, FeatureRecord>>,
): ArchivedChoice[] {
  return Object.values(features)
    .filter(isArchived)
    .sort((a, b) => b.archivedAt!.localeCompare(a.archivedAt!))
    .map(f => ({ key: specKey(f.spec), title: f.title || f.spec, archivedAt: f.archivedAt! }))
}

/**
 * The tickets whose agent has not finished cleanly: still running, stopped, failed or over
 * budget. Archiving asks first while any exists, since each may hold a kept worktree.
 */
export const archiveRisks = (record: FeatureRecord): string[] =>
  Object.values(record.agents)
    .filter(a => a.outcome !== 'done')
    .map(a => a.ticket)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

/** What the auto-archive rule reads off a Feature's flow. */
export type ShipFacts = { shipDone: boolean; retroDone: boolean }

/**
 * Archive-on-ship fires once per Feature: when Ship is done, and after the retro when one was
 * offered. A Feature that was ever archived or brought back is left as the user last put it.
 */
export const isAutoArchivable = (record: FeatureRecord, facts: ShipFacts): boolean =>
  record.archivedAt === undefined &&
  record.unarchivedAt === undefined &&
  facts.shipDone &&
  (record.retroOffered !== true || facts.retroDone)

/**
 * Ship's and retro's standing in a Feature's flow. Ship counts once it is done and its pull request
 * is no longer open, so a ready PR waiting for review is not shipped yet. A skipped retro counts as
 * finished.
 */
export function shipFactsOf(flow: Flow): ShipFacts {
  const state = (phase: 'ship' | 'retro') => flow.phases.find(p => p.phase === phase)?.state.kind
  const record = flow.feature.kind === 'specced' ? flow.feature.record : null
  const retro = state('retro')
  return {
    shipDone: state('ship') === 'done' && flow.hasOpenPr !== true,
    retroDone: retro === 'done' || retro === 'skipped' || record?.marks.retro?.ranAt !== undefined,
  }
}

/** A Feature may be archived by hand once it has a record, is not archived, and Ship is done. */
export const canArchive = (flow: Flow): boolean =>
  flow.feature.kind === 'specced' && !isArchived(flow.feature.record) && shipFactsOf(flow).shipDone

/** What the pane's Flow tab needs: whether to offer Archive, and the Archived list. */
export type ArchiveView = {
  /** The key to archive, set only while the active Feature may be archived. */
  archivable: FeatureKey | null
  archived: ArchivedChoice[]
}

export const archiveViewOf = (
  flow: Flow | null,
  features: Readonly<Record<string, FeatureRecord>>,
): ArchiveView => ({
  archivable: flow !== null && canArchive(flow) ? flow.feature.key : null,
  archived: archivedChoices(features),
})
