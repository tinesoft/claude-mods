import { expect, test } from 'claude-code/testing'
import {
  allText,
  featureJson,
  featureWorld,
  mountBand,
  mountPane,
  skillPrompt,
  submit,
  startSession,
  turnComplete,
  type WorldOptions,
} from './harness'
import { scenarioFiles } from './wayfinder'

const SUGGEST = 'Chart a map instead?'

const config = (wayfinder: Record<string, unknown> = {}) => ({
  '.craftory/config.json': JSON.stringify({
    version: 1,
    entry: { wayfinder: { afterQuestions: 2, ...wayfinder } },
  }),
})

type Engine = Parameters<typeof skillPrompt>[0]

/** A grill asks a question each turn and waits; the answer lets the next turn count. */
const ask = async ($: Engine) => {
  await submit($, 'my answer')
  await turnComplete($)
}

const grill = async ($: Engine, questions: number) => {
  await skillPrompt($, 'grill-with-docs')
  await turnComplete($)
  for (let i = 1; i < questions; i++) await ask($)
}

const bandText = async ($: Engine) => allText(await mountBand($, 'terminal', 200))

const session = async (on: Parameters<typeof featureWorld>[0], options: WorldOptions = {}) => {
  const w = featureWorld(on, { ...options, files: { ...config(), ...options.files } })
  return w
}

test('the notice appears when the counted questions first reach the threshold, not before', async ($, on) => {
  await session(on)
  await startSession($)
  await grill($, 1)
  expect(await bandText($)).not.toContain(SUGGEST)
  await ask($)
  expect(await bandText($)).toContain(`${SUGGEST} · /wayfinder`)
})

test('the threshold is the configured count, 12 by default', async ($, on) => {
  featureWorld(on)
  await startSession($)
  await grill($, 11)
  expect(await bandText($)).not.toContain(SUGGEST)
  await ask($)
  expect(await bandText($)).toContain(SUGGEST)
})

test('it fires once per grill: clearing it and asking more questions does not bring it back', async ($, on) => {
  const w = await session(on)
  await startSession($)
  await grill($, 2)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-wayfinder' })
  expect(w.commandsRun.at(-1)).toEqual({ command: 'mattpocock-skills:wayfinder', args: '' })
  expect(await bandText($)).not.toContain(SUGGEST)
  await ask($)
  await ask($)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('lowering the threshold mid-grill still fires once the count has crossed it', async ($, on) => {
  const w = await session(on, { files: config({ afterQuestions: 6 }) })
  await startSession($)
  await grill($, 3)
  expect(await bandText($)).not.toContain(SUGGEST)
  w.files.set('.craftory/config.json', config({ afterQuestions: 2 })['.craftory/config.json'])
  await ask($)
  await w.clock.advance(1000)
  await ask($)
  expect(await bandText($)).toContain(SUGGEST)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-wayfinder' })
  await ask($)
  await ask($)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('a new grill counts from zero and can suggest again', async ($, on) => {
  await session(on)
  await startSession($)
  await grill($, 2)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-wayfinder' })
  await grill($, 1)
  expect(await bandText($)).not.toContain(SUGGEST)
  await ask($)
  expect(await bandText($)).toContain(SUGGEST)
})

test('running /wayfinder by hand clears the notice', async ($, on) => {
  await session(on)
  await startSession($)
  await grill($, 2)
  await skillPrompt($, 'wayfinder')
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('Dismiss silences the suggestion for that Feature, stored on the Feature', async ($, on) => {
  const w = await session(on)
  await startSession($)
  await grill($, 2)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-suggest-wayfinder' })
  expect(await bandText($)).not.toContain(SUGGEST)
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).wayfinderSuggestDismissed).toBe(
    true,
  )
  await grill($, 3)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('a Feature with a map link gets no notice', async ($, on) => {
  await session(on, {
    files: {
      ...scenarioFiles('local', 'mixed'),
      '.craftory/features/csv.json': featureJson({ map: 'billing-v2' }),
    },
  })
  await startSession($)
  await grill($, 3)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('with no link but an open map the action reads Attach to the map and submits the map', async ($, on) => {
  const w = await session(on, { files: scenarioFiles('local', 'mixed') })
  await startSession($)
  await grill($, 2)
  const band = await mountBand($, 'terminal', 200)
  expect((await band.find({ key: 'notice-wayfinder' }))!.text).toContain('Attach to Billing v2')
  await band.press({ key: 'notice-wayfinder' })
  expect(w.commandsRun.at(-1)).toEqual({
    command: 'mattpocock-skills:wayfinder',
    args: '.scratch/billing-v2/map.md',
  })
})

test('suggest off in the config disables it', async ($, on) => {
  await session(on, { files: config({ suggest: 'off' }) })
  await startSession($)
  await grill($, 4)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('Settings turns it off for good, and the choice is written to the config', async ($, on) => {
  const w = await session(on)
  await startSession($)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'section-section-entry' })
  await pane.press({ key: 'set-wayfinder-suggest-off' })
  expect(JSON.parse(w.files.get('.craftory/config.json')!).entry.wayfinder.suggest).toBe('off')
  await grill($, 4)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('a notice is a band thing: the mobile pane does not carry it', async ($, on) => {
  await session(on, { surfaces: ['mobile'] })
  await startSession($, 'mobile')
  await grill($, 3)
  const pane = await mountPane($, 'mobile')
  expect(await allText(pane)).not.toContain(SUGGEST)
})

test('with a terminal beside a mobile pane the band shows it and the mobile pane still does not', async ($, on) => {
  await session(on, { surfaces: ['mobile', 'terminal'] })
  await startSession($, 'mobile')
  await grill($, 2)
  expect(await bandText($)).toContain(SUGGEST)
  expect(await allText(await mountPane($, 'mobile'))).not.toContain(SUGGEST)
})

const draftStore = (over: Record<string, unknown> = {}) => ({
  drafts: {
    d1: {
      title: 'New feature',
      entry: 'align',
      enteredFrom: null,
      startedAt: '2026-10-01T00:00:00.000Z',
      marks: {},
      ...over,
    },
  },
  lastActive: 'draft:d1',
})

const draftOf = (w: { store: Map<string, unknown> }) =>
  (w.store.get('drafts') as Record<string, Record<string, unknown>>).d1!

test('Attach stores the map link on the Feature, and the notice does not come back', async ($, on) => {
  const w = await session(on, { files: scenarioFiles('local', 'mixed') })
  await startSession($)
  await grill($, 2)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-wayfinder' })
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).map).toBe('billing-v2')
  await grill($, 3)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('Attach keeps a link the Feature already has', async ($, on) => {
  const w = await session(on, {
    files: {
      ...scenarioFiles('local', 'mixed'),
      '.craftory/features/csv.json': featureJson({ map: 'gone' }),
    },
  })
  await startSession($)
  await grill($, 3)
  expect(await bandText($)).not.toContain(SUGGEST)
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).map).toBe('gone')
})

test('Attach on an unpromoted draft stores the link on the draft', async ($, on) => {
  const w = await session(on, { files: scenarioFiles('local', 'mixed'), store: draftStore() })
  await startSession($)
  await grill($, 2)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-wayfinder' })
  expect(draftOf(w).map).toBe('billing-v2')
  expect(w.files.get('.craftory/features/csv.json')).not.toContain('billing-v2')
})

test('Dismiss on an unpromoted draft silences it for that draft only', async ($, on) => {
  const w = await session(on, { store: draftStore() })
  await startSession($)
  await grill($, 2)
  await (await mountBand($, 'terminal', 200)).press({ key: 'notice-dismiss-suggest-wayfinder' })
  expect(draftOf(w).wayfinderSuggestDismissed).toBe(true)
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).wayfinderSuggestDismissed).toBe(
    undefined,
  )
  await grill($, 3)
  expect(await bandText($)).not.toContain(SUGGEST)
})

test('with GitLab unreachable, a Local map is still offered to Attach to', async ($, on) => {
  const w = await session(on, {
    files: {
      ...scenarioFiles('local', 'mixed'),
      'docs/agents/issue-tracker.md': '# Issue tracker: GitLab\n',
    },
    shell: argv => (argv[0] === 'glab' ? { exitCode: 1, stderr: 'not logged in' } : undefined),
  })
  await startSession($)
  await grill($, 2)
  const band = await mountBand($, 'terminal', 200)
  expect((await band.find({ key: 'notice-wayfinder' }))!.text).toContain('Attach to Billing v2')
  await band.press({ key: 'notice-wayfinder' })
  expect(w.commandsRun.at(-1)!.args).toBe('.scratch/billing-v2/map.md')
})
