import type { ElementTable, RenderSurface } from 'claude-code'
import type { Term, Tone } from '../types'
import { termKey } from './glossary'
import { findWord, skippedRanges, type Match } from './prose'
import type { Ui } from './rail'
import { paint, SPACE, TOKENS } from './theme'
import { inkOf } from './widgets'

/** Markdown draws only http, https and file links; the host never resolves, a press consumes it. */
const HREF = 'https://craftory.invalid/term/'

export const termHref = (term: Term) => `${HREF}${encodeURIComponent(termKey(term.name))}`

export const termOfHref = (href: string, terms: readonly Term[]): Term | undefined => {
  if (!href.startsWith(HREF)) return undefined
  const key = decodeURIComponent(href.slice(HREF.length))
  return terms.find(t => termKey(t.name) === key)
}

export type Linked = {
  text: string
  found: Term[]
}

export function linkTerms(text: string, terms: readonly Term[]): Linked {
  const skipped = skippedRanges(text, { links: true })
  const taken: (Match & { term: Term })[] = []
  const bySize = [...terms].sort((a, b) => b.name.length - a.name.length)
  for (const term of bySize) {
    const hit = findWord(text, term.name, skipped).find(
      m => !taken.some(t => m.start < t.end && m.end > t.start),
    )
    if (hit !== undefined) taken.push({ ...hit, term })
  }
  const ordered = taken.sort((a, b) => a.start - b.start)
  let out = ''
  let at = 0
  for (const { start, end, term } of ordered) {
    out += `${text.slice(at, start)}[${text.slice(start, end)}](${termHref(term)})`
    at = end
  }
  return { text: out + text.slice(at), found: ordered.map(o => o.term) }
}

export const termKeysIn = (text: string, terms: readonly Term[]): string[] =>
  linkTerms(text, terms).found.map(t => termKey(t.name))

export type ReplyUi = Ui & { Markdown: ElementTable['Markdown'] }

export type ReplyActions = {
  ask: (term: Term) => void
  edit: (term: Term) => void
}

const TermCard = ({
  ui,
  tone,
  term,
  path,
  on,
}: Pick<ReplyArgs, 'ui' | 'tone' | 'on'> & { term: Term; path: string }) => {
  const { Box, Button, Text } = ui
  const t = tone === undefined ? undefined : TOKENS[tone]
  const key = termKey(term.name)
  return (
    <Box
      display="none"
      position="absolute"
      top={1}
      left={0}
      minWidth={32}
      flexDirection="column"
      rowGap={SPACE.lineGap}
      paddingX={SPACE.agentsPadX}
      paddingY={SPACE.agentsPadY}
      borderStyle="round"
      {...(t !== undefined && { borderColor: t.line, backgroundColor: t.surface })}
      hover={{ display: 'flex' }}
    >
      <Text mono size="caption" {...inkOf(tone, 'muted')}>
        {path}
      </Text>
      <Text bold {...inkOf(tone, 'ink')}>
        {term.name}
      </Text>
      <Text wrap="wrap" {...inkOf(tone, 'text2')}>
        {term.definition}
      </Text>
      {term.avoid.length > 0 && (
        <Text wrap="wrap" {...inkOf(tone, 'muted')}>{`Avoid: ${term.avoid.join(', ')}`}</Text>
      )}
      <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
        <Button key={`term-wait-${key}`} plain onPress={() => on.ask(term)}>
          <Text mono color={paint('skill', tone).fg}>
            /wait-what
          </Text>
        </Button>
        <Button key={`term-edit-${key}`} plain onPress={() => on.edit(term)}>
          <Text {...inkOf(tone, 'ink2')}>Edit term</Text>
        </Button>
      </Box>
    </Box>
  )
}

export type ReplyArgs = {
  ui: ReplyUi
  tone: Tone | undefined
  surface: RenderSurface
  linked: Linked
  path: string
  on: ReplyActions
}

/**
 * The reply with its terms linked, and a row of the terms under it. The cards are revealed by
 * hover, which mobile has not got, so there the row is plain chips that ask `wait-what`.
 */
export const Reply = ({ ui, tone, surface, linked, path, on }: ReplyArgs) => {
  const { Box, Button, Markdown, Text } = ui
  const skill = paint('skill', tone)
  return (
    <Box key="reply" flexDirection="column" rowGap={SPACE.lineGap}>
      <Markdown
        key="reply-text"
        text={linked.text}
        pressableLinks={linked.found.map(termHref)}
        onLinkPress={link => {
          const term = termOfHref(link.href, linked.found)
          if (term !== undefined) on.ask(term)
        }}
      />
      <Box key="reply-terms" flexDirection="row" flexWrap="wrap" columnGap={SPACE.rowLabelGap}>
        <Text {...inkOf(tone, 'muted')}>Terms</Text>
        {linked.found.map(term => (
          <Box key={`term-${termKey(term.name)}`} position="relative">
            <Button key={`term-ask-${termKey(term.name)}`} plain onPress={() => on.ask(term)}>
              <Text underline color={skill.fg}>
                {term.name}
              </Text>
            </Button>
            {surface !== 'mobile' && (
              <TermCard ui={ui} tone={tone} term={term} path={path} on={on} />
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
