import { expect, test } from 'claude-code/testing'
import {
  bareIsOurs,
  hasSkill,
  inTestedRange,
  installOutcome,
  parsePluginList,
  pluginLine,
  pluginStatus,
  versionFromSkillPath,
  type CommandRow,
} from '../src/plugin'

const row = (name: string, plugin?: string): CommandRow => ({
  name,
  source: plugin ? 'plugin' : 'user',
  ...(plugin && { plugin }),
})
const matt = [
  row('mattpocock-skills:to-spec', 'mattpocock-skills'),
  row('mattpocock-skills:triage', 'mattpocock-skills'),
]
const entry = (id: string, version: string, enabled = true) => ({
  id,
  version,
  enabled,
  scope: 'user',
})

test('the plugin is missing until one of its commands is listed', () => {
  expect(pluginStatus({ commands: [], listJson: null })).toEqual({ kind: 'missing' })
  expect(pluginStatus({ commands: [row('review', 'other'), row('help')], listJson: null })).toEqual(
    {
      kind: 'missing',
    },
  )
})

test('present with its skills, version from the CLI listing and the range verdict', () => {
  const listJson = JSON.stringify([entry('mattpocock-skills@claude-plugins-official', '1.3.1')])
  expect(pluginStatus({ commands: matt, listJson })).toEqual({
    kind: 'present',
    version: '1.3.1',
    inRange: true,
    hasDuplicates: false,
    skills: ['to-spec', 'triage'],
    shadowed: [],
  })
  const old = JSON.stringify([entry('mattpocock-skills@mattpocock', '1.2.9')])
  expect(pluginStatus({ commands: matt, listJson: old })).toMatchObject({
    version: '1.2.9',
    inRange: false,
  })
})

test('without the CLI the version comes from a skill path, and without either it is unknown', () => {
  const path =
    '/h/.claude/plugins/cache/mattpocock/mattpocock-skills/1.4.0/skills/engineering/to-spec/SKILL.md'
  expect(pluginStatus({ commands: matt, listJson: null, skillPath: path })).toMatchObject({
    version: '1.4.0',
    inRange: false,
  })
  expect(pluginStatus({ commands: matt, listJson: null })).toMatchObject({
    version: null,
    inRange: null,
  })
  expect(versionFromSkillPath('/x/other-plugin/1.3.1/a')).toBeNull()
  expect(versionFromSkillPath(undefined)).toBeNull()
})

test('a skill listed twice, from the plugin and from elsewhere, is flagged', () => {
  const commands = [...matt, row('to-spec')]
  expect(pluginStatus({ commands, listJson: null })).toMatchObject({ hasDuplicates: true })
})

test('the CLI listing: enabled rows win, then the highest version, junk is ignored', () => {
  const rows = [
    entry('mattpocock-skills@claude-plugins-official', '1.3.0', false),
    entry('mattpocock-skills@mattpocock', '1.3.2'),
    entry('mattpocock-skills@claude-plugins-official', '1.3.10'),
    entry('other@x', '9.9.9'),
    { id: 'mattpocock-skills@x', version: 'latest', enabled: true },
    null,
  ]
  expect(parsePluginList(JSON.stringify(rows))).toBe('1.3.10')
  expect(parsePluginList(JSON.stringify([entry('mattpocock-skills@m', '1.2.0', false)]))).toBe(
    '1.2.0',
  )
  for (const bad of [null, '', 'not json', '{}', '[]', '[{"id":1}]'])
    expect(parsePluginList(bad)).toBeNull()
})

test('the tested range is >=1.3.0 <1.4.0', () => {
  for (const ok of ['1.3.0', '1.3.1', '1.3.99']) expect(inTestedRange(ok), ok).toBe(true)
  for (const bad of [
    '1.2.9',
    '1.4.0',
    '1.10.0',
    '2.0.0',
    '1.3.0-beta.1',
    '1.4.0-rc.1',
    'latest',
    '',
  ]) {
    expect(inTestedRange(bad), bad).toBe(false)
  }
})

test('skills and the status line read from the status', () => {
  const status = pluginStatus({ commands: matt, listJson: null })
  expect(hasSkill(status, 'triage')).toBe(true)
  expect(hasSkill(status, 'to-tickets')).toBe(false)
  expect(hasSkill({ kind: 'missing' }, 'triage')).toBe(false)
  expect(
    pluginLine({ ...(status as object), kind: 'present', version: '1.3.1' } as typeof status),
  ).toBe('mattpocock-skills 1.3.1 installed · tested with 1.3.x')
  expect(pluginLine({ kind: 'missing' })).toContain('not installed')
})

test('an install result is ok on exit 0, else the first line of what went wrong', () => {
  expect(installOutcome({ exitCode: 0, stdout: '', stderr: '' })).toEqual({ ok: true })
  expect(installOutcome({ exitCode: 1, stdout: '', stderr: 'network down\nmore' })).toEqual({
    ok: false,
    message: 'network down',
  })
  expect(installOutcome({ exitCode: 2, stdout: 'plugin not found', stderr: '' })).toEqual({
    ok: false,
    message: 'plugin not found',
  })
  expect(installOutcome({ exitCode: 3, stdout: '', stderr: '' })).toEqual({
    ok: false,
    message: 'exit code 3',
  })
})

test("a skill name another source also owns is shadowed, so a bare use of it is not Matt's", () => {
  const commands = [
    row('mattpocock-skills:code-review', 'mattpocock-skills'),
    row('mattpocock-skills:to-spec', 'mattpocock-skills'),
    row('code-review'),
    row('other:to-spec', 'other'),
    row('mattpocock-skills:tdd', 'mattpocock-skills'),
    row('unrelated'),
  ]
  const status = pluginStatus({ commands, listJson: null })
  expect(status).toMatchObject({ shadowed: expect.arrayContaining(['code-review', 'to-spec']) })
  expect(status.kind === 'present' && status.shadowed).toHaveLength(2)
  expect(bareIsOurs(status)('tdd')).toBe(true)
  expect(bareIsOurs(status)('code-review')).toBe(false)
  expect(bareIsOurs({ kind: 'missing' })('tdd')).toBe(false)
})
