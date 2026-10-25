import { atom, type EngineInterface, read, update } from 'claude-code'
import {
  type Read,
  type ReadContext,
  type ReadResult,
  readTracker,
  TRACKERS,
} from '../../src/tracker'
import type { RepoSnapshot } from '../../types'
import { readText } from './repo'

const TRACKER_TIMEOUT_MS = 20_000

const trackerState = atom({ plugin: 'craftory', key: 'tracker' } as const, null)

export const trackerKindOf = (repo: RepoSnapshot | null) =>
  repo?.setup.state === 'ok' ? repo.setup.value.tracker.kind : 'local'

export function trackerOf($: EngineInterface) {
  return read($, trackerState)
}

function executeReads($: EngineInterface, reads: readonly Read[]) {
  return Promise.all(
    reads.map(async (item): Promise<ReadResult> => {
      switch (item.kind) {
        case 'list': {
          const entries = await $.fs.list(item.dir).catch(() => null)
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
            .catch(() => ({ exitCode: 1, stdout: '' }))
          return { kind: 'run', argv: item.argv, exitCode: result.exitCode, stdout: result.stdout }
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
  const snapshot = await readTracker(spec, context, reads => executeReads($, reads))
  await update($, trackerState, () => snapshot)
  return true
}
