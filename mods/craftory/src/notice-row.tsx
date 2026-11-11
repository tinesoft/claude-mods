import type { Tone } from '../types'
import { noticeSvg, hexOr, type NoticeIcon } from './icons'
import type { Acts } from './action'
import type { NoticeView } from './notices'
import { PLUGIN } from './phases'
import { paint, type Role, SPACE } from './theme'
import type { Ui } from './ui'
import { CardButton } from './widgets'

const NOTICE_GLYPH: Record<Role, string> = {
  hook: '!',
  danger: '!',
  skill: '>',
  perm: '>',
  agent: '>',
  neutral: '>',
  muted: '>',
}

const noticeIcon = (notice: NoticeView): NoticeIcon =>
  notice.isBusy ? 'busy' : notice.role === 'hook' || notice.role === 'danger' ? 'warn' : 'info'

type NoticeArgs = {
  ui: Ui
  tone: Tone | undefined
  notice: NoticeView
  on: Acts
}

const NoticeLabel = ({ ui, notice, color }: { ui: Ui; notice: NoticeView; color: string }) => {
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

export const NoticeRow = ({ ui, tone, notice, on }: NoticeArgs) => {
  const { Box, Text, Svg } = ui
  const colours = paint(notice.role, tone)
  const lead = Svg ? (
    <Svg
      source={noticeSvg(noticeIcon(notice), hexOr(colours.fg))}
      alt={notice.role}
      width={14}
      height={14}
    />
  ) : (
    <Text color={colours.fg}>{NOTICE_GLYPH[notice.role]}</Text>
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
        <NoticeLabel ui={ui} notice={notice} color={colours.fg} />
      </Box>
      {notice.actions.map(button => (
        <CardButton
          key={button.id}
          ui={ui}
          tone={tone}
          id={`notice-${button.id}`}
          label={button.label}
          primary={button.primary === true}
          compact
          onPress={() => on.act(button.action)}
        />
      ))}
    </Box>
  )
}
