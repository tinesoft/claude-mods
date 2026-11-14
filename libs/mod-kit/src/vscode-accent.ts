import type { ElementTable } from 'claude-code'

/**
 * The Claude Code theme keys VS Code draws in its own accent blue (`--app-accent-color`); there a
 * mod's accent is Claude's terracotta, the `claude` key. Separate from the fitting in
 * `vscode-fit`: a mod that wants its blues left alone leaves this out.
 */
const BLUES: ReadonlySet<unknown> = new Set(['suggestion', 'permission', 'ide'])
const COLOUR_PROPS = ['color', 'backgroundColor', 'borderColor'] as const

/** Props with VS Code's blue theme keys swapped for `claude`. */
export const vscodeAccented = <P extends Record<string, unknown>>(props: P): P => {
  const out: Record<string, unknown> = { ...props }
  for (const key of COLOUR_PROPS) if (BLUES.has(out[key])) out[key] = 'claude'
  return out as P
}

/** A Box with `vscodeAccented` colours. */
export const vscodeAccentBox =
  (Box: ElementTable['Box']): ElementTable['Box'] =>
  props =>
    Box(vscodeAccented(props))

/** A Text with `vscodeAccented` colours. */
export const vscodeText =
  (Text: ElementTable['Text']): ElementTable['Text'] =>
  props =>
    Text(vscodeAccented(props))
