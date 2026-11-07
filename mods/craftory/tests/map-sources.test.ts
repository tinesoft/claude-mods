import { expect, test } from 'claude-code/testing'
import { featureJson, featureWorld, mountBand, startSession } from './harness'
import { ghAnswer, glabAnswer, scenarioFiles } from './wayfinder'

const GITHUB_TRACKER = { 'docs/agents/issue-tracker.md': '# Issue tracker: GitHub\n' }

const kickerAfterOpening = async ($: Parameters<typeof mountBand>[0]) => {
  await (await mountBand($, 'terminal', 200)).press({ key: 'map-chip' })
  return (await (await mountBand($, 'terminal', 200)).find({ key: 'map-card' }))!.text
}

test('a GitHub map lights up the chip and card with the GitHub kicker', async ($, on) => {
  featureWorld(on, { files: GITHUB_TRACKER, gh: ghAnswer('mixed') })
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  expect((await band.find({ key: 'map-chip' }))!.text).toContain('Billing v2 2✓ 4?')
  expect(await kickerAfterOpening($)).toContain('Wayfinder · GitHub · #12')
})

// The GitHub map was updated in 2026 and the Local files are one millisecond old, so GitHub is the
// newest unless the Local map is touched. Each one winning shows both were read.
test('with a remote tracker, a Local map under .scratch is read too, with no prompt', async ($, on) => {
  const asked: string[] = []
  const w = featureWorld(on, {
    files: { ...scenarioFiles('local', 'mixed'), ...GITHUB_TRACKER },
    gh: ghAnswer('mixed'),
    ask: question => void asked.push(question),
  })
  w.mtimes.set('.scratch/billing-v2/map.md', Date.parse('2027-01-01T00:00:00Z'))
  await startSession($)
  expect(await kickerAfterOpening($)).toContain('Wayfinder · Local · .scratch/billing-v2')
  expect(asked).toEqual([])
})

test('with a remote tracker and an older Local map, the GitHub map still leads', async ($, on) => {
  featureWorld(on, {
    files: { ...scenarioFiles('local', 'mixed'), ...GITHUB_TRACKER },
    gh: ghAnswer('mixed'),
  })
  await startSession($)
  expect(await kickerAfterOpening($)).toContain('Wayfinder · GitHub · #12')
})

const GITLAB_TRACKER = { 'docs/agents/issue-tracker.md': '# Issue tracker: GitLab\n' }

/** A `glab` answering a GitLab scenario, or failing outright when there is none. */
const glabShell = (scenario: string | null) => (argv: readonly string[]) =>
  argv[0] !== 'glab'
    ? undefined
    : scenario === null
      ? { exitCode: 1, stdout: '' }
      : glabAnswer(scenario)(argv)

test('a GitLab map lights up the chip and card with the GitLab kicker', async ($, on) => {
  featureWorld(on, { files: GITLAB_TRACKER, shell: glabShell('mixed') })
  await startSession($)
  const band = await mountBand($, 'terminal', 200)
  expect((await band.find({ key: 'map-chip' }))!.text).toContain('Billing v2 2✓ 4?')
  expect(await kickerAfterOpening($)).toContain('Wayfinder · GitLab · #12')
})

test('with GitLab, a Local map under .scratch is read too, with no prompt', async ($, on) => {
  const asked: string[] = []
  const w = featureWorld(on, {
    files: { ...scenarioFiles('local', 'mixed'), ...GITLAB_TRACKER },
    shell: glabShell('mixed'),
    ask: question => void asked.push(question),
  })
  w.mtimes.set('.scratch/billing-v2/map.md', Date.parse('2027-01-01T00:00:00Z'))
  await startSession($)
  expect(await kickerAfterOpening($)).toContain('Wayfinder · Local · .scratch/billing-v2')
  expect(asked).toEqual([])
})

test('with GitLab unreachable, the Local map is still read', async ($, on) => {
  featureWorld(on, {
    files: { ...scenarioFiles('local', 'mixed'), ...GITLAB_TRACKER },
    shell: glabShell(null),
  })
  await startSession($)
  expect(await kickerAfterOpening($)).toContain('Wayfinder · Local · .scratch/billing-v2')
})

// The Feature's `map` link with a Local and a GitHub map side by side. The Local map is touched in
// 2027, so without a link it is the newest and leads.
const linked = (on: Parameters<typeof featureWorld>[0], map: string, reachable = true) => {
  const w = featureWorld(on, {
    files: {
      ...scenarioFiles('local', 'mixed'),
      ...GITHUB_TRACKER,
      '.craftory/features/csv.json': featureJson({ map }),
    },
    gh: reachable ? ghAnswer('mixed') : () => ({ exitCode: 1, stdout: '' }),
  })
  w.mtimes.set('.scratch/billing-v2/map.md', Date.parse('2027-01-01T00:00:00Z'))
  return w
}

const cardAfterOpening = async ($: Parameters<typeof mountBand>[0]) => {
  await (await mountBand($, 'terminal', 200)).press({ key: 'map-chip' })
  return (await (await mountBand($, 'terminal', 200)).find({ key: 'map-card' }))!.text
}

test('a valid map link to the GitHub map wins over a newer Local one', async ($, on) => {
  linked(on, '#12')
  await startSession($)
  const remote = await cardAfterOpening($)
  expect(remote).toContain('Wayfinder · GitHub · #12')
  expect(remote).not.toContain('Map not found')
})

test('a valid map link to the Local map wins over a newer GitHub map', async ($, on) => {
  const w = linked(on, 'billing-v2')
  w.mtimes.set('.scratch/billing-v2/map.md', 1)
  await startSession($)
  const card = await cardAfterOpening($)
  expect(card).toContain('Wayfinder · Local · .scratch/billing-v2')
  expect(card).not.toContain('Map not found')
})

test('an unknown map link, with the remote tracker unreachable, is kept silently and the Local map shows', async ($, on) => {
  const w = linked(on, '#12', false)
  await startSession($)
  const card = await cardAfterOpening($)
  expect(card).toContain('Wayfinder · Local · .scratch/billing-v2')
  expect(card).not.toContain('Map not found')
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).map).toBe('#12')
})

test('a stale map link with both sources read says Map not found, falls back, and is never rewritten', async ($, on) => {
  const w = linked(on, '#99')
  await startSession($)
  const card = await cardAfterOpening($)
  expect(card).toContain('Map not found')
  expect(card).toContain('Wayfinder · Local · .scratch/billing-v2')
  expect(JSON.parse(w.files.get('.craftory/features/csv.json')!).map).toBe('#99')
})
