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
  IssueRef,
  Millis,
  TrackerKind,
  TrackerSnapshot,
  TriageLabels,
} from '../../types'
import * as github from './github'
import * as links from './links'
import * as local from './local'

export { parseIssueRef, refsIn } from './refs'

export type FsListing = { name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number }

export type Read =
  | { kind: 'list'; dir: string } // $.fs.list; a missing directory is an empty listing
  | { kind: 'read'; path: string } // $.fs.read; a missing file reads as null
  | { kind: 'run'; argv: readonly string[] } // $.process.run, for `gh`

export type ReadResult =
  | { kind: 'list'; entries: FsListing[] | null }
  | { kind: 'read'; text: string | null }
  | { kind: 'run'; argv: readonly string[]; exitCode: number; stdout: string }

export type ReadContext = {
  config: CraftoryConfig
  labels: TriageLabels
  now: Millis
  /** What the active feature needs from a tracker that is asked per issue (GitHub). */
  focus?: { specs: readonly IssueRef[]; branch: string | null }
  /** The git remote's web address, for a GitLab project that Settings did not name. */
  remoteWeb?: string | null
  /** The paragraph the user wrote for an Other tracker. */
  otherDescription?: string
}

export type TrackerSpec = {
  label: string
  rich: boolean
  /** How many times `plan` is asked, each time with every earlier result. Two when absent. */
  steps?: number
  /** Two steps for Local (list, then read each file): `plan` may depend on the earlier results. */
  plan: (ctx: ReadContext, previous: readonly ReadResult[]) => Read[]
  parse: (ctx: ReadContext, results: readonly ReadResult[]) => TrackerSnapshot
  /** Which observed tool calls mean "the tracker may have changed": refresh after them. */
  touches: (ctx: ReadContext, tool: { name: string; command?: string; path?: string }) => boolean
  /** The tracker header in Tickets: `Local Markdown · docs/issues/`. */
  header: (ctx: ReadContext) => string
}

export const TRACKERS: Partial<Record<TrackerKind, TrackerSpec>> = {
  local: local.spec,
  github: github.spec,
  gitlab: links.gitlab,
  other: links.other,
}

/**
 * The whole read, with the shell's executor handed in: `plan` is asked `steps` times, each time
 * with every result so far, then `parse` gets all of them.
 */
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
