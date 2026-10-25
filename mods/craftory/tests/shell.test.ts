import { expect, test } from 'claude-code/testing'
import {
  allText,
  featureRepo,
  featureWorld,
  IN_RANGE,
  mattCommands,
  MATT_SKILLS,
  mountBand,
  skillPrompt,
  startSession,
  SETUP_FILES,
  submit,
  ticketFile,
  turnComplete,
  world,
} from './harness'

const SPEC_WITH_STORY =
  '---\ntype: spec\ncreated: 2026-10-24\n---\n# Export invoices as CSV\n\n## Problem Statement\n\nx\n\n## User Stories\n\n1. As an accountant, I want a CSV, so that I can import it\n2. As an admin, I want a filter, so that I can narrow it\n'

const bare = (on: Parameters<typeof world>[0], files: Record<string, string> = {}) =>
  world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    files: { ...SETUP_FILES, ...files },
  })

const step = async ($: Parameters<typeof mountBand>[0], phase: string) =>
  (await (await mountBand($, 'terminal', 200)).find({ key: `step-${phase}` }))?.text

test('hooks pass the engine results through', async ($, on) => {
  featureWorld(on)
  await startSession($)
  expect(await skillPrompt($, 'to-tickets')).toEqual({
    text: 'body of mattpocock-skills:to-tickets',
  })
  expect(await turnComplete($)).toEqual({ text: 'ok' })
  expect(await $.tool.call({ tool: 'Bash', command: 'ls' } as never)).toEqual({ result: 'ran' })
  expect(await submit($, 'hello')).toEqual({ text: 'hello' })
})

test('a phase command with no feature in flight starts a draft that is kept for the next session', async ($, on) => {
  const w = bare(on)
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  expect(await step($, 'align')).toMatch(/^[◐◓◑◒] Align$/)
  const drafts = w.store.get('drafts') as Record<string, { entry: string; marks: unknown }>
  expect(Object.values(drafts)).toEqual([
    expect.objectContaining({ entry: 'align', marks: { align: { ranAt: expect.any(String) } } }),
  ])
})

test('a skill that is not a Matt phase leaves the rail alone', async ($, on) => {
  const w = bare(on)
  await startSession($)
  await $.skill.prompt({ skill: 'docx', text: '', frontmatter: {}, source: 'plugin' } as never)
  await skillPrompt($, 'tdd')
  expect(w.store.get('drafts')).toBeUndefined()
  expect(await allText(await mountBand($))).toContain('Start a feature')
})

test('Align is done once Spec has run, and the end of a turn is written to the feature file', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  expect(await step($, 'align')).toBe('✓ Align')
  await skillPrompt($, 'to-tickets')
  await turnComplete($)
  const record = JSON.parse(w.files.get('.craftory/features/42.json') ?? '{}') as {
    marks: Record<string, Record<string, string>>
  }
  expect(record.marks.tickets).toEqual({ ranAt: expect.any(String), endedAt: expect.any(String) })
  expect(w.writes.map(x => x.path)).toContain('.craftory/features/42.json')
})

test('a subagent turn does not end the main skill', async ($, on) => {
  featureWorld(on)
  await startSession($)
  await skillPrompt($, 'to-tickets')
  await turnComplete($, { agentId: 'agent-1' })
  expect((await step($, 'tickets'))?.[0]).toMatch(/[◐◓◑◒]/)
})

test('a write under the issues folder refreshes the tracker once, a moment later', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  expect(await step($, 'tickets')).toBe('✓ Tickets 3')
  w.files.set('docs/issues/46-email.md', ticketFile('Email the CSV', [44]))
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await w.clock.advance(1000)
  expect(await step($, 'tickets')).toBe('✓ Tickets 3')
  await $.tool.call({ tool: 'Write', file_path: 'docs/issues/46-email.md' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'docs/issues/46-email.md' } as never)
  expect(await step($, 'tickets')).toBe('✓ Tickets 3')
  await w.clock.advance(1000)
  expect(await step($, 'tickets')).toBe('✓ Tickets 4')
})

test('GitHub: gh feeds the rail, and a gh call refreshes it', async ($, on) => {
  let children = [43]
  const issue = (n: number, title: string, body: string) => ({
    number: n,
    title,
    body,
    labels: [{ name: 'ready-for-agent' }],
    state: 'OPEN',
    stateReason: null,
    createdAt: '2026-10-24T10:00:00Z',
    url: `https://github.com/acme/app/issues/${n}`,
  })
  const listing = JSON.stringify([
    issue(
      42,
      'Export invoices as CSV',
      '## Problem Statement\n\n## User Stories\n\n1. As a, I want b, so that c\n',
    ),
    issue(43, 'Export button', ''),
    issue(44, 'Ledger tax', 'Blocked by: #43'),
  ])
  const w = world(on, {
    commands: mattCommands(...MATT_SKILLS),
    plugins: IN_RANGE,
    files: {
      ...SETUP_FILES,
      'docs/agents/issue-tracker.md': '# Issue tracker: GitHub\n',
      '.craftory/features/42.json': featureRepo()['.craftory/features/42.json']!,
    },
    gh: argv => {
      if (argv[1] === 'issue') return { exitCode: 0, stdout: listing }
      if (argv[2]?.endsWith('/sub_issues'))
        return { exitCode: 0, stdout: JSON.stringify(children.map(number => ({ number }))) }
      return { exitCode: 0, stdout: '[]' }
    },
  })
  await startSession($)
  expect(w.ran.filter(argv => argv[0] === 'gh').map(argv => argv[1])).toContain('issue')
  expect(await step($, 'tickets')).toBe('✓ Tickets 1')
  children = [43, 44]
  await $.tool.call({ tool: 'Bash', command: 'gh issue create --title x' } as never)
  await w.clock.advance(1000)
  expect(await step($, 'tickets')).toBe('✓ Tickets 2')
})

test('a spec that appears for a draft binds it, writes its record and announces it once', async ($, on) => {
  const w = bare(on, {})
  await startSession($)
  await skillPrompt($, 'grill-with-docs')
  await turnComplete($)
  await skillPrompt($, 'to-spec')
  w.files.set('docs/issues/50-export.md', SPEC_WITH_STORY)
  await turnComplete($)
  expect(w.writes.map(x => x.path)).toContain('.craftory/features/50.json')
  const record = JSON.parse(w.files.get('.craftory/features/50.json') ?? '{}') as {
    spec: string
    marks: Record<string, unknown>
  }
  expect(record.spec).toBe('#50')
  expect(Object.keys(record.marks)).toEqual(['align', 'spec'])
  expect(w.toasts).toEqual(['Spec #50 published · 2 user stories'])
  expect(w.store.get('drafts')).toEqual({})
  const band = await mountBand($, 'terminal', 200)
  expect(await allText(band)).toContain('Spec #50 published · 2 user stories')
  expect(await step($, 'spec')).toBe('✓ Spec #50')
  await w.clock.advance(5000)
  await turnComplete($)
  expect(w.toasts).toHaveLength(1)
})

test('a restart announces nothing that was already there', async ($, on) => {
  const w = bare(on, {
    'docs/issues/50-export.md': SPEC_WITH_STORY,
    '.craftory/features/50.json': JSON.stringify({
      version: 1,
      spec: '#50',
      title: 'Export invoices as CSV',
      entry: 'align',
      integrationBranch: 'feat/csv',
      marks: {},
      agents: {},
    }),
  })
  await startSession($)
  await turnComplete($)
  expect(w.toasts).toEqual([])
  expect(await allText(await mountBand($, 'terminal', 200))).not.toContain('published')
})

test('the status line names the feature and its phase, and clears with none', async ($, on) => {
  const w = featureWorld(on)
  await startSession($)
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Build · /craftory')
  await skillPrompt($, 'to-tickets')
  expect(w.statuses.at(-1)).toBe('Export invoices as CSV · Tickets · /craftory')
})

test('with no feature the status line is empty', async ($, on) => {
  const w = bare(on)
  await startSession($)
  expect(w.statuses.at(-1)).toBeUndefined()
})
