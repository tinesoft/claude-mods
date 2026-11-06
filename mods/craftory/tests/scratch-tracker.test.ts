import { expect, test } from 'claude-code/testing'
import { applyDraftChange, bindSpec, newDraft } from '../src/features'
import { DEFAULT_LABELS } from '../src/agents-md'
import { DEFAULT_CONFIG } from '../src/config'
import {
  readTracker,
  type FsListing,
  type Read,
  type ReadContext,
  type ReadResult,
} from '../src/tracker'
import { spec as scratchSpec } from '../src/tracker/local'

type Files = Record<string, string | { text: string; mtimeMs: number }>

/** An in-memory repo answering the reads the tracker plans. */
const fs =
  (files: Files) =>
  async (reads: readonly Read[]): Promise<ReadResult[]> =>
    reads.map((read): ReadResult => {
      if (read.kind === 'read') {
        const file = files[read.path]
        return {
          kind: 'read',
          text: file === undefined ? null : typeof file === 'string' ? file : file.text,
        }
      }
      if (read.kind === 'list') {
        const dir = read.dir.replace(/\/$/, '') + '/'
        const seen = new Map<string, FsListing>()
        for (const [path, file] of Object.entries(files)) {
          if (!path.startsWith(dir)) continue
          const rest = path.slice(dir.length)
          const [first = '', ...more] = rest.split('/')
          seen.set(first, {
            name: first,
            kind: more.length > 0 ? 'dir' : 'file',
            mtimeMs: typeof file === 'string' ? 1 : file.mtimeMs,
          })
        }
        return { kind: 'list', entries: seen.size === 0 ? null : [...seen.values()] }
      }
      throw new Error('the Local tracker only lists and reads')
    })

const ctx: ReadContext = { config: DEFAULT_CONFIG, labels: DEFAULT_LABELS, now: 9 }
const read = async (files: Files) => {
  const snapshot = await readTracker(scratchSpec, ctx, fs(files))
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  return snapshot
}

const SPEC =
  '# Export invoices\n\nStatus: ready-for-agent\n\n## Problem Statement\nx\n\n## User Stories\n1. As an accountant, I want a CSV\n2. As an admin, I want a filter\n'
const CSV = {
  '.scratch/csv-export/spec.md': SPEC,
  '.scratch/csv-export/issues/01-button.md':
    '# 01: Export button\n\nStatus: ready-for-agent\n\nBody.\n',
  '.scratch/csv-export/issues/02-tax.md':
    '# 02: Ledger tax\n\nStatus: ready-for-agent\nBlocked by: 01\n\nBody.\n',
}

test('a feature folder reads as its spec and tickets, refs being paths', async () => {
  const { issues } = await read(CSV)
  expect(issues.map(i => [i.ref, i.kind, i.parent, i.title])).toEqual([
    ['csv-export', 'spec', null, 'Export invoices'],
    ['csv-export/01', 'ticket', 'csv-export', 'Export button'],
    ['csv-export/02', 'ticket', 'csv-export', 'Ledger tax'],
  ])
  expect(issues[0]).toMatchObject({
    role: 'ready-for-agent',
    stories: 2,
    location: '.scratch/csv-export/spec.md',
  })
  expect(issues[2]).toMatchObject({ blockedBy: ['csv-export/01'], status: 'open' })
})

test('a blocker names a ticket of the same feature by number, or of another by path', async () => {
  const { issues } = await read({
    ...CSV,
    '.scratch/csv-export/issues/03-pdf.md': '# 03: PDF\n\nBlocked by: 01, billing/02\n',
    '.scratch/billing/spec.md': SPEC,
    '.scratch/billing/issues/02-rates.md': '# 02: Rates\n\nBlocked by: None\n',
  })
  expect(issues.find(i => i.ref === 'csv-export/03')?.blockedBy).toEqual([
    'csv-export/01',
    'billing/02',
  ])
  expect(issues.find(i => i.ref === 'billing/02')?.blockedBy).toEqual([])
})

test('a wayfinder map folder is not a feature, but a folder with a spec and a map is', async () => {
  const { issues } = await read({
    ...CSV,
    '.scratch/mvp/map.md': '# Map\n\n## Destination\nx\n',
    '.scratch/mvp/issues/01-research.md': '# Research\n\nType: research\nStatus: resolved\n',
    '.scratch/both/map.md': '# Map\n\n## Destination\nx\n',
    '.scratch/both/spec.md': SPEC,
  })
  expect(issues.map(i => i.ref)).toEqual(['both', 'csv-export', 'csv-export/01', 'csv-export/02'])
})

test('a spec was created when its file last changed, which is how a draft finds it', async () => {
  const { issues } = await read({
    ...CSV,
    '.scratch/csv-export/spec.md': { text: SPEC, mtimeMs: 1234 },
  })
  expect(issues.find(i => i.ref === 'csv-export')?.createdAt).toBe(1234)
})

test('no .scratch folder is an empty tracker, and an unreadable file is named', async () => {
  expect(await read({})).toMatchObject({ issues: [], problem: null, at: 9 })
  const snapshot = await readTracker(scratchSpec, ctx, async reads => {
    const answer = await fs(CSV)(reads)
    return answer.map((r, i) =>
      r.kind === 'read' && reads[i]?.kind === 'read' && reads[i].path.endsWith('01-button.md')
        ? { kind: 'read', text: null }
        : r,
    )
  })
  expect(snapshot).toMatchObject({ problem: '.scratch/csv-export/issues/01-button.md: unreadable' })
})

test('only writes and commands that touch .scratch refresh the tracker', () => {
  expect(scratchSpec.touches(ctx, { name: 'Write', path: '/r/.scratch/csv-export/spec.md' })).toBe(
    true,
  )
  expect(scratchSpec.touches(ctx, { name: 'Edit', path: '/r/src/a.ts' })).toBe(false)
  expect(scratchSpec.touches(ctx, { name: 'Bash', command: 'ls .scratch/' })).toBe(true)
  expect(scratchSpec.touches(ctx, { name: 'Bash', command: 'ls' })).toBe(false)
  expect(scratchSpec.header(ctx)).toBe('Local Markdown · .scratch/')
})

test('a renamed triage label still maps to its role, and wontfix closes the issue', async () => {
  const labels = { ...DEFAULT_LABELS, 'ready-for-agent': 'afk', wontfix: 'nope' }
  const snapshot = await readTracker(
    scratchSpec,
    { ...ctx, labels },
    fs({
      '.scratch/a/spec.md': '# A\n\nStatus: afk\n',
      '.scratch/a/issues/01-b.md': '# 01: B\n\nStatus: nope\n',
    }),
  )
  if (!snapshot.rich) throw new Error('expected a rich tracker')
  expect(snapshot.issues).toMatchObject([
    { ref: 'a', role: 'ready-for-agent', status: 'open' },
    { ref: 'a/01', role: 'wontfix', status: 'closed' },
  ])
})

test('a draft binds to a spec written after its Spec phase ran, never to an older one', async () => {
  const draft = applyDraftChange(
    newDraft({
      draftId: 'd1',
      title: 'Export',
      entry: 'align',
      enteredFrom: null,
      at: '2026-10-24T08:00:00.000Z',
    }),
    { kind: 'ran', phase: 'spec', at: '2026-10-24T15:30:00.000Z' },
  )
  const ran = Date.parse('2026-10-24T15:30:00.000Z')
  const snapshot = await read({
    '.scratch/old/spec.md': { text: SPEC, mtimeMs: ran - 1000 },
    '.scratch/new/spec.md': { text: SPEC, mtimeMs: ran + 1000 },
  })
  expect(bindSpec(draft, snapshot, new Set())?.ref).toBe('new')
})

test('an issue file in a folder with no spec is a standalone issue, not a ticket', async () => {
  const { issues } = await read({
    '.scratch/triage/issues/01-csv-times-out.md':
      '# 01: CSV export times out\n\nType: bug\nStatus: needs-triage\n',
    ...CSV,
  })
  expect(issues.find(i => i.ref === 'triage/01')).toMatchObject({
    kind: 'issue',
    parent: null,
    role: 'needs-triage',
    isBug: true,
  })
  expect(issues.find(i => i.ref === 'csv-export/01')).toMatchObject({ kind: 'ticket' })
})
