import type { ElementTable } from 'claude-code'

/**
 * VS Code draws a mod as a webview page (see `docs/agents/vscode-surface.md`): a Box is a flex
 * `div` sized in cells, a row Box wraps unless it says otherwise, and a Button is filled with the
 * editor's own button colour. These wrap its element table so the chips and the pane read as they
 * do on the terminal and Desktop.
 */

type Box = ElementTable['Box']
type Button = ElementTable['Button']

/** Down, a step of `xs` or `sm` is no row at all in cells; a structural `sm` gap becomes one row. */
const GAPS = ['rowGap', 'marginTop', 'marginBottom'] as const

/** A Box's props fitted to VS Code: whole-row gaps, wrapped rows apart, and no wrap unless asked. */
export const vscodeSpaced = <P extends Record<string, unknown>>(props: P): P => {
  const out: Record<string, unknown> = { ...props }
  if (out.flexWrap === undefined) out.flexWrap = 'nowrap'
  for (const key of GAPS) if (out[key] === 'sm') out[key] = 1
  if (out.flexWrap === 'wrap' && out.flexDirection === 'row' && out.rowGap === undefined)
    out.rowGap = 1
  return out as P
}

export const vscodeBox =
  (Box: Box): Box =>
  props =>
    Box(vscodeSpaced(props))

/**
 * VS Code fills a Button with its theme's button colour, which no prop changes. A dim Button is
 * transparent, so an accent Button is a dim one in a terracotta outline (Claude Code's own
 * `claude` colour); a dim Button stays plain. The outer Box takes any stretch from its row or
 * column, so the outline hugs the button at the top, where VS Code aligns a button of its own.
 */
export const vscodeButton =
  (Button: Button, Box: Box): Button =>
  props =>
    props.dimColor === true
      ? Button(props)
      : Box({
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'flex-start',
          flexShrink: 0,
          children: Box({
            flexDirection: 'row',
            flexWrap: 'nowrap',
            borderStyle: 'round',
            borderColor: 'claude',
            children: Button({ ...props, dimColor: true }),
          }),
        })
