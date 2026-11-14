export type Node = { type: string; props: Record<string, unknown>; children: unknown[] }

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

/** An element table that records what is drawn. */
export const fakeUi = () =>
  ({ Box: make('Box'), Text: make('Text'), Button: make('Button') }) as never as {
    Box: (props: never) => Node
    Text: (props: never) => Node
    Button: (props: never) => Node
  }

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && 'type' in v && 'children' in v

export const findAll = (node: unknown, test: (n: Node) => boolean): Node[] =>
  isNode(node)
    ? [...(test(node) ? [node] : []), ...node.children.flatMap(c => findAll(c, test))]
    : []

export const byKey = (node: unknown, key: string) => findAll(node, n => n.props.key === key)[0]
