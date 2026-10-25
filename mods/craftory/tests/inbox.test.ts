import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { allText, featureWorld, mountPane, startSession, texts, type WorldOptions } from './harness'

const issue = (status: string, title: string, labels = '') =>
  `---\nstatus: ${status}\n${labels}---\n# ${title}\n`

const INBOX = {
  'docs/issues/51-csv-times-out.md': issue(
    'needs-triage',
    'CSV export times out',
    'labels: [bug]\n',
  ),
  'docs/issues/52-currency-column.md': issue('ready-for-agent', 'Add a currency column'),
  'docs/issues/53-csv-delimiter.md': issue('ready-for-human', 'Decide the CSV delimiter'),
  'docs/issues/54-null-total.md': issue(
    'ready-for-agent',
    'Total is null for empty runs',
    'labels: [bug]\n',
  ),
}

const tickets = async (
  on: Parameters<typeof featureWorld>[0],
  $: Engine,
  options: WorldOptions = {},
) => {
  const w = featureWorld(on, { ...options, files: { ...INBOX, ...options.files } })
  await startSession($)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-tickets' })
  await pane.redraw()
  return { w, pane }
}

test('the Tickets tab shows the tracker header, the Inbox by triage role and the spec tickets', async ($, on) => {
  const { pane } = await tickets(on, $)
  const words = await texts(pane)
  expect(words).toContain('Local Markdown · docs/issues/')
  expect(words).toContain('Inbox')
  expect(words).toContain('CSV export times out')
  expect(words).toContain('needs-triage · Not triaged yet · bug')
  expect(words).toContain('ready-for-agent · Enters at Align')
  expect(words).toContain('ready-for-agent · Enters at Build · bug')
  expect(words).toContain('ready-for-human · No agent · decision for you')
  expect(words).toContain('[ /triage #51 ]')
  expect(words).toContain('Spec #42 · tickets')
  expect(words).toContain('Blocked by #43')
  expect(words).toContain('[ /implement #43 ]')
  expect(words).toContain('[ /implement-spec #42 · run all in parallel ]')
  expect(await pane.find({ key: 'inbox-start-#53' })).toBeUndefined()
  expect(await pane.find({ key: 'implement-#44' })).toBeUndefined()
})

test('the triage button runs /triage on the issue', async ($, on) => {
  const { w, pane } = await tickets(on, $)
  await pane.press({ key: 'inbox-triage-#51' })
  expect(w.commandsRun).toContainEqual({ command: 'mattpocock-skills:triage', args: '#51' })
})

test('a ready-for-agent bug enters at Build, with the earlier phases skipped for it', async ($, on) => {
  const { w, pane } = await tickets(on, $)
  await pane.press({ key: 'inbox-start-#54' })
  const record = JSON.parse(w.files.get('.craftory/features/54.json')!)
  expect(record).toMatchObject({
    spec: '#54',
    origin: 'issue',
    entry: 'build',
    enteredFrom: '#54',
  })
  expect(Object.keys(record.skips)).toEqual(['align', 'spec', 'tickets'])
  expect(w.commandsRun).toContainEqual({ command: 'mattpocock-skills:implement', args: '#54' })
  await pane.press({ key: 'tab-flow' })
  await pane.redraw()
  const words = await texts(pane)
  expect(words.filter(w => w.startsWith('Skipped · left out for this feature'))).toHaveLength(3)
  expect(words).toContain('/implement')
})

test('a ready-for-agent request that is not a bug enters at Align with a draft that remembers the issue', async ($, on) => {
  const { w, pane } = await tickets(on, $)
  await pane.press({ key: 'inbox-start-#52' })
  expect(w.files.has('.craftory/features/52.json')).toBe(false)
  const drafts = w.store.get('drafts') as Record<string, { enteredFrom: string; title: string }>
  expect(Object.values(drafts)).toEqual([
    expect.objectContaining({ enteredFrom: '#52', title: 'Add a currency column' }),
  ])
  expect(w.commandsRun).toContainEqual({
    command: 'mattpocock-skills:grill-with-docs',
    args: '#52',
  })
})

test('entry.triage.enterAt moves where a ready issue enters', async ($, on) => {
  const config = JSON.stringify({ version: 1, entry: { triage: { enterAt: 'tickets' } } })
  const { w, pane } = await tickets(on, $, { files: { '.craftory/config.json': config } })
  expect(await texts(pane)).toContain('ready-for-agent · Enters at Tickets · bug')
  await pane.press({ key: 'inbox-start-#54' })
  const record = JSON.parse(w.files.get('.craftory/features/54.json')!)
  expect(record).toMatchObject({ entry: 'tickets' })
  expect(Object.keys(record.skips)).toEqual(['align', 'spec'])
  expect(w.commandsRun).toContainEqual({ command: 'mattpocock-skills:to-tickets', args: '#54' })
})

test('with triage off in Settings there is no Inbox', async ($, on) => {
  const config = JSON.stringify({ version: 1, entry: { triage: { enabled: false } } })
  const { pane } = await tickets(on, $, { files: { '.craftory/config.json': config } })
  expect(await texts(pane)).not.toContain('Inbox')
})

test('Open folder copies the issues folder', async ($, on) => {
  const { w, pane } = await tickets(on, $)
  await pane.press({ key: 'open-folder' })
  expect(w.copied).toEqual([expect.objectContaining({ text: 'docs/issues/' })])
})

test('/implement on a ready ticket and run-all go through the gate', async ($, on) => {
  const { w, pane } = await tickets(on, $)
  await pane.press({ key: 'implement-#43' })
  expect(w.commandsRun).toContainEqual({ command: 'mattpocock-skills:implement', args: '#43' })
  await pane.press({ key: 'implement-spec' })
  expect(w.commandsRun).toContainEqual({ command: 'mattpocock-skills:implement-spec', args: '#42' })
})

test('GitLab shows links to the project, not issues', async ($, on) => {
  const { pane } = await tickets(on, $, {
    files: {
      'docs/agents/issue-tracker.md': '# Issue tracker: GitLab\n',
      '.craftory/config.json': JSON.stringify({
        version: 1,
        tracker: { gitlab: { instance: 'gitlab.example.com', project: 'acme/app' } },
      }),
    },
  })
  const links = await pane.findAll({ type: 'Link' })
  expect(links.map(l => l.props.href)).toEqual([
    'https://gitlab.example.com/acme/app/-/issues',
    'https://gitlab.example.com/acme/app/-/issues?label_name[]=needs-triage',
    'https://gitlab.example.com/acme/app/-/merge_requests',
  ])
  const words = await allText(pane)
  expect(words).toContain('GitLab · acme/app')
  expect(words).not.toContain('Inbox')
})

test('Other shows the links in the user paragraph, or the paragraph when it has none', async ($, on) => {
  const withLink = await tickets(on, $, {
    files: {
      'docs/agents/issue-tracker.md':
        '# Issue tracker: Other\n\nWe use Linear: https://linear.app/acme/team/ENG/all, team ENG.\n',
    },
  })
  expect((await withLink.pane.findAll({ type: 'Link' })).map(l => l.props.href)).toEqual([
    'https://linear.app/acme/team/ENG/all',
  ])
})

test('Other with no link shows the paragraph itself', async ($, on) => {
  const { pane } = await tickets(on, $, {
    files: {
      'docs/agents/issue-tracker.md': '# Issue tracker: Other\n\nIssues live in our wiki.\n',
    },
  })
  expect(await texts(pane)).toContain('Issues live in our wiki.')
})
