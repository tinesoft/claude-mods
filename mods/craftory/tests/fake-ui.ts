import type { Ui } from '../src/rail'

export type Node = {
  type: string
  props: Record<string, unknown>
  children: unknown[]
}

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

export const fakeUi = (rich = false): Ui =>
  ({
    Box: make('Box'),
    Text: make('Text'),
    Button: make('Button'),
    Link: make('Link'),
    ...(rich && { Svg: make('Svg') }),
  }) as never

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && 'type' in v && 'children' in v

export const textOf = (node: unknown): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : isNode(node)
      ? node.children.map(textOf).join('')
      : ''

export const findAll = (node: unknown, test: (n: Node) => boolean): Node[] =>
  isNode(node)
    ? [...(test(node) ? [node] : []), ...node.children.flatMap(c => findAll(c, test))]
    : []

export const byKey = (node: unknown, key: string) => findAll(node, n => n.props.key === key)[0]
