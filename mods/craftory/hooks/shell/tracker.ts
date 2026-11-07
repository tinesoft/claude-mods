import { atom, type EngineInterface, read, update } from 'claude-code'
import { mapArg, mapView, resolveMaps } from '../../src/map-view'
import type { WayfinderOffer } from '../../src/notices'
import {
  type Read,
  type ReadContext,
  type ReadResult,
  readTracker,
  TRACKERS,
} from '../../src/tracker'
import type { RepoSnapshot } from '../../types'
import { activeMapLink } from './features'
import { listDir, readText } from './repo'
import { pickedMapOf } from './ui'

const TRACKER_TIMEOUT_MS = 20_000

const trackerState = atom({ plugin: 'craftory', key: 'tracker' } as const, null)

export const trackerKindOf = (repo: RepoSnapshot | null) =>
  repo?.setup.state === 'ok' ? repo.setup.value.tracker.kind : 'local'

export function trackerOf($: EngineInterface) {
  return read($, trackerState)
}

/** The active map of the tracker's last read, as the rail and pane draw it; null with no map. */
export async function mapViewOf($: EngineInterface) {
  const tracker = await trackerOf($)
  const link = await activeMapLink($)
  const {
    active,
    others,
    link: state,
  } = resolveMaps({
    maps: tracker?.maps ?? [],
    link,
    reachable: tracker?.rich === true && tracker.problem === null,
    picked: await pickedMapOf($),
  })
  return active === null ? null : mapView(active, { others, isLinkStale: state === 'stale' })
}

/** What the suggest notice shows now: the global switch, the active Feature's link, an open map to join. */
export async function wayfinderOfferOf(
  $: EngineInterface,
  suggest: 'long-grill' | 'off',
): Promise<WayfinderOffer> {
  const tracker = await trackerOf($)
  const hasLink = (await activeMapLink($)) !== null
  const { active } = resolveMaps({
    maps: tracker?.rich ? (tracker.maps ?? []) : [],
    link: null,
    reachable: true,
    picked: await pickedMapOf($),
  })
  return {
    enabled: suggest === 'long-grill',
    hasLink,
    attach:
      active !== null && !active.isClosed
        ? { name: active.title, ref: active.ref, arg: mapArg(active) }
        : null,
  }
}

function executeReads($: EngineInterface, reads: readonly Read[]) {
  return Promise.all(
    reads.map(async (item): Promise<ReadResult> => {
      switch (item.kind) {
        case 'list': {
          const entries = await listDir($, item.dir).catch(() => null)
          return {
            kind: 'list',
            entries:
              entries?.map(e => ({
                name: e.name,
                kind: e.kind === 'file' || e.kind === 'dir' ? e.kind : 'other',
                mtimeMs: e.mtimeMs,
              })) ?? null,
          }
        }
        case 'read':
          return { kind: 'read', text: await readText($, item.path) }
        case 'run': {
          const result = await $.process
            .run(item.argv, { timeoutMs: TRACKER_TIMEOUT_MS })
            .catch(() => ({ exitCode: 1, stdout: '', stderr: '' }))
          return {
            kind: 'run',
            argv: item.argv,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }
        }
        default: {
          const _exhaustive: never = item
          return _exhaustive
        }
      }
    }),
  )
}

/** Reads the tracker the repo uses into the snapshot; false when this mod has no reader for it. */
export async function loadTracker($: EngineInterface, repo: RepoSnapshot, context: ReadContext) {
  const spec = TRACKERS[trackerKindOf(repo)]
  if (spec === undefined) return false
  const execute = (reads: readonly Read[]) => executeReads($, reads)
  const snapshot = await readTracker(spec, context, execute)
  // a Local map sits beside a remote tracker's own, read with no prompt
  // (GitLab without a readable `glab` is links-only but still gets them; Other never does)
  const local =
    snapshot.kind !== 'local' && (snapshot.rich || snapshot.kind === 'gitlab')
      ? TRACKERS.local
      : undefined
  const alongside = local && (await readTracker(local, context, execute))
  const merged =
    alongside?.rich && alongside.maps !== undefined
      ? { ...snapshot, maps: [...(snapshot.maps ?? []), ...alongside.maps] }
      : snapshot
  await update($, trackerState, () => merged)
  return true
}
