import { expect, test } from 'claude-code/testing'
import { featureWorld, mountBand, startSession } from './harness'
import { ghAnswer, scenarioFiles } from './wayfinder'

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
