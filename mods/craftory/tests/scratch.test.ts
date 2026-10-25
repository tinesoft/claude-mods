import { expect, test } from 'claude-code/testing'
import { parseIssueFile } from '../src/tracker/local'
import { planScratchImport, scratchSummary } from '../src/scratch'
import { DEFAULT_LABELS } from '../src/agents-md'
import { allText, featureWorld, mountPane, startSession } from './harness'

const FILES = {
  '.scratch/csv/spec.md':
    '# Export invoices\n\nStatus: ready-for-agent\n\n## Problem Statement\nx\n\n## User Stories\n1. As a user, I want y\n',
  '.scratch/csv/issues/01-button.md': '# Export button\n\nStatus: ready-for-agent\n\nBody one.\n',
  '.scratch/csv/issues/02-tax.md':
    '# Ledger tax\n\nStatus: ready-for-agent\nBlocked by: 01\n\nBody two.\n',
}

const list = Object.entries(FILES).map(([path, text]) => ({ path, text }))

test('the plan numbers after the highest existing issue, maps blockers and keeps the original text', () => {
  const plan = planScratchImport({ files: list, taken: [42, 45], folder: 'docs/issues/' })
  expect(plan.items.map(i => [i.from, i.to])).toEqual([
    ['.scratch/csv/spec.md', 'docs/issues/46-csv.md'],
    ['.scratch/csv/issues/01-button.md', 'docs/issues/47-button.md'],
    ['.scratch/csv/issues/02-tax.md', 'docs/issues/48-tax.md'],
  ])
  const tax = plan.writes[2]!
  expect(tax.before).toBeNull()
  expect(tax.after).toBe(
    '---\ntype: ticket\nparent: 46\nstatus: ready-for-agent\nblocked-by: [47]\n---\n' +
      FILES['.scratch/csv/issues/02-tax.md'],
  )
  expect(scratchSummary(plan)).toBe('3 issues as #46 to #48')
})

test('an imported file reads back as the spec and its tickets', () => {
  const plan = planScratchImport({ files: list, taken: [], folder: 'docs/issues/' })
  const parsed = plan.writes.map(w =>
    parseIssueFile({
      folder: 'docs/issues/',
      name: w.path.split('/').pop()!,
      text: w.after,
      labels: DEFAULT_LABELS,
    }),
  )
  expect(parsed).toMatchObject([
    { ref: '#1', kind: 'spec' },
    { ref: '#2', kind: 'ticket', parent: '#1', blockedBy: [] },
    { ref: '#3', kind: 'ticket', parent: '#1', blockedBy: ['#2'] },
  ])
})

const offer = async (
  on: Parameters<typeof featureWorld>[0],
  $: Parameters<typeof startSession>[0],
  ask?: string,
) => {
  const w = featureWorld(on, { files: FILES, ...(ask && { ask: () => ask }) })
  await startSession($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'section-section-tracker' })
  return { w, pane }
}

test('with a Local tracker and a .scratch folder, Settings offers the import and writes nothing yet', async ($, on) => {
  const { w, pane } = await offer(on, $)
  expect(await allText(pane)).toContain('3 issues in .scratch/ can be copied into docs/issues/')
  expect(w.writes).toEqual([])
})

test('confirming writes the converted files; declining or an unanswerable question writes none', async ($, on) => {
  const declined = await offer(on, $, 'Not now')
  await declined.pane.press({ key: 'scratch-import' })
  expect(declined.w.writes).toEqual([])
})

test('Import writes numbered files and moves nothing', async ($, on) => {
  const { w, pane } = await offer(on, $, 'Import')
  await pane.press({ key: 'scratch-import' })
  expect(w.writes.map(x => x.path)).toEqual([
    'docs/issues/46-csv.md',
    'docs/issues/47-button.md',
    'docs/issues/48-tax.md',
  ])
  expect(w.files.get('.scratch/csv/spec.md')).toBe(FILES['.scratch/csv/spec.md'])
})

test('the offer is counted when the repo is read, not on every Settings render', async ($, on) => {
  const { w, pane } = await offer(on, $)
  w.files.set(
    '.scratch/csv/issues/03-extra.md',
    '# Extra\n\nStatus: ready-for-agent\n\nBody three.\n',
  )
  await pane.press({ key: 'section-section-tracker' })
  expect(await allText(pane)).toContain('3 issues in .scratch/ can be copied')
})
