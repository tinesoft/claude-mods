import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { allText, featureJson, featureWorld, mountBand, mountPane, startSession } from './harness'

const config = (archiveOnShip: boolean) => JSON.stringify({ automation: { archiveOnShip } })

const AGENT = {
  ticket: '#44',
  name: 'tdd-44',
  branch: 'craftory/44-x',
  worktree: '.claude/worktrees/44-x',
  tokens: 1,
  budget: 80_000,
  outcome: 'failed',
  startedAt: '2026-10-24T10:00:00.000Z',
}

/** A GitHub Feature whose PR is merged, so its Ship is done. */
const shipped = (
  on: Parameters<typeof featureWorld>[0],
  options: {
    auto?: boolean
    prState?: string
    feature?: Record<string, unknown>
    ask?: (q: string) => string | undefined
  } = {},
) =>
  featureWorld(on, {
    ...(options.ask && { ask: options.ask }),
    files: {
      'docs/agents/issue-tracker.md': '# Issue tracker: GitHub\n',
      '.craftory/config.json': config(options.auto ?? false),
      '.craftory/features/csv.json': featureJson({ spec: '#42', ...options.feature }),
    },
    gh: argv =>
      argv[1] === 'pr'
        ? {
            exitCode: 0,
            stdout: JSON.stringify({
              number: 50,
              url: 'https://github.com/acme/app/pull/50',
              headRefName: 'feat/csv',
              baseRefName: 'main',
              isDraft: false,
              state: options.prState ?? 'MERGED',
            }),
          }
        : { exitCode: 0, stdout: '[]' },
  })

const stored = (w: { writes: { path: string; text: string }[] }) =>
  JSON.parse(w.writes.filter(x => x.path.startsWith('.craftory/features/')).at(-1)!.text)

const mount = async ($: Engine) => {
  const drawing = await mountPane($)
  return {
    unmount: () => drawing.unmount(),
    press: async (key: string) => {
      await drawing.press({ key })
      await drawing.redraw()
    },
    text: async () => {
      await drawing.redraw()
      return allText(drawing)
    },
  }
}

test('a shipped feature is archived from the pane, and leaves it for the Archived list', async ($, on) => {
  const w = shipped(on)
  await startSession($)
  const pane = await mount($)
  expect(await pane.text()).not.toContain('Archived ·')
  await pane.press('archive-feature')
  expect(stored(w).archivedAt).toBeDefined()
  expect(await pane.text()).toContain('Archived · 1')
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('Export invoices')
})

test('unarchive brings it back as the active feature', async ($, on) => {
  const w = shipped(on)
  await startSession($)
  const pane = await mount($)
  await pane.press('archive-feature')
  await pane.press('unarchive-spec:#42')
  expect(stored(w).unarchivedAt).toBeDefined()
  const text = await pane.text()
  expect(text).not.toContain('Archived ·')
  expect(text).toContain('Export invoices as CSV')
})

test('a feature is archived across sessions', async ($, on) => {
  shipped(on)
  await startSession($)
  const first = await mount($)
  await first.press('archive-feature')
  await first.unmount()
  await startSession($)
  expect(await (await mount($)).text()).toContain('Archived · 1')
})

test('an unfinished agent makes archive ask first, and Cancel leaves it as it was', async ($, on) => {
  const questions: string[] = []
  const w = shipped(on, {
    feature: { agents: { '#44': AGENT } },
    ask: q => (questions.push(q), 'Cancel'),
  })
  await startSession($)
  await (await mount($)).press('archive-feature')
  expect(questions[0]).toContain('#44')
  expect(w.writes.filter(x => x.text.includes('archivedAt'))).toEqual([])
})

test('archiving anyway keeps the agent on the record', async ($, on) => {
  const w = shipped(on, { feature: { agents: { '#44': AGENT } }, ask: () => 'Archive' })
  await startSession($)
  await (await mount($)).press('archive-feature')
  expect(stored(w).archivedAt).toBeDefined()
  expect(stored(w).agents['#44'].outcome).toBe('failed')
})

test('with archiveOnShip on, a shipped feature is archived by itself, once', async ($, on) => {
  const w = shipped(on, { auto: true })
  await startSession($)
  expect(stored(w).archivedAt).toBeDefined()
  const pane = await mount($)
  await pane.press('unarchive-spec:#42')
  await pane.unmount()
  await startSession($)
  expect(await (await mount($)).text()).not.toContain('Archived ·')
})

test('with archiveOnShip off, nothing is archived by itself', async ($, on) => {
  const w = shipped(on)
  await startSession($)
  expect(w.writes.filter(x => x.text.includes('archivedAt'))).toEqual([])
})

test('auto-archive waits for a retro that was offered', async ($, on) => {
  const w = shipped(on, { auto: true, feature: { retroOffered: true } })
  await startSession($)
  expect(w.writes.filter(x => x.text.includes('archivedAt'))).toEqual([])
})

for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
  test(`the ${surface} band draws the Archive button, and pressing it archives`, async ($, on) => {
    const w = shipped(on)
    await startSession($, surface)
    const band = await mountBand($, surface, 200)
    expect(await allText(band)).toContain('Archive')
    await band.press({ key: 'archive' })
    expect(stored(w).archivedAt).toBeDefined()
  })
}

test('the band draws no Archive button until Ship is done', async ($, on) => {
  shipped(on, { prState: 'OPEN' })
  await startSession($)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('Archive')
})

test('the mobile pane heads the Flow tab with the Archive button, and the tab has no second one', async ($, on) => {
  const w = shipped(on)
  await startSession($, 'mobile')
  const drawing = await mountPane($, 'mobile')
  expect((await drawing.findAll({ key: 'archive' })).length).toBe(1)
  expect((await drawing.findAll({ key: 'archive-feature' })).length).toBe(0)
  await drawing.press({ key: 'archive' })
  expect(stored(w).archivedAt).toBeDefined()
})
