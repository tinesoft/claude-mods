import { expect, test } from 'claude-code/testing'
import { termHref, linkTerms } from '../src/reply'
import { parseGlossary, termsOf } from '../src/glossary'
import { featureWorld, mountPane, mountReply, startSession, texts } from './harness'

const GLOSSARY =
  '## Language\n\n**Ledger line**:\nA priced row on an invoice.\n_Avoid_: line item\n\n**Customer**:\nThe paying account.\n'

const loaded = parseGlossary(GLOSSARY)
const TERMS = loaded.state === 'ok' ? termsOf(loaded.value) : []

test('terms become links on their first mention, outside code and existing links', () => {
  const text =
    'A ledger line is priced. Each Ledger Line has a `customer` and [customer](https://x.test) link.\n\n```\ncustomer\n```\nThe customer pays.'
  const { text: linked, found } = linkTerms(text, TERMS)
  expect(found.map(t => t.name)).toEqual(['Ledger line', 'Customer'])
  expect(linked).toBe(
    `A [ledger line](${termHref(TERMS[0]!)}) is priced. Each Ledger Line has a \`customer\` and [customer](https://x.test) link.\n\n\`\`\`\ncustomer\n\`\`\`\nThe [customer](${termHref(TERMS[1]!)}) pays.`,
  )
})

test('a longer term wins over a shorter one it contains, and links never nest', () => {
  const terms = [
    { name: 'Ledger', definition: 'd', avoid: [] },
    { name: 'Ledger line', definition: 'd', avoid: [] },
  ]
  const { text, found } = linkTerms('Each ledger line.', terms)
  expect(found.map(t => t.name)).toEqual(['Ledger line'])
  expect(text.match(/\]\(/g)).toHaveLength(1)
})

const session = async (
  on: Parameters<typeof featureWorld>[0],
  $: Parameters<typeof startSession>[0],
  surface: 'desktop' | 'mobile' | 'terminal',
  files: Record<string, string> = {},
) => {
  const w = featureWorld(on, { surfaces: [surface], files: { 'GLOSSARY.md': GLOSSARY, ...files } })
  await startSession($, surface)
  return w
}

for (const surface of ['desktop', 'mobile'] as const) {
  test(`${surface}: the reply is Markdown with term links, and a press asks wait-what`, async ($, on) => {
    const w = await session(on, $, surface)
    const reply = await mountReply($, surface, 'Each ledger line is billed to the customer.')
    const md = await reply.find({ type: 'Markdown' })
    expect(md?.props.text).toContain(`[ledger line](${termHref(TERMS[0]!)})`)
    await reply.press({ key: 'reply-text', link: { href: termHref(TERMS[0]!) } })
    expect(w.commandsRun).toContainEqual({
      command: 'mattpocock-skills:wait-what',
      args: 'Ledger line',
    })
  })
}

test('desktop: a term row under the reply carries a hover card with the definition, Avoid, wait-what and Edit term', async ($, on) => {
  const w = await session(on, $, 'desktop')
  const reply = await mountReply($, 'desktop', 'A ledger line is a row.')
  const words = await texts(reply)
  for (const line of [
    'Terms',
    'Ledger line',
    'GLOSSARY.md',
    'A priced row on an invoice.',
    'Avoid: line item',
    '/wait-what',
    'Edit term',
  ])
    expect(words).toContain(line)
  const cards = await reply.findAll({ type: 'Box' })
  expect(cards.some(b => b.props.display === 'none' && b.props.position === 'absolute')).toBe(true)
  await reply.press({ key: 'term-wait-ledger line' })
  expect(w.commandsRun).toContainEqual({
    command: 'mattpocock-skills:wait-what',
    args: 'Ledger line',
  })
})

test('mobile has no hover, so no card, only the chips', async ($, on) => {
  await session(on, $, 'mobile')
  const reply = await mountReply($, 'mobile', 'A ledger line is a row.')
  expect(await texts(reply)).not.toContain('Edit term')
  expect(await reply.find({ key: 'term-ask-ledger line' })).toBeDefined()
})

test('Edit term opens Settings, Glossary on that term', async ($, on) => {
  await session(on, $, 'desktop')
  const reply = await mountReply($, 'desktop', 'A ledger line is a row.')
  const pane = await mountPane($, 'desktop')
  await reply.press({ key: 'term-edit-ledger line' })
  await pane.redraw()
  expect((await pane.find({ key: 'set-gl-name' }))?.props.value).toBe('Ledger line')
})

test('the terminal draws the reply as it is', async ($, on) => {
  await session(on, $, 'terminal')
  const reply = await mountReply($, 'terminal', 'A ledger line is a row.')
  expect(await reply.find({ type: 'Markdown' })).toBeUndefined()
  expect(await reply.find({ key: 'reply' })).toBeUndefined()
})

test('a reply with no glossary term, or with underlining off, is left alone', async ($, on) => {
  await session(on, $, 'desktop')
  const plain = await mountReply($, 'desktop', 'Nothing special here.')
  expect(await plain.find({ key: 'reply' })).toBeUndefined()
})

test('Settings › underline glossary terms off leaves the reply alone', async ($, on) => {
  await session(on, $, 'desktop', {
    '.craftory/config.json': JSON.stringify({ version: 1, automation: { underlineTerms: false } }),
  })
  const reply = await mountReply($, 'desktop', 'A ledger line is a row.')
  expect(await reply.find({ key: 'reply' })).toBeUndefined()
})
