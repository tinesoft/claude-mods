import { expect, test } from 'claude-code/testing'
import { TEMPLATES } from '../src/templates'
import { UPSTREAM_FIXTURES } from './upstream-fixtures'

for (const name of [
  'issue-tracker-github',
  'issue-tracker-gitlab',
  'issue-tracker-local',
  'triage-labels',
  'domain',
] as const) {
  test(`the ${name} template is byte for byte the 1.3.1 file`, () => {
    expect(TEMPLATES[name]).toBe(UPSTREAM_FIXTURES[`${name}.md`])
  })
}
