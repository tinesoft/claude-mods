/**
 * The tracker seam. Each kind turns into the same `TrackerSnapshot`: no front matter or CLI JSON
 * escapes the kind's module.
 *
 * Reading is described as data so the shell has one executor and src stays `$`-free: `plan`
 * lists the reads (directory listings, file reads); the shell performs them and hands the raw
 * results to `parse`. Adding a tracker is one entry in TRACKERS.
 */
import type {
  CraftoryConfig,
  Millis,
  TrackerKind,
  TrackerSnapshot,
  TriageLabels,
} from '../../types'
import * as local from './local'

export { parseIssueRef, refsIn } from './refs'

export type FsListing = { name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number }

export type Read =
  | { kind: 'list'; dir: string } // $.fs.list; a missing directory is an empty listing
  | { kind: 'read'; path: string } // $.fs.read; a missing file reads as null

export type ReadResult =
  { kind: 'list'; entries: FsListing[] | null } | { kind: 'read'; text: string | null }

export type ReadContext = {
  config: CraftoryConfig
  labels: TriageLabels
  now: Millis
}

export type TrackerSpec = {
  label: string
  rich: boolean
  /** Two steps for Local (list, then read each file): `plan` may depend on the earlier results. */
  plan: (ctx: ReadContext, previous: readonly ReadResult[]) => Read[]
  parse: (ctx: ReadContext, results: readonly ReadResult[]) => TrackerSnapshot
  /** Which observed tool calls mean "the tracker may have changed": refresh after them. */
  touches: (ctx: ReadContext, tool: { name: string; command?: string; path?: string }) => boolean
  /** The tracker header in Tickets: `Local Markdown · docs/issues/`. */
  header: (ctx: ReadContext) => string
}

/** Local only for now; GitHub arrives with M3 and GitLab and Other with M5. */
export const TRACKERS: Partial<Record<TrackerKind, TrackerSpec>> = {
  local: local.spec,
}
