import { expect, test } from 'claude-code/testing'
import { TOKENS, TRIPLES } from '../src/theme'
import { allText, BAND_SURFACES, mattCommands, mountBand, startSession, world } from './harness'

const INSTALL_ARGV = ['claude', 'plugin', 'install', 'mattpocock-skills@claude-plugins-official']
const IN_RANGE = [
  { id: 'mattpocock-skills@claude-plugins-official', version: '1.3.1', enabled: true },
]
const SETUP_FILES = {
  'docs/agents/issue-tracker.md': '# Issue tracker: GitHub\n',
  'docs/agents/domain.md': '# Domain Docs\n',
  'CLAUDE.md': '# Rules\n',
}

for (const surface of BAND_SURFACES) {
  test(`${surface}: a missing plugin shows what Craftory needs, with Install and Not now`, async ($, on) => {
    world(on, { surfaces: [surface] })
    await startSession($, surface)
    const band = await mountBand($, surface)
    expect(await allText(band)).toContain('Craftory needs mattpocock-skills 1.3.x')
    expect(await band.find({ key: 'notice-install' })).toBeDefined()
    expect(await band.find({ key: 'notice-not-now' })).toBeDefined()
    expect((await band.find({ key: 'notice-install' }))!.text).toContain('Install')
    expect((await band.find({ key: 'notice-not-now' }))!.text).toContain('Not now')
  })
}

test('terminal: the notice is glyph text, with no images', async ($, on) => {
  world(on)
  await startSession($)
  const band = await mountBand($)
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  expect(await allText(band)).toContain('!')
})

for (const tone of ['light', 'dark'] as const) {
  test(`desktop ${tone}: the plugin notice is amber on the design's tokens, with an icon`, async ($, on) => {
    world(on, { surfaces: ['desktop'], theme: tone })
    await startSession($, 'desktop')
    const band = await mountBand($, 'desktop')
    const notice = await band.find({ key: 'notice-plugin' })
    expect(notice?.props).toMatchObject({
      backgroundColor: TRIPLES.hook[tone].bg,
      borderColor: TRIPLES.hook[tone].bd,
    })
    expect((await band.findAll({ type: 'Svg' })).length).toBe(1)
    const install = await band.find({ key: 'notice-install-box' })
    expect(install?.props).toMatchObject({ backgroundColor: TOKENS[tone].inverseBg })
    const label = (await band.findAll({ type: 'Text' })).find(t =>
      t.text.includes('Craftory needs'),
    )
    expect(label?.props.color).toBe(TRIPLES.hook[tone].fg)
  })
}

test("another mod's row stays in its own row above the notice", async ($, on) => {
  world(on)
  await startSession($)
  const drawn = (await (await mountBand($)).drawn()) as {
    children: { type: string; props: { key?: string } }[]
  }
  expect(drawn.children.map(c => c.props?.key)).toEqual([undefined, 'notice-plugin'])
})

test('nothing runs until Install is pressed, then exactly the install argv runs', async ($, on) => {
  const w = world(on)
  await startSession($)
  const band = await mountBand($)
  expect(w.installs()).toEqual([])
  await band.press({ key: 'notice-install' })
  expect(w.installs()).toEqual([INSTALL_ARGV])
})

test('after a successful install the band asks for a reload instead of offering Install again', async ($, on) => {
  world(on)
  await startSession($)
  await (await mountBand($)).press({ key: 'notice-install' })
  const band = await mountBand($)
  expect(await allText(band)).toContain('Installed. Run /reload-plugins to load it.')
  expect(await band.find({ key: 'notice-install' })).toBeUndefined()
})

test('a failed install says why and offers Install again', async ($, on) => {
  const w = world(on, { install: { exitCode: 1, stderr: 'network down' } })
  await startSession($)
  await (await mountBand($)).press({ key: 'notice-install' })
  const band = await mountBand($)
  expect(await allText(band)).toContain('Install failed: network down')
  await band.press({ key: 'notice-install' })
  expect(w.installs()).toEqual([INSTALL_ARGV, INSTALL_ARGV])
})

test('an installed version outside the range offers Update, which runs the update argv', async ($, on) => {
  const w = world(on, {
    commands: mattCommands('to-spec'),
    plugins: [{ id: 'mattpocock-skills@mattpocock', version: '1.2.9', enabled: true }],
  })
  await startSession($)
  const band = await mountBand($)
  expect(await allText(band)).toContain('found 1.2.9')
  expect(await band.find({ key: 'notice-install' })).toBeUndefined()
  await band.press({ key: 'notice-update' })
  expect(w.installs()).toEqual([
    ['claude', 'plugin', 'update', 'mattpocock-skills@claude-plugins-official'],
  ])
})

test('Not now hides the plugin notice for this session only', async ($, on) => {
  const w = world(on)
  await startSession($)
  await (await mountBand($)).press({ key: 'notice-not-now' })
  const band = await mountBand($)
  expect(await allText(band)).not.toContain('Craftory needs')
  expect(w.installs()).toEqual([])
  expect(w.store.has('dismissed')).toBe(false)
})

test('a dismissal left in the store by an older build does not hide the notice', async ($, on) => {
  world(on, { store: { dismissed: ['plugin'] } })
  await startSession($)
  expect(await allText(await mountBand($))).toContain('Craftory needs')
})

test('first run says what was found and opens Settings on Set up Craftory', async ($, on) => {
  const w = world(on, {
    commands: mattCommands('to-spec'),
    plugins: IN_RANGE,
    remote: 'git@github.com:acme/app.git',
    files: { 'CONTEXT.md': '# context\n' },
  })
  await startSession($)
  const band = await mountBand($)
  expect(await allText(band)).toContain(
    'No docs/agents/ yet. Found a GitHub remote and CONTEXT.md.',
  )
  expect(await allText(band)).not.toContain('Craftory needs')
  await band.press({ key: 'notice-setup' })
  expect(w.opens).toEqual([expect.objectContaining({ id: 'craftory' })])
})

test('a repo that is set up but has no feature says how to start one', async ($, on) => {
  world(on, { commands: mattCommands('to-spec'), plugins: IN_RANGE, files: SETUP_FILES })
  await startSession($)
  const band = await mountBand($)
  expect(await allText(band)).toContain('Start a feature: talk it through first.')
  expect((await band.find({ key: 'notice-run' }))!.text).toContain('/grill-with-docs')
})

test('with a feature in flight the band is the rail, and no notice', async ($, on) => {
  const feature = {
    version: 1,
    spec: '#42',
    title: 'Export invoices as CSV',
    entry: 'align',
    integrationBranch: 'feat/csv',
    marks: {},
    agents: {},
  }
  world(on, {
    commands: mattCommands('to-spec'),
    plugins: IN_RANGE,
    files: { ...SETUP_FILES, '.craftory/features/42.json': JSON.stringify(feature) },
  })
  await startSession($)
  const band = await mountBand($)
  expect(await band.find({ key: 'rail' })).toBeDefined()
  expect(await allText(band)).not.toContain('Start a feature')
})

test('the rail pref turns the notices off', async ($, on) => {
  world(on, { store: { prefs: { rail: false } } })
  await startSession($)
  expect(await allText(await mountBand($))).toBe('')
})

test('below the engine floor nothing is drawn and the user is told to update', async ($, on) => {
  const w = world(on, { version: '2.1.298' })
  await startSession($)
  expect(w.toasts).toEqual(['Craftory needs Claude Code 2.1.299 or later. Run claude update.'])
  expect(await allText(await mountBand($))).toBe('')
})

test('a survey on screen keeps the band out of its way', async ($, on) => {
  world(on)
  await startSession($)
  const band = await $.ui.mount({
    plugin: 'craftory',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: true,
      isWorking: false,
      maxRows: 24,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 9 },
      view: {},
    },
  })
  expect(await allText(band)).toBe('')
})
