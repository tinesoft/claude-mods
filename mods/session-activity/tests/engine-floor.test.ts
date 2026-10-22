import { expect, test } from 'claude-code/testing'
import { mountBand, session, stubEngine } from './harness'

const olderEngine = (on: Parameters<typeof session>[0]) =>
  session(on, {}, new Map(), 'dark', ['terminal'], '2.1.287')

test('on an engine older than the floor the band is what the engine drew', async ($, on) => {
  olderEngine(on)
  stubEngine(on)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  const band = await mountBand($)
  expect(await band.drawn()).toEqual({ type: 'Box', part: { plugin: 'test' } })
})

test('on an engine older than the floor session start says to update', async ($, on) => {
  olderEngine(on)
  const { toasts } = stubEngine(on)
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal' } as never)
  expect(toasts).toEqual([
    'session-activity needs Claude Code 2.1.299 or later. Run claude update.',
  ])
})

test('on an engine older than the floor /session-activity replies in text', async ($, on) => {
  olderEngine(on)
  const { opened } = stubEngine(on)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  const { text = '' } = await $.command.run({ command: 'session-activity', args: '' } as never)
  expect(opened).toEqual([])
  expect(text).toContain('- ▤ docx')
})

test('on the floor itself the band draws its chips', async ($, on) => {
  session(on, {}, new Map(), 'dark', ['terminal'], '2.1.299')
  stubEngine(on)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  const band = await mountBand($)
  expect(await band.findAll({ type: 'Button' })).not.toEqual([])
})
