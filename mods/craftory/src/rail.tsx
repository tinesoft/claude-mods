/**
 * The AbovePrompt band. For now only the notices (the full rail is M3): other mods' row
 * (`below`) always sits in its own row above, then one row per notice. Plain args and callbacks
 * in, a tree out (session-activity's `renderBand` contract).
 */
import type { ElementTable, RenderElement, RenderSurface } from 'claude-code'
import type { Tone } from '../types'
import { hexOr, noticeSvg, type NoticeIcon } from './icons'
import type { NoticeAction, NoticeButton, NoticeView } from './notices'
import { PLUGIN } from './phases'
import { paint, SPACE, TOKENS, type Role } from './theme'

/** `Svg` exists on every surface that draws rich (remote) elements, never on the terminal. */
export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Button'> & {
  Svg?: ElementTable<'desktop'>['Svg']
}

const GLYPH: Record<Role, string> = {
  hook: '!',
  danger: '!',
  skill: '>',
  perm: '>',
  neutral: '>',
  muted: '>',
}

const iconOf = (notice: NoticeView): NoticeIcon =>
  notice.isBusy ? 'busy' : notice.role === 'hook' || notice.role === 'danger' ? 'warn' : 'info'

type RowArgs = {
  ui: Ui
  tone: Tone | undefined
  notice: NoticeView
  on: (action: NoticeAction) => void
}

const Label = ({ ui, notice, color }: { ui: Ui; notice: NoticeView; color: string }) => {
  const { Text } = ui
  const at = notice.text.indexOf(PLUGIN)
  if (at === -1) return <Text color={color}>{notice.text}</Text>
  const rich = ui.Svg !== undefined
  return (
    <Text color={color}>
      {notice.text.slice(0, at)}
      <Text color={color} mono={rich}>
        {PLUGIN}
      </Text>
      {notice.text.slice(at + PLUGIN.length)}
    </Text>
  )
}

const ActionButton = ({
  ui,
  tone,
  button,
  on,
}: Omit<RowArgs, 'notice'> & { button: NoticeButton }) => {
  const { Box, Button, Text } = ui
  const key = `notice-${button.id}`
  if (ui.Svg === undefined || tone === undefined) {
    return (
      <Button key={key} plain onPress={() => on(button.action)}>
        <Text
          bold={button.primary === true}
          {...(tone === undefined ? {} : { color: TOKENS[tone].ink })}
        >
          {button.primary ? `[ ${button.label} ]` : button.label}
        </Text>
      </Button>
    )
  }
  const t = TOKENS[tone]
  return (
    <Box
      key={`${key}-box`}
      paddingX={SPACE.buttonPadX}
      borderStyle="round"
      borderColor={button.primary ? t.inverseBg : t.line}
      backgroundColor={button.primary ? t.inverseBg : t.surface}
    >
      <Button key={key} plain onPress={() => on(button.action)}>
        <Text color={button.primary ? t.onInk : t.ink}>{button.label}</Text>
      </Button>
    </Box>
  )
}

export const NoticeRow = ({ ui, tone, notice, on }: RowArgs) => {
  const { Box, Text, Svg } = ui
  const colours = paint(notice.role, tone)
  const lead = Svg ? (
    <Svg source={noticeSvg(iconOf(notice), hexOr(colours.fg))} alt="" width={14} height={14} />
  ) : (
    <Text color={colours.fg}>{GLYPH[notice.role]}</Text>
  )
  return (
    <Box
      key={`notice-${notice.id}`}
      flexDirection="row"
      alignItems="center"
      columnGap={SPACE.noticeGap}
      paddingX={SPACE.noticePadX}
      borderStyle="round"
      {...(colours.bd !== undefined && { borderColor: colours.bd })}
      {...(colours.bg !== undefined && { backgroundColor: colours.bg })}
    >
      {lead}
      <Box flexGrow={1}>
        <Label ui={ui} notice={notice} color={colours.fg} />
      </Box>
      {notice.actions.map(button => (
        <ActionButton key={button.id} ui={ui} tone={tone} button={button} on={on} />
      ))}
    </Box>
  )
}

export type BandArgs = {
  ui: Ui
  surface: RenderSurface
  tone: Tone | undefined
  below: RenderElement | undefined
  notices: readonly NoticeView[]
  on: { notice: (action: NoticeAction) => void }
}

export function renderBand({ ui, tone, below, notices, on }: BandArgs) {
  const { Box } = ui
  return (
    <Box flexDirection="column">
      {below}
      {notices.map(notice => (
        <NoticeRow key={notice.id} ui={ui} tone={tone} notice={notice} on={on.notice} />
      ))}
    </Box>
  )
}
