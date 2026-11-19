import { type Engine, expect, test } from 'claude-code/testing'
import { building, start, step } from './build-harness'
import {
  allText,
  featureWorld,
  mountBand,
  mountPane,
  skillPrompt,
  startSession,
  turnComplete,
} from './harness'

const routing = (
  phases: Record<string, { model?: string; effort?: string }>,
  mainThread?: boolean,
) => ({
  '.craftory/config.json': JSON.stringify({
    phases,
    ...(mainThread !== undefined && { routing: { mainThread } }),
  }),
})

/** A subagent that is no implementer, such as a code-review agent, spawned from the main session. */
const helper = ($: Engine, id: string, extra: Record<string, unknown> = {}) =>
  $.agent.spawn({
    tool_use_id: id,
    prompt: 'Review the diff.',
    description: 'Review the diff',
    subagentType: 'code-reviewer',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: false,
    fork: false,
    ...extra,
  } as never) as Promise<{ agentId?: string }>

const mainStep = async ($: Engine, index: number, model = 'opus') => {
  const stream = $.turn.step({ turnId: 'm', index, model, messageCount: 1 } as never)
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  while (!(await iterator.next()).done) {
    // drained
  }
}

test("an implementer spawns on Build's model", async ($, on) => {
  const { w } = await building(on, $, {
    files: routing({ build: { model: 'haiku' }, review: { model: 'opus' } }),
  })
  await start($, 43, 'Export button')
  expect(w.spawns.at(-1)).toMatchObject({ tool_use_id: 'tu43', model: 'haiku' })
  expect(w.spawns.at(-1)!.cwd).toContain('.claude/worktrees/')
})

test('with every phase on session an implementer spawns on whatever the session picks', async ($, on) => {
  const { w } = await building(on, $)
  await start($, 43, 'Export button')
  expect(w.spawns.at(-1)).not.toHaveProperty('model')
})

test("a code-review agent spawned during Review runs on Review's model", async ($, on) => {
  const w = featureWorld(on, {
    files: routing({ review: { model: 'sonnet' }, build: { model: 'haiku' } }),
  })
  await startSession($)
  await skillPrompt($, 'code-review')
  await helper($, 'cr1')
  expect(w.spawns.at(-1)).toMatchObject({ tool_use_id: 'cr1', model: 'sonnet' })
})

test('a spawn that names its own model is left alone', async ($, on) => {
  const w = featureWorld(on, { files: routing({ review: { model: 'sonnet', effort: 'low' } }) })
  await startSession($)
  await skillPrompt($, 'code-review')
  const { agentId } = await helper($, 'cr2', { model: 'opus' })
  expect(w.spawns.at(-1)).toMatchObject({ tool_use_id: 'cr2', model: 'opus' })
  await step($, agentId!, 0)
  expect(w.steps.at(-1)).not.toHaveProperty('effort')
})

test('a subagent spawned between phases gets no routing', async ($, on) => {
  const w = featureWorld(on, { files: routing({ build: { model: 'haiku', effort: 'low' } }) })
  await startSession($)
  const { agentId } = await helper($, 'x1')
  expect(w.spawns.at(-1)).not.toHaveProperty('model')
  await step($, agentId!, 0)
  expect(w.steps.at(-1)).not.toHaveProperty('effort')
})

test("every step of a routed implementer gets Build's effort, and none a model", async ($, on) => {
  const { w } = await building(on, $, {
    files: routing({ build: { model: 'haiku', effort: 'medium' } }),
  })
  await start($, 43, 'Export button')
  for (const index of [0, 1, 2]) await step($, 'agent-tu43', index)
  const steps = w.steps.filter(s => s.agentId === 'agent-tu43')
  expect(steps).toHaveLength(3)
  // the step helper asks for sonnet: the step goes out on it, never rewritten to haiku
  for (const s of steps) expect(s).toMatchObject({ model: 'sonnet', effort: 'medium' })
})

test("a routed code-review agent's steps get Review's effort; main steps get none", async ($, on) => {
  const w = featureWorld(on, { files: routing({ review: { effort: 'high' } }) })
  await startSession($)
  await skillPrompt($, 'code-review')
  const { agentId } = await helper($, 'cr3')
  expect(w.spawns.at(-1)).not.toHaveProperty('model')
  await step($, agentId!, 0)
  await step($, agentId!, 1)
  await mainStep($, 0)
  expect(w.steps).toEqual([
    { agentId, index: 0, model: 'sonnet', effort: 'high' },
    { agentId, index: 1, model: 'sonnet', effort: 'high' },
    { index: 0, model: 'opus' },
  ])
})

test('an agent keeps the effort it spawned with after the phase moves on', async ($, on) => {
  const w = featureWorld(on, { files: routing({ review: { effort: 'high' } }) })
  await startSession($)
  await skillPrompt($, 'code-review')
  const { agentId } = await helper($, 'cr4')
  await skillPrompt($, 'grill-with-docs')
  await step($, agentId!, 0)
  expect(w.steps.at(-1)).toMatchObject({ agentId, effort: 'high' })
})

const openCard = async ($: Engine, surface: 'terminal' | 'desktop' | 'vscode', phase: string) => {
  await (await mountBand($, surface, 200, 60)).press({ key: `phase-${phase}` })
  return allText(await mountBand($, surface, 200, 60))
}

for (const surface of ['terminal', 'desktop', 'vscode'] as const)
  test(`${surface}: a routed phase card says what its subagents run on`, async ($, on) => {
    featureWorld(on, {
      files: routing({
        build: { model: 'sonnet', effort: 'medium' },
        review: { model: 'claude-opus-4-1-20250805' },
        align: { effort: 'high' },
      }),
    })
    await startSession($, surface)
    expect(await openCard($, surface, 'build')).toContain('Runs on sonnet · medium')
    expect(await openCard($, surface, 'review')).toContain('Runs on claude-opus-4-1-20250805')
    expect(await openCard($, surface, 'align')).toContain('Runs on high effort')
    expect(await openCard($, surface, 'spec')).not.toContain('Runs on')
  })

const mainSteps = (w: { steps: { agentId?: string }[] }) => w.steps.filter(s => !s.agentId)

test('with mainThread on, every main step while a phase runs gets its model and effort', async ($, on) => {
  const w = featureWorld(on, {
    files: routing({ spec: { model: 'opus', effort: 'high' } }, true),
  })
  await startSession($)
  await skillPrompt($, 'to-spec')
  await mainStep($, 0, 'sonnet')
  await mainStep($, 1, 'sonnet')
  expect(mainSteps(w)).toEqual([
    { index: 0, model: 'opus', effort: 'high' },
    { index: 1, model: 'opus', effort: 'high' },
  ])
})

test('with mainThread off, which is the default, main steps are left alone', async ($, on) => {
  const w = featureWorld(on, { files: routing({ spec: { model: 'opus', effort: 'high' } }) })
  await startSession($)
  await skillPrompt($, 'to-spec')
  await mainStep($, 0, 'sonnet')
  expect(mainSteps(w)).toEqual([{ index: 0, model: 'sonnet' }])
})

test('main steps before a phase and after it ends keep the session model', async ($, on) => {
  const w = featureWorld(on, {
    files: routing({ spec: { model: 'opus', effort: 'high' } }, true),
  })
  await startSession($)
  await mainStep($, 0, 'sonnet')
  await skillPrompt($, 'to-spec')
  await mainStep($, 1, 'sonnet')
  await turnComplete($)
  await mainStep($, 2, 'sonnet')
  expect(mainSteps(w)).toEqual([
    { index: 0, model: 'sonnet' },
    { index: 1, model: 'opus', effort: 'high' },
    { index: 2, model: 'sonnet' },
  ])
})

test('a phase on session leaves main steps alone; one with only an effort sets just that', async ($, on) => {
  const w = featureWorld(on, { files: routing({ review: { effort: 'low' } }, true) })
  await startSession($)
  await skillPrompt($, 'to-spec')
  await mainStep($, 0, 'sonnet')
  await turnComplete($)
  await skillPrompt($, 'code-review')
  await mainStep($, 1, 'sonnet')
  expect(mainSteps(w)).toEqual([
    { index: 0, model: 'sonnet' },
    { index: 1, model: 'sonnet', effort: 'low' },
  ])
})

const NOTE = 'Spec runs on opus · high'

test('the band says what the phase runs on while main-session routing applies, and only then', async ($, on) => {
  featureWorld(on, { files: routing({ spec: { model: 'opus', effort: 'high' } }, true) })
  await startSession($)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain(NOTE)
  await skillPrompt($, 'to-spec')
  expect(await allText(await mountBand($, 'terminal', 200))).toContain(NOTE)
  await turnComplete($)
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('runs on')
})

test('with mainThread off the band has no note, though the phase card still says Runs on', async ($, on) => {
  featureWorld(on, { files: routing({ spec: { model: 'opus', effort: 'high' } }) })
  await startSession($)
  await skillPrompt($, 'to-spec')
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain(NOTE)
})

test('where no band is drawn, the pane shows the note', async ($, on) => {
  featureWorld(on, {
    surfaces: ['mobile'],
    files: routing({ spec: { model: 'opus', effort: 'high' } }, true),
  })
  await startSession($, 'mobile')
  await skillPrompt($, 'to-spec')
  expect(await allText(await mountPane($, 'mobile'))).toContain(NOTE)
})
