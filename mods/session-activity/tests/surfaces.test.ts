import { expect, test } from 'claude-code/testing'
import { FRESH, mountBand, mountPane, session, stubEngine, SURFACES } from './harness'

const HOOKS = {
  hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/block-secrets.sh' }] }],
  },
}

for (const surface of SURFACES) {
  test(`on ${surface} the band and the pane draw a mix of chips`, async ($, on) => {
    const clock = session(on, HOOKS, new Map(), 'dark', [surface])
    const { opens } = stubEngine(on)
    on('classic.PreToolUse', ($, e, next) =>
      (e as { command?: string }).command === 'cat .env' ? { deny: 'reads a secret' } : next(e),
    )
    for (const skill of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf']) {
      await clock.advance(1000)
      await $.skill.prompt({ skill, text: '', frontmatter: {}, source: 'projectSettings' } as never)
    }
    await $.tool.call({ tool: 'Bash', command: 'cat .env' } as never)
    await $.agent.spawn({
      tool_use_id: 'tu',
      prompt: 'p',
      description: 'pr',
      subagentType: 'Explore',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'opus',
      background: false,
      fork: false,
    } as never)
    await $.turn.complete({
      answer: '',
      durationMs: 1,
      isAborted: true,
      turnId: 't',
      agentId: 'agent-pr',
      reason: 'aborted',
    })
    await clock.advance(FRESH)

    const band = await mountBand($, surface, surface === 'mobile' ? 85 : 70)
    const boxes = (await band.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('box-'))
    expect(boxes.length).toBeGreaterThanOrEqual(2)
    expect(boxes.some(b => b.text.includes('Explore'))).toBe(true)
    const badge = surface === 'terminal' ? 'BLOCKED' : 'Blocked'
    expect(boxes.some(b => b.text.includes(badge))).toBe(true)
    expect(await band.find({ key: 'more' })).toBeDefined()

    const wide = await mountBand($, surface, 100, 40)
    const [agent] = (await wide.findAll({ type: 'Button' })).filter(b =>
      b.key?.startsWith('chip-agent'),
    )
    await wide.press({ key: agent!.key! })
    expect(opens).toEqual([])
    expect(await (await mountBand($, surface, 100, 40)).find({ key: 'card' })).toBeDefined()

    const pane = await mountPane($, surface)
    expect(await pane.find({ key: 'tab-settings' })).toBeDefined()
    await pane.press({ key: 'tab-settings' })
    expect(await pane.find({ key: 'reset' })).toBeDefined()
    await pane.press({ key: 'tab-activity' })
    expect((await pane.findAll({ type: 'Text' })).length).toBeGreaterThan(0)
  })
}
