import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { start, step, building } from './build-harness'
import {
  featureJson,
  featureWorld,
  mountBand,
  mountPane,
  startSession,
  world,
  type BandSurface,
  type WorldOptions,
} from './harness'
import { TABS } from '../src/pane-view'
import { CLEAR, mix, TOKENS, TRIPLES } from '../src/theme'
import { scenarioFiles } from './wayfinder'

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
type On = Parameters<typeof world>[0]
type Drawing = { drawn: () => Promise<unknown> }

const nodes = (node: unknown): Node[] => {
  if (node === null || typeof node !== 'object') return []
  const n = node as Node
  return [n, ...(n.children ?? []).flatMap(nodes)]
}

const textIn = (node: unknown): string =>
  nodes(node)
    .flatMap(n => (n.children ?? []).filter(c => typeof c === 'string'))
    .join('')

/** Every coloured `Text` inside a `Button`, as `button-key: text`: Desktop drops that colour. */
const colouredInButtons = (tree: unknown) =>
  nodes(tree)
    .filter(n => n.type === 'Button')
    .flatMap(b =>
      nodes(b)
        .filter(n => n.type === 'Text' && n.props?.color !== undefined)
        .map(n => `${String(b.props?.key)}: ${textIn(n)}`),
    )

const GLOSSARY = '# Billing\n\n## Language\n\n**Customer**:\nThe paying account.\n_Avoid_: client\n'

/** The mixed Billing v2 map and a copy named Refunds, so a map switcher draws. */
const twoMaps = () => {
  const mixed = scenarioFiles('local', 'mixed')
  return {
    ...mixed,
    ...Object.fromEntries(
      Object.entries(mixed).map(([path, text]) => [
        path.replace('billing-v2', 'refunds'),
        text.replace('# Billing v2', '# Refunds'),
      ]),
    ),
  }
}

/** One band or pane state: the world it needs, then the drawings to inspect. */
type State = {
  name: string
  /** Keys the drawings must hold, so the state is the one named. */
  shows: string[]
  draw: (on: On, $: Engine, surface: BandSurface, options: WorldOptions) => Promise<Drawing[]>
}

const band = ($: Engine, surface: BandSurface) => mountBand($, surface, 200, 60)

const pressed = async ($: Engine, surface: BandSurface, ...keys: string[]) => {
  for (const key of keys) await (await band($, surface)).press({ key })
  return band($, surface)
}

/** Every pane tab, each Settings section opened. */
const paneTabs = async ($: Engine, surface: BandSurface): Promise<Drawing[]> => {
  const pane = await mountPane($, surface)
  const out: Drawing[] = []
  for (const tab of TABS) {
    await pane.press({ key: `tab-${tab.id}` })
    await pane.redraw()
    out.push(await snap(pane))
  }
  const sections = nodes(await pane.drawn())
    .filter(n => n.type === 'Button' && String(n.props?.key).startsWith('section-'))
    .map(n => String(n.props?.key))
  for (const key of sections) {
    await pane.press({ key })
    await pane.redraw()
    out.push(await snap(pane))
  }
  return out
}

const snap = async (d: Drawing): Promise<Drawing> => {
  const tree = structuredClone(await d.drawn())
  return { drawn: async () => tree }
}

const STATES: State[] = [
  {
    name: 'missing-plugin notice',
    shows: ['notice-install'],
    draw: async (on, $, surface, o) => {
      world(on, o)
      await startSession($, surface)
      return [await band($, surface)]
    },
  },
  {
    name: 'rail',
    shows: ['rail', 'map-chip', 'gear'],
    draw: async (on, $, surface, o) => {
      featureWorld(on, { ...o, files: scenarioFiles('local', 'mixed') })
      await startSession($, surface)
      return [await band($, surface), await mountBand($, surface, 60, 60)]
    },
  },
  {
    name: 'summary',
    shows: ['summary-chip'],
    draw: async (on, $, surface, o) => {
      featureWorld(on, {
        ...o,
        files: scenarioFiles('local', 'mixed'),
        store: { prefs: { ...(o.store?.prefs as object), railLayout: 'summary' } },
      })
      await startSession($, surface)
      return [await band($, surface)]
    },
  },
  {
    name: 'phase cards and the inbox card',
    shows: ['card', 'close'],
    draw: async (on, $, surface, o) => {
      featureWorld(on, o)
      await startSession($, surface)
      const out: Drawing[] = []
      for (const phase of ['align', 'spec', 'tickets', 'build', 'review', 'ship', 'retro'])
        out.push(await snap(await pressed($, surface, `phase-${phase}`)))
      out.push(await snap(await pressed($, surface, 'triage')))
      return out
    },
  },
  {
    name: 'feature picker, a title clipped',
    shows: ['feature-picker', 'title-switch'],
    draw: async (on, $, surface, o) => {
      featureWorld(on, {
        ...o,
        files: {
          '.craftory/features/other.json': featureJson({
            spec: 'other',
            title: 'Another feature with a title too long to fit',
          }),
        },
      })
      await startSession($, surface)
      return [await pressed($, surface, 'title-switch')]
    },
  },
  {
    name: 'frontier card',
    shows: ['map-card', 'frontier', 'map-switch-billing-v2'],
    draw: async (on, $, surface, o) => {
      featureWorld(on, { ...o, files: twoMaps() }).mtimes.set('.scratch/refunds/map.md', 500)
      await startSession($, surface)
      return [await pressed($, surface, 'map-chip')]
    },
  },
  {
    name: 'Build card with agents',
    shows: ['agents', 'agent-csv/01', 'agent-csv/02'],
    draw: async (on, $, surface, o) => {
      await building(on, $, o)
      for (const [n, title] of [
        [43, 'Export button'],
        [44, 'Ledger tax'],
      ] as const) {
        await start($, n, title)
        await step($, `agent-tu${n}`, 0)
      }
      await startSession($, surface)
      return [await pressed($, surface, 'phase-build')]
    },
  },
  {
    name: 'pane tabs',
    shows: [
      'flow',
      'tickets',
      'tickets-switch-billing-v2',
      'decided-toggle',
      'worktrees',
      'glossary',
      'settings',
      'pane-gear',
    ],
    draw: async (on, $, surface, o) => {
      const { w } = await building(on, $, {
        ...o,
        files: { ...twoMaps(), 'GLOSSARY.md': GLOSSARY },
      })
      w.mtimes.set('.scratch/refunds/map.md', 500)
      await start($, 43, 'Export button')
      await startSession($, surface)
      return paneTabs($, surface)
    },
  },
]

const trees = async (drawings: Drawing[]) => Promise.all(drawings.map(d => d.drawn()))

for (const state of STATES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`desktop ${tone}, ${state.name}: no Text inside a Button carries a colour`, async ($, on) => {
      const drawn = await trees(
        await state.draw(on, $, 'desktop', { surfaces: ['desktop'], theme: tone }),
      )
      const keys = new Set(drawn.flatMap(nodes).map(n => n.props?.key))
      expect(state.shows.filter(key => !keys.has(key))).toEqual([])
      expect(drawn.flatMap(colouredInButtons)).toEqual([])
    })
  }
}

for (const state of STATES) {
  test(`desktop, ${state.name}: every Svg names itself, since Desktop hides one with an empty alt`, async ($, on) => {
    const drawn = await trees(await state.draw(on, $, 'desktop', { surfaces: ['desktop'] }))
    const svgs = drawn.flatMap(nodes).filter(n => n.type === 'Svg')
    expect(svgs.filter(n => typeof n.props?.alt !== 'string' || n.props.alt.trim() === '')).toEqual(
      [],
    )
  })
}

/** Every string a tree shows: Text children and Button and Link labels. */
const shown = (tree: unknown) =>
  nodes(tree).flatMap(n => [
    ...(n.children ?? []).filter((c): c is string => typeof c === 'string'),
    ...(typeof n.props?.label === 'string' ? [n.props.label] : []),
  ])

for (const state of STATES) {
  test(`terminal with ASCII on, ${state.name}: no wide or box-drawing mark is drawn`, async ($, on) => {
    const drawn = await trees(
      await state.draw(on, $, 'terminal', { store: { prefs: { ascii: true } } }),
    )
    // prose keeps its middle dot, apostrophe and dash; every mark must be plain ASCII
    const odd = drawn.flatMap(shown).filter(s => /[^\t\n -~·’—]/.test(s))
    expect([...new Set(odd)]).toEqual([])
  })
}

const colours = (tree: unknown) =>
  nodes(tree).flatMap(n =>
    (['color', 'backgroundColor', 'borderColor'] as const)
      .map(k => n.props?.[k])
      .filter((c): c is string => typeof c === 'string'),
  )

for (const state of STATES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`desktop ${tone}, ${state.name}: every colour is a design token`, async ($, on) => {
      const drawn = await trees(
        await state.draw(on, $, 'desktop', { surfaces: ['desktop'], theme: tone }),
      )
      const t = TOKENS[tone]
      const tokens = new Set<string>([
        CLEAR,
        // the count pill: its translucent token laid on the surface
        mix(t.surface, t.countBg.base, t.countBg.alpha),
        ...Object.values(t).filter((v): v is string => typeof v === 'string'),
        ...Object.values(TRIPLES).flatMap(triple => Object.values(triple[tone])),
      ])
      expect([...new Set(drawn.flatMap(colours))].filter(c => !tokens.has(c))).toEqual([])
    })
  }
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/**
 * Every Button whose nearest filled ancestor is the wrong way round for the theme, as
 * `button-key on #fill`. Desktop draws a Button's label in its own colour, light in dark mode and
 * dark in light mode, so a light fill behind one in dark mode hides the label (and the reverse).
 */
const buttonsOnClashingFill = (tree: unknown, tone: 'light' | 'dark') => {
  const out: string[] = []
  const walk = (node: unknown, fill: string | undefined) => {
    if (node === null || typeof node !== 'object') return
    const n = node as Node
    if (n.type === 'Button') {
      if (fill !== undefined && fill !== CLEAR && /^#[0-9A-Fa-f]{6}$/.test(fill)) {
        const light = luminance(fill) > 0.4
        if (light === (tone === 'dark')) out.push(`${String(n.props?.key)} on ${fill}`)
      }
      return
    }
    const own = n.props?.backgroundColor
    for (const child of n.children ?? []) walk(child, typeof own === 'string' ? own : fill)
  }
  walk(tree, undefined)
  return out
}

for (const state of STATES) {
  for (const tone of ['light', 'dark'] as const) {
    test(`desktop ${tone}, ${state.name}: no Button sits on a fill its label cannot be read on`, async ($, on) => {
      const drawn = await trees(
        await state.draw(on, $, 'desktop', { surfaces: ['desktop'], theme: tone }),
      )
      expect(drawn.flatMap(tree => buttonsOnClashingFill(tree, tone))).toEqual([])
    })
  }
}
