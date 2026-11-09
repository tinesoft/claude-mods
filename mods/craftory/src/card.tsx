import type { RenderElement } from 'claude-code'
import type { Tone } from '../types'
import { helperSvg, hexOr } from './icons'
import { CARD_SPACE, type CardDensity, type CardView } from './card-model'
import type { Acts } from './action'
import { AgentsList } from './agents-list'
import { CLOSE, paint, SPACE, TOKENS, TRIPLES } from './theme'
import { Icon, inkOf, isRich, roleInk, withTint, type Ui } from './ui'
import { HookNote } from './widgets'

const CommandChip = ({ ui, tone, text }: { ui: Ui; tone: Tone | undefined; text: string }) => {
  const { Box, Text } = ui
  if (!isRich(ui) || tone === undefined) return <Text bold>{text}</Text>
  const t = TOKENS[tone]
  return (
    <Box key={`cmd-${text}`} paddingX={SPACE.chipPadX} backgroundColor={t.inverseBg}>
      <Text mono color={t.onInk}>
        {text}
      </Text>
    </Box>
  )
}

const HelperChip = ({ ui, tone, text }: { ui: Ui; tone: Tone; text: string }) => {
  const { Box, Text } = ui
  const skill = TRIPLES.skill[tone]
  return (
    <Box
      key={`helper-${text}`}
      flexDirection="row"
      alignItems="center"
      columnGap="xs"
      paddingX="xs"
      paddingY={0}
      borderStyle="round"
      borderColor={skill.bd}
      backgroundColor={skill.bg}
    >
      <Icon ui={ui} svg={helperSvg(hexOr(skill.fg))} alt="" px={11} />
      <Text mono size="footnote" color={skill.fg}>
        {text}
      </Text>
    </Box>
  )
}

/**
 * The phase's helper skills on one line: comma-separated text on the terminal, a row of tinted
 * chips on rich surfaces. The chips sit directly in one row Box so they never stack.
 */
const HelpersLine = ({
  ui,
  tone,
  helpers,
}: {
  ui: Ui
  tone: Tone | undefined
  helpers: readonly string[]
}) => {
  const { Box, Text } = ui
  if (!isRich(ui) || tone === undefined)
    return <Text {...roleInk('skill', tone)}>{helpers.join(', ')}</Text>
  return (
    <Box key="helpers" flexDirection="row" columnGap={SPACE.chipGap} flexWrap="wrap">
      {helpers.map(helper => (
        <HelperChip key={helper} ui={ui} tone={tone} text={helper} />
      ))}
    </Box>
  )
}

const CardRow = ({
  ui,
  tone,
  label,
  children,
}: {
  ui: Ui
  tone: Tone | undefined
  label: string
  children: RenderElement
}) => {
  const { Box, Text } = ui
  return (
    <Box key={`row-${label}`} flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap">
      <Box width={9}>
        <Text {...inkOf(tone, 'muted')}>{label}</Text>
      </Box>
      <Box flexDirection="row" columnGap={SPACE.rowLabelGap} flexWrap="wrap" flexShrink={1}>
        {[children]}
      </Box>
    </Box>
  )
}

export type CardActions = Acts & { closeCard: () => void }

export const DetailCard = ({
  ui,
  tone,
  card,
  density,
  on,
  ascii = false,
}: {
  ui: Ui
  tone: Tone | undefined
  card: CardView
  density: CardDensity
  on: CardActions
  ascii?: boolean
}) => {
  const { Box, Button, Text } = ui
  const space = CARD_SPACE[density]
  const rich = isRich(ui) && tone !== undefined
  const surface = rich ? TOKENS[tone].surface : undefined
  const colours = paint(card.role, tone)
  const t = tone === undefined ? undefined : TOKENS[tone]
  return (
    <Box
      key="card"
      flexDirection="column"
      borderStyle="round"
      borderColor={t === undefined ? colours.fg : t.line}
      paddingX={space.padX}
      paddingY={space.padY}
      rowGap={space.gap}
      {...withTint(surface)}
    >
      <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.cardHeadGap}>
        <Box flexDirection="column" rowGap={SPACE.lineGap} flexShrink={1} minWidth={0}>
          <Text mono size="caption" color={colours.fg} wrap="truncate-end" {...withTint(surface)}>
            {card.kicker}
          </Text>
          <Text
            bold
            size={rich ? 'heading' : 'body'}
            {...inkOf(tone, 'ink')}
            {...withTint(surface)}
          >
            {card.title}
          </Text>
        </Box>
        <Button key="close" plain hotkey="x" label="Close" onPress={() => on.closeCard()}>
          {ascii ? CLOSE.ascii : CLOSE.glyph}
        </Button>
      </Box>
      <Text {...inkOf(tone, 'ink2')} {...withTint(surface)}>
        {card.why}
      </Text>
      <Box flexDirection="column" rowGap={SPACE.lineGap}>
        <CardRow ui={ui} tone={tone} label="Command">
          {card.noCommand !== null ? (
            <Text {...inkOf(tone, 'text2')}>{card.noCommand}</Text>
          ) : (
            <>
              {card.commands.map(c => (
                <CommandChip key={c} ui={ui} tone={tone} text={c} />
              ))}
            </>
          )}
        </CardRow>
        {card.helpers.length > 0 && (
          <CardRow ui={ui} tone={tone} label="Helpers">
            <HelpersLine ui={ui} tone={tone} helpers={card.helpers} />
          </CardRow>
        )}
      </Box>
      {card.artifact !== null && (
        <Box key="artifact" flexDirection="column" paddingX={SPACE.chipPadX} {...withTint(t?.tile)}>
          <Text size="footnote" {...inkOf(tone, 'muted')} {...withTint(t?.tile)}>
            {card.artifactLabel ?? ''}
          </Text>
          <Text bold size="footnote" {...inkOf(tone, 'ink')} {...withTint(t?.tile)}>
            {card.artifact}
          </Text>
        </Box>
      )}
      {card.agents !== null && (
        <AgentsList ui={ui} tone={tone} ascii={ascii} view={card.agents} on={on} />
      )}
      {card.gate !== null && <HookNote ui={ui} tone={tone} id="gate-line" text={card.gate} lock />}
      {(card.primary !== null || card.secondary.length > 0) && (
        <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
          {card.primary !== null && (
            <Button
              key="primary"
              hotkey="r"
              {...(rich && { variant: 'primary' as const })}
              label={`r: ${card.primary.label}`}
              onPress={() => on.act(card.primary!.action)}
            />
          )}
          {card.secondary.map(button => (
            <Button key={button.id} label={button.label} onPress={() => on.act(button.action)} />
          ))}
        </Box>
      )}
    </Box>
  )
}
