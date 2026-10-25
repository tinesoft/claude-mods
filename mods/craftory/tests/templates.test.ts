import { expect, test } from 'claude-code/testing'
import { TEMPLATES } from '../src/templates'
import { UPSTREAM_FIXTURES } from './upstream-fixtures'

for (const name of [
  'issue-tracker-github',
  'issue-tracker-gitlab',
  'triage-labels',
  'domain',
] as const) {
  test(`the ${name} template is byte for byte the 1.3.1 file`, () => {
    expect(TEMPLATES[name]).toBe(UPSTREAM_FIXTURES[`${name}.md`])
  })
}

test("Craftory's local tracker doc keeps the upstream H1 so readers still recognise it", () => {
  const upstream = UPSTREAM_FIXTURES['issue-tracker-local.md']!
  expect(TEMPLATES['issue-tracker-local-craftory'].split('\n')[0]).toBe(upstream.split('\n')[0])
})
