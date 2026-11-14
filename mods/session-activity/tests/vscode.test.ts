import { expect, test } from 'claude-code/testing'
import { resolveSettings } from '../src/model'
import { renderBand, type Ui } from '../src/render'
import { SELECTED } from '../src/theme'
import { vscodeButton, vscodeSpaced } from '../src/vscode'
import type { Activation } from '../types'
import { mountPane, session, stubEngine } from './harness'

type Node = { type: string; props: Record<string, unknown>; children: unknown[] }

const flat = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value.flatMap(flat)
    : value === undefined || value === false || value === null
      ? []
      : [value]

const make =
  (type: string) =>
  ({ children, ...props }: Record<string, unknown> & { children?: unknown }): Node => ({
    type,
    props,
    children: flat(children),
  })

/** A rich element table that records what is drawn, as VS Code's has `Svg`. */
const fakeUi = (): Ui =>
  ({ Box: make('Box'), Text: make('Text'), Button: make('Button'), Svg: make('Svg') }) as never

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && 'type' in v && 'children' in v

const findAll = (node: unknown, match: (n: Node) => boolean): Node[] =>
  isNode(node)
    ? [...(match(node) ? [node] : []), ...node.children.flatMap(c => findAll(c, match))]
    : []

const byKey = (node: unknown, key: string) => findAll(node, n => n.props.key === key)[0]

const HEX = /"(color|backgroundColor|borderColor)":"#[0-9A-Fa-f]+"/g

test('a structural `sm` gap becomes one row on VS Code, and a Box wraps only when it asks to', () => {
  expect(vscodeSpaced({ rowGap: 'sm', marginBottom: 'sm' })).toEqual({
    rowGap: 1,
    marginBottom: 1,
    flexWrap: 'nowrap',
  })
  expect(vscodeSpaced({ rowGap: 'xs', paddingY: 'sm' })).toEqual({
    rowGap: 'xs',
    paddingY: 'sm',
    flexWrap: 'nowrap',
  })
  expect(vscodeSpaced({ flexDirection: 'row', flexWrap: 'wrap' })).toMatchObject({ rowGap: 1 })
})

test('on VS Code an accent Button is a dim one in a terracotta outline; a dim one stays plain', () => {
  const ui = fakeUi()
  const Button = vscodeButton(ui.Button, ui.Box)
  const out = Button({ key: 'go', onPress: () => undefined, children: 'Go' } as never)
  const [outline] = findAll(out, n => n.props.borderStyle === 'round')
  expect(outline?.props).toMatchObject({ borderColor: 'claude' })
  expect(byKey(out, 'go')?.props).toMatchObject({ dimColor: true })
  expect((out as unknown as Node).props).toMatchObject({ alignItems: 'flex-start', flexShrink: 0 })
  const dim = Button({ key: 'later', dimColor: true, onPress: () => undefined } as never)
  expect((dim as unknown as Node).type).toBe('Button')
})

const now = 1_000_000

const chip = (over: Partial<Activation>): Activation => ({
  kind: 'skill',
  key: 'alpha',
  label: 'alpha',
  detail: 'Ran the alpha skill.',
  source: '.claude/skills/alpha/SKILL.md',
  status: 'ok',
  count: 2,
  firstAt: now - 60_000,
  lastAt: now - 30_000,
  ...over,
})

const settings = resolveSettings({}, undefined)

const band = (selected: string | null = null) =>
  renderBand({
    ui: fakeUi(),
    surface: 'vscode',
    columns: 100,
    maxRows: 8,
    now,
    tone: undefined,
    chips: [chip({}), chip({ kind: 'hook', key: 'h', label: 'guard', status: 'blocked' })],
    settings,
    selected,
    below: undefined as never,
    on: {
      pick: () => undefined,
      open: () => undefined,
      settings: () => undefined,
      close: () => undefined,
      mute: () => undefined,
      copy: () => undefined,
    },
  })

test('with no tone, a chip draws its type glyph beside its Button, in the type colour, and no Svg', () => {
  const out = band()
  expect(findAll(out, n => n.type === 'Svg')).toEqual([])
  const box = byKey(out, 'box-skill:alpha')
  const glyph = box?.children.find(c => isNode(c) && c.type === 'Text') as Node | undefined
  expect(glyph?.props.color).toBe('suggestion')
  expect(JSON.stringify(out).match(HEX)).toBeNull()
})

test('on VS Code the card stays roomy in a short band and reads `x: Close`', () => {
  const out = band('skill:alpha')
  expect(byKey(out, 'card')?.props).toMatchObject({ paddingY: 'lg', rowGap: 'md' })
  expect(byKey(out, 'close')?.props.label).toBe('x: Close')
})

const HOOKS = {
  hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'bash .claude/hooks/block-secrets.sh' }] }],
  },
}

const vscodePane = async ($: never, on: never) => {
  session(on, HOOKS, new Map(), 'auto', ['vscode'])
  stubEngine(on)
  await ($ as { skill: { prompt: (e: unknown) => Promise<unknown> } }).skill.prompt({
    skill: 'alpha',
    text: '',
    frontmatter: {},
    source: 'projectSettings',
  })
  return mountPane($, 'vscode')
}

test('on VS Code with no Claude theme, the pane draws no hex colours', async ($, on) => {
  const pane = await vscodePane($ as never, on as never)
  expect(JSON.stringify(await pane.drawn()).match(HEX)).toBeNull()
})

test('on VS Code the selected tab carries a marker and the other is a dim Button', async ($, on) => {
  const pane = await vscodePane($ as never, on as never)
  expect((await pane.find({ key: 'tab-activity' }))!.text).toBe(`${SELECTED} Activity`)
  expect((await pane.find({ key: 'tab-settings' }))!.props.dimColor).toBe(true)
})

test('on VS Code the pane buttons are outlined in terracotta', async ($, on) => {
  const pane = await vscodePane($ as never, on as never)
  const outlines = (await pane.findAll({ type: 'Box' })).filter(
    b => b.props.borderColor === 'claude',
  )
  expect(outlines.length).toBeGreaterThan(0)
})
