import type {
  CraftoryConfig,
  IssueRef,
  Millis,
  TrackerKind,
  TrackerSnapshot,
  TriageLabels,
} from '../../types'
import * as github from './github'
import * as gitlab from './gitlab'
import * as links from './links'
import * as local from './local'

export { parseIssueRef, refsIn } from './refs'

export type FsListing = { name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number }

export type Read =
  | { kind: 'list'; dir: string }
  | { kind: 'read'; path: string }
  | { kind: 'run'; argv: readonly string[] }

export type ReadResult =
  | { kind: 'list'; entries: FsListing[] | null }
  | { kind: 'read'; text: string | null }
  | { kind: 'run'; argv: readonly string[]; exitCode: number; stdout: string; stderr?: string }

export type ReadContext = {
  config: CraftoryConfig
  labels: TriageLabels
  now: Millis
  focus?: { specs: readonly IssueRef[]; branch: string | null }
  remoteWeb?: string | null
  otherDescription?: string
}

export type TrackerSpec = {
  label: string
  rich: boolean
  steps?: number
  plan: (ctx: ReadContext, previous: readonly ReadResult[]) => Read[]
  parse: (ctx: ReadContext, results: readonly ReadResult[]) => TrackerSnapshot
  touches: (ctx: ReadContext, tool: { name: string; command?: string; path?: string }) => boolean
  header: (ctx: ReadContext) => string
}

export const TRACKERS: Partial<Record<TrackerKind, TrackerSpec>> = {
  local: local.spec,
  github: github.spec,
  gitlab: gitlab.spec,
  other: links.other,
}

export async function readTracker(
  spec: TrackerSpec,
  ctx: ReadContext,
  execute: (reads: readonly Read[]) => Promise<ReadResult[]>,
): Promise<TrackerSnapshot> {
  const results: ReadResult[] = []
  for (let step = 0; step < (spec.steps ?? 2); step++) {
    const reads = spec.plan(ctx, results)
    if (reads.length === 0) break
    results.push(...(await execute(reads)))
  }
  return spec.parse(ctx, results)
}

/** The spec a ticket belongs to, when the tracker is rich enough to say. */
export function parentOf(tracker: TrackerSnapshot | null, ref: string): IssueRef | null {
  return (tracker?.rich ? tracker.issues.find(i => i.ref === ref)?.parent : null) ?? null
}

/**
 * A Local map sits beside a remote tracker's own, read with no prompt: beside GitHub and GitLab
 * when it lists its issues, and beside GitLab when it is links-only. Other never gets one.
 */
export const readsLocalAlongside = (snapshot: TrackerSnapshot) =>
  snapshot.kind !== 'local' && (snapshot.rich || snapshot.kind === 'gitlab')

/** The snapshot with the Local maps read beside it, when that read could list them. */
export function withLocalMaps(
  snapshot: TrackerSnapshot,
  local: TrackerSnapshot | null,
): TrackerSnapshot {
  return local?.rich && local.maps !== undefined
    ? { ...snapshot, maps: [...(snapshot.maps ?? []), ...local.maps] }
    : snapshot
}
