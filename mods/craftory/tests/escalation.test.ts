import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { agentCall, building, call, OVER, SMALL, start, step } from './build-harness'
import { allText, MATT, mountBand, turnComplete, type WorldOptions } from './harness'

const RETRY = 'agent-retry-csv/03'

const openCard = async ($: Engine) => {
  await (await mountBand($, 'terminal', 200, 60)).press({ key: 'phase-build' })
  return mountBand($, 'terminal', 200, 60)
}

const config = (over: Record<string, unknown>) => ({
  '.craftory/config.json': JSON.stringify(over),
})

const recordOf = (w: { files: Map<string, string> }, ticket = 'csv/03') =>
  JSON.parse(w.files.get('.craftory/features/csv.json')!).agents[ticket]

/** csv/03 (old #45) runs once and fails. */
const failed = async (
  on: Parameters<typeof building>[0],
  $: Engine,
  options: WorldOptions = {},
) => {
  const built = await building(on, $, options)
  await start($, 45, 'Date filter')
  await turnComplete($, { agentId: 'agent-tu45', reason: 'error' })
  return built
}

/** Claude answers `/implement csv/03` by starting one implementer for it, as `tu<id>`. */
const respawn = async ($: Engine, id: string) => {
  const called = await call($, agentCall(45, 'Date filter', { tool_use_id: id }))
  expect(called.deny).toBeUndefined()
  return $.agent.spawn({
    tool_use_id: id,
    prompt: 'p',
    description: 'Implement csv/03',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'sonnet',
    background: true,
    fork: false,
  } as never) as Promise<{ agentId?: string }>
}

const IMPLEMENT = `${MATT}:implement`

/** The engine runs a pressed skill command by submitting its line, as it does a typed one. */
const commandPrompt = ($: Engine, args: string) =>
  $.prompt.submit({
    text: `/${IMPLEMENT} ${args}`,
    command: { name: IMPLEMENT, args },
  } as never)

const worktreeAdds = (w: { ran: string[][] }) =>
  w.ran.filter(argv => argv[0] === 'git' && argv[1] === 'worktree' && argv[2] === 'add').length

test("an attempt's record keeps the model its agent ran on", async ($, on) => {
  const { w } = await failed(on, $, { files: config({ phases: { build: { model: 'haiku' } } }) })
  expect(recordOf(w)).toMatchObject({ outcome: 'failed', model: 'haiku' })
})

test('Retry on opus restarts a failed ticket on opus in its kept worktree and branch', async ($, on) => {
  const { w } = await failed(on, $)
  const kept = recordOf(w)
  expect(kept.model).toBe('sonnet')
  const card = await openCard($)
  expect(await allText(card)).toContain('Retry on opus')
  const adds = worktreeAdds(w)
  await card.press({ key: RETRY })
  expect(w.commandsRun.at(-1)).toEqual({ command: IMPLEMENT, args: 'csv/03' })
  await commandPrompt($, 'csv/03')
  expect(w.submitted.at(-1)!.context).toContainEqual(
    expect.stringContaining(
      `Retry on opus for csv/03. Start one implementer for csv/03 again, as before; Craftory runs it on opus in its kept worktree \`${kept.worktree}\` on branch \`${kept.branch}\``,
    ),
  )
  await respawn($, 'tu45b')
  expect(w.spawns.at(-1)).toMatchObject({ tool_use_id: 'tu45b', model: 'opus' })
  expect(String(w.spawns.at(-1)!.cwd)).toMatch(new RegExp(`/${kept.worktree}$`))
  expect(worktreeAdds(w)).toBe(adds)
  expect(recordOf(w)).toMatchObject({
    outcome: 'running',
    model: 'opus',
    worktree: kept.worktree,
    branch: kept.branch,
  })
})

test('the escalation is used once: a later spawn for the ticket is routed as usual', async ($, on) => {
  const { w } = await failed(on, $)
  await (await openCard($)).press({ key: RETRY })
  const { agentId } = await respawn($, 'tu45b')
  await turnComplete($, { agentId, reason: 'error' })
  // it ran on opus, so the card offers no retry on opus again
  const card = await openCard($)
  expect(await allText(card)).toContain('[Failed]')
  expect(await card.find({ key: RETRY })).toBeUndefined()
  await respawn($, 'tu45c')
  expect(w.spawns.at(-1)).toMatchObject({ tool_use_id: 'tu45c' })
  expect(w.spawns.at(-1)).not.toHaveProperty('model')
})

test("an over-budget ticket retries on the escalation model, over Build's routing", async ($, on) => {
  const { w } = await building(on, $, {
    files: config({ phases: { build: { model: 'haiku' } }, routing: { escalateTo: 'sonnet' } }),
    usage: e => (e.agentId === 'agent-tu45' ? OVER : SMALL),
  })
  await start($, 45, 'Date filter')
  await step($, 'agent-tu45', 0)
  await step($, 'agent-tu45', 1)
  await turnComplete($, { agentId: 'agent-tu45' })
  const card = await openCard($)
  const text = await allText(card)
  expect(text).toContain('Over budget')
  expect(text).toContain('Raise budget')
  await card.press({ key: RETRY })
  await respawn($, 'tu45b')
  expect(w.spawns.at(-1)).toMatchObject({ tool_use_id: 'tu45b', model: 'sonnet' })
})

for (const [why, over] of [
  ['escalateTo is session', { routing: { escalateTo: 'session' } }],
  ['the ticket last ran on that model', { phases: { build: { model: 'opus' } } }],
] as const)
  test(`no Retry while ${why}`, async ($, on) => {
    await failed(on, $, { files: config(over) })
    const card = await openCard($)
    expect(await allText(card)).toContain('[Failed]')
    expect(await card.find({ key: RETRY })).toBeUndefined()
  })

/** The engine runs `/implement <args>` as a plugin's `$.command.run` does: the chain's answer. */
const pluginRun = ($: Engine, command: string, args: string) =>
  $.command.run({ command, args, origin: { kind: 'plugin', name: 'craftory' } } as never)

const RETRY_LINE = 'Retry on opus for csv/03. Start one implementer for csv/03 again'

test('a pressed Retry’s /implement carries the retry line on command.run, and prompt.submit does not add it again', async ($, on) => {
  const { w } = await failed(on, $)
  expect((await pluginRun($, IMPLEMENT, 'csv/03')).context).toBeUndefined()
  await (await openCard($)).press({ key: RETRY })
  const ran = await pluginRun($, IMPLEMENT, 'csv/03')
  expect(ran.text).toBe('ran')
  expect(ran.context).toEqual([expect.stringContaining(RETRY_LINE)])
  await commandPrompt($, 'csv/03')
  const context = w.submitted.at(-1)!.context ?? []
  expect(context).not.toContainEqual(expect.stringContaining(RETRY_LINE))
  // the integration line, which only prompt.submit adds, is still there
  expect(context).toContainEqual(expect.stringContaining('integration branch'))
})

for (const [how, spawn] of [
  ['a fork', { fork: true }],
  ['a resumed run', { fork: false, resume: 'agent-tu45' }],
] as const)
  test(`${how} for a retried ticket gets no escalation model`, async ($, on) => {
    const { w } = await failed(on, $)
    await (await openCard($)).press({ key: RETRY })
    const called = await call($, agentCall(45, 'Date filter', { tool_use_id: 'tu45f' }))
    expect(called.deny).toBeUndefined()
    await $.agent.spawn({
      tool_use_id: 'tu45f',
      prompt: 'p',
      description: 'Implement csv/03',
      subagentType: 'general-purpose',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'sonnet',
      background: true,
      ...spawn,
    } as never)
    expect(w.spawns.at(-1)).toMatchObject({ tool_use_id: 'tu45f' })
    expect(w.spawns.at(-1)!.model).toBeUndefined()
  })
