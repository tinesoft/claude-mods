import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { TABS } from '../src/pane-view'
import { TOKENS } from '../src/theme'
import { featureWorld, mountPane, startSession } from './harness'

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

const nodes = (node: unknown): Node[] => {
  if (node === null || typeof node !== 'object') return []
  const n = node as Node
  return [n, ...(n.children ?? []).flatMap(nodes)]
}

const keyed = (tree: unknown, key: string) => nodes(tree).find(n => n.props?.key === key)

const own = (n: Node) => (n.children ?? []).filter(c => typeof c === 'string').join('')

const textIn = (node: unknown) =>
  nodes(node)
    .filter(n => n.type === 'Text' || n.type === 'Button')
    .map(own)
    .join('')

const paneOn = async ($: Engine, surface: 'terminal' | 'desktop', tab: string) => {
  await startSession($, surface)
  const pane = await mountPane($, surface)
  await pane.press({ key: `tab-${tab}` })
  await pane.redraw()
  return keyed(await pane.drawn(), 'tabs')
}

for (const tone of ['light', 'dark'] as const) {
  for (const { id: selected } of TABS) {
    test(`desktop ${tone}: with ${selected} selected, the tab Box carries the state and counts sit outside the Button`, async ($, on) => {
      featureWorld(on, { surfaces: ['desktop'], theme: tone })
      const row = await paneOn($, 'desktop', selected)
      const t = TOKENS[tone]
      expect(row?.props?.backgroundColor).toBe(t.fill)
      for (const { id, title } of TABS) {
        const box = keyed(row, `tab-${id}-box`)
        const button = keyed(box, `tab-${id}`)
        expect(
          nodes(button).filter(n => n.type === 'Text' && n.props?.color !== undefined),
        ).toEqual([])
        expect(textIn(button)).toBe(title)
        if (id === selected)
          expect(box?.props).toMatchObject({
            backgroundColor: t.surface,
            borderStyle: 'round',
            borderColor: t.line,
          })
        else {
          expect(box?.props?.backgroundColor).toBeUndefined()
          expect(box?.props?.borderStyle).toBeUndefined()
        }
      }
      const flowBox = keyed(row, 'tab-flow-box')
      const flowCount = (flowBox?.children as Node[]).find(n => n.type === 'Text')
      expect(own(flowCount ?? {})).toBe('3/7')
      expect(flowCount?.props).toMatchObject({ mono: true, color: t.muted })
    })

    test(`terminal ${tone}: with ${selected} selected, the tab row reads as today, the selected tab bold`, async ($, on) => {
      featureWorld(on, { surfaces: ['terminal'], theme: tone })
      const row = await paneOn($, 'terminal', selected)
      expect(row?.props?.backgroundColor).toBeUndefined()
      for (const { id, title } of TABS) {
        const box = keyed(row, `tab-${id}-box`)
        expect(box?.props?.borderStyle).toBeUndefined()
        const button = keyed(box, `tab-${id}`)
        expect(textIn(button).startsWith(title)).toBe(true)
        const label = nodes(button).find(n => n.type === 'Text' && own(n) === title)
        expect(label?.props?.bold ?? false).toBe(id === selected)
      }
      expect(textIn(keyed(row, 'tab-flow'))).toBe('Flow 3/7')
    })
  }
}
