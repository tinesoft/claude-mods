import type { RenderSurface } from 'claude-code'
import type {
  GlossaryDoc,
  GlossaryMap,
  Loaded,
  SettingsSection,
  Term,
  TermDraft,
  Tone,
} from '../types'
import {
  HELPERS,
  SECTIONS,
  visibleRows,
  type SectionDef,
  type SettingsFacts,
  type SettingsRow,
} from './sections'
import { NO_GLOSSARY_NOTE, unreadableNote } from './glossary'
import { paint, SPACE, TOKENS } from './theme'
import { inkOf, isRich, type Ui } from './ui'
import { CardButton, Entry, Eyebrow, Field, Segments, SwitchRow, type Typed } from './widgets'

export type GlossaryEdit = {
  terms: readonly Term[]
  draft: TermDraft
  path: string
  hasContextMd: boolean
  error: string | null
  /** The glossary map, shown read-only; null in a repo without one. */
  map: GlossaryMap | null
  /** Each context of a multi-context repo with its own terms; empty in a single-context repo. */
  contexts: readonly {
    name: string
    path: string
    state: Loaded<GlossaryDoc>['state']
    terms: readonly Term[]
  }[]
  /** The context a new term goes to (picked, else the default); null in a single-context repo. */
  context: string | null
}

export type SettingsActions = {
  section: (id: SettingsSection) => void
  set: (row: SettingsRow, value: string | boolean) => void
  /** A number typed in a choice row's own-value field. */
  setCustom: (row: SettingsRow & { control: 'choice' }, text: string) => void
  saveSetup: () => void
  reset: () => void
  rerunSetup: () => void
  /** Text typed into a field, for the Save button VS Code draws as craftory's own. */
  typed: Typed
  term: {
    draft: (patch: Partial<TermDraft>) => void
    save: (patch?: Partial<TermDraft>) => void
    cancel: () => void
    edit: (name: string, context?: string) => void
    remove: (name: string, context?: string) => void
    pick: (context: string) => void
    importContext: () => void
    copyPath: (surface: RenderSurface) => void
  }
}

export type SettingsArgs = {
  ui: Ui
  tone: Tone | undefined
  readOnly: boolean
  /** Drawn in the terminal, the only surface that shows `terminalOnly` rows. */
  isTerminal: boolean
  /** ASCII marks where no Svg draws them. */
  ascii: boolean
  facts: SettingsFacts
  section: SettingsSection
  isDraft: boolean
  firstRun: string
  glossary: GlossaryEdit
  note: string | null
  /** Which mattpocock-skills was found, shown at the top of the tab. */
  pluginLine: string
  on: SettingsActions
}

/** What the Settings tab shows, read from the repo and the store; the pane adds how to draw it. */
export type SettingsData = Omit<
  SettingsArgs,
  'ui' | 'tone' | 'readOnly' | 'isTerminal' | 'ascii' | 'pluginLine'
>

const hintOf = (row: SettingsRow, facts: SettingsFacts) =>
  typeof row.hint === 'function' ? row.hint(facts) : row.hint

const RowView = ({
  ui,
  tone,
  row,
  ascii,
  facts,
  readOnly,
  on,
}: Pick<SettingsArgs, 'ui' | 'tone' | 'ascii' | 'facts' | 'readOnly' | 'on'> & {
  row: SettingsRow
}) => {
  const { Box, Text, Input } = ui
  switch (row.control) {
    case 'switch':
      return (
        <Box key={`settings-${row.id}`} flexDirection="column" rowGap={SPACE.rowTextGap}>
          <SwitchRow
            ui={ui}
            tone={tone}
            id={row.id}
            ascii={ascii}
            title={row.label}
            description={
              row.locked?.(facts) === true
                ? `${hintOf(row, facts)} On because Hard gates is on.`
                : hintOf(row, facts)
            }
            isOn={row.read(facts)}
            onChange={
              readOnly || row.locked?.(facts) === true ? undefined : isOn => on.set(row, isOn)
            }
          />
        </Box>
      )
    case 'choice':
      return (
        <Box key={`settings-${row.id}`} flexDirection="column" rowGap={SPACE.rowTextGap}>
          <Text bold {...inkOf(tone, 'ink')}>
            {row.label}
          </Text>
          <Segments
            ui={ui}
            tone={tone}
            id={row.id}
            choices={row.options(facts)}
            current={row.read(facts)}
            onPick={readOnly ? undefined : value => on.set(row, value)}
          />
          {row.custom !== undefined && Input !== undefined && !readOnly && (
            <Entry
              ui={ui}
              tone={tone}
              id={`set-${row.id}-custom`}
              value=""
              placeholder={row.custom.placeholder}
              submitLabel="Set"
              onSubmit={text => on.setCustom(row, text)}
              typed={on.typed}
            />
          )}
          {hintOf(row, facts) !== undefined && (
            <Text wrap="wrap" {...inkOf(tone, 'text2')}>
              {hintOf(row, facts)}
            </Text>
          )}
        </Box>
      )
    case 'text':
      return (
        <Box key={`settings-${row.id}`} flexDirection="column" rowGap={SPACE.rowTextGap}>
          <Field
            ui={ui}
            tone={tone}
            id={row.id}
            label={row.label}
            hint={
              readOnly ? undefined : [hintOf(row, facts), 'Enter saves.'].filter(Boolean).join(' ')
            }
            value={row.read(facts)}
            {...(row.placeholder !== undefined && { placeholder: row.placeholder })}
            {...(row.rows !== undefined && { rows: row.rows })}
            onSubmit={readOnly ? undefined : text => on.set(row, text)}
            typed={on.typed}
          />
        </Box>
      )
    default: {
      const _exhaustive: never = row
      return _exhaustive
    }
  }
}

const GlossaryMapView = ({
  ui,
  tone,
  map,
  path,
}: Pick<SettingsArgs, 'ui' | 'tone'> & { map: GlossaryMap; path: string }) => {
  const { Box, Text } = ui
  return (
    <Box key="settings-glossary-map" flexDirection="column" rowGap={SPACE.paneGap}>
      <Text wrap="wrap" {...inkOf(tone, 'text2')}>
        {`${path} lists each context's glossary. Add, rename or remove contexts with /domain-modeling.`}
      </Text>
      {map.contexts.map(c => (
        <Text key={`map-${c.name}`} wrap="wrap" {...inkOf(tone, 'ink2')}>
          {`${c.name}: ${c.description} (${c.path})`}
        </Text>
      ))}
      {map.relationships.map(r => (
        <Text key={`rel-${r}`} wrap="wrap" {...inkOf(tone, 'text2')}>
          {r.replaceAll('**', '')}
        </Text>
      ))}
      {map.problems.map(p => (
        <Text key={`problem-${p}`} wrap="wrap" color={paint('danger', tone).fg}>
          {p}
        </Text>
      ))}
    </Box>
  )
}

const GlossarySection = ({
  ui,
  tone,
  readOnly,
  glossary,
  on,
}: Pick<SettingsArgs, 'ui' | 'tone' | 'readOnly' | 'glossary' | 'on'>) => {
  const { Box, Text } = ui
  const { draft } = glossary
  const t = tone === undefined ? undefined : TOKENS[tone]
  const multi = glossary.map !== null
  const card = (term: Term, context: string | null) => {
    const suffix = context === null ? term.name : `${context}-${term.name}`
    return (
      <Box
        key={`gl-${suffix}`}
        flexDirection="column"
        rowGap={SPACE.lineGap}
        {...(isRich(ui) &&
          t !== undefined && {
            borderStyle: 'round' as const,
            borderColor:
              draft.editing === term.name && (context === null || draft.context === context)
                ? t.lineStrong
                : t.line,
            backgroundColor: t.surface,
            paddingX: SPACE.agentsPadX,
            paddingY: SPACE.agentsPadY,
          })}
      >
        <Box flexDirection="row" justifyContent="space-between" columnGap={SPACE.rowLabelGap}>
          <Text bold {...inkOf(tone, 'ink')}>
            {term.name}
          </Text>
          {!readOnly && (
            <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
              <CardButton
                padY
                ui={ui}
                tone={tone}
                id={`gl-edit-${suffix}`}
                label="Edit"
                onPress={() => on.term.edit(term.name, context ?? undefined)}
              />
              <CardButton
                padY
                ui={ui}
                tone={tone}
                id={`gl-delete-${suffix}`}
                label="Delete"
                onPress={() => on.term.remove(term.name, context ?? undefined)}
              />
            </Box>
          )}
        </Box>
        <Text wrap="wrap" {...inkOf(tone, 'text2')}>
          {term.definition}
        </Text>
        {term.avoid.length > 0 && (
          <Text wrap="wrap" {...inkOf(tone, 'muted')}>{`Avoid: ${term.avoid.join(', ')}`}</Text>
        )}
      </Box>
    )
  }
  return (
    <Box key="settings-glossary" flexDirection="column" rowGap={SPACE.paneGap}>
      {glossary.map !== null && (
        <GlossaryMapView ui={ui} tone={tone} map={glossary.map} path={glossary.path} />
      )}
      {!multi && glossary.terms.length === 0 && (
        <Text {...inkOf(tone, 'text2')}>{`No terms in ${glossary.path} yet.`}</Text>
      )}
      {multi
        ? glossary.contexts.map(c => (
            <Box key={`gl-context-${c.name}`} flexDirection="column" rowGap={SPACE.paneGap}>
              <Text bold {...inkOf(tone, 'ink')}>
                {c.name}
              </Text>
              {c.state === 'absent' && <Text {...inkOf(tone, 'text2')}>{NO_GLOSSARY_NOTE}</Text>}
              {c.state === 'invalid' && (
                <Text wrap="wrap" color={paint('danger', tone).fg}>
                  {unreadableNote(c.path)}
                </Text>
              )}
              {c.terms.map(term => card(term, c.name))}
            </Box>
          ))
        : glossary.terms.map(term => card(term, null))}
      {!readOnly && (
        <Box key="gl-form" flexDirection="column" rowGap={SPACE.fieldGap}>
          <Eyebrow
            ui={ui}
            tone={tone}
            text={draft.editing === null ? 'New term' : `Editing ${draft.editing}`}
          />
          {glossary.context !== null && (
            <Segments
              ui={ui}
              tone={tone}
              id="context"
              prefix="gl"
              choices={glossary.contexts.map(c => [c.name, c.name] as const)}
              current={glossary.context}
              onPick={draft.editing === null ? context => on.term.pick(context) : undefined}
            />
          )}
          <Field
            ui={ui}
            tone={tone}
            id="gl-name"
            label="Term"
            value={draft.name}
            placeholder="Credit note"
            onInput={name => on.term.draft({ name })}
            onSubmit={name => on.term.save({ name })}
            typed={on.typed}
          />
          <Field
            ui={ui}
            tone={tone}
            id="gl-definition"
            label="Definition"
            value={draft.definition}
            placeholder="What it means in this codebase"
            onInput={definition => on.term.draft({ definition })}
            onSubmit={definition => on.term.save({ definition })}
            typed={on.typed}
          />
          <Field
            ui={ui}
            tone={tone}
            id="gl-avoid"
            label="Avoid saying"
            hint="Comma-separated."
            value={draft.avoid}
            placeholder="refund"
            onInput={avoid => on.term.draft({ avoid })}
            onSubmit={avoid => on.term.save({ avoid })}
            typed={on.typed}
          />
          {glossary.error !== null && (
            <Text wrap="wrap" color={paint('danger', tone).fg}>
              {glossary.error}
            </Text>
          )}
          <Box flexDirection="row" columnGap={SPACE.buttonsGap}>
            <CardButton
              padY
              ui={ui}
              tone={tone}
              id="gl-save"
              label={draft.editing === null ? 'Add term' : 'Save term'}
              onPress={() => on.term.save()}
            />
            {draft.editing !== null && (
              <CardButton
                padY
                ui={ui}
                tone={tone}
                id="gl-cancel"
                label="Cancel"
                onPress={() => on.term.cancel()}
              />
            )}
            {glossary.hasContextMd && (
              <CardButton
                padY
                ui={ui}
                tone={tone}
                id="gl-import"
                label="Import from CONTEXT.md"
                onPress={() => on.term.importContext()}
              />
            )}
            <CardButton
              padY
              ui={ui}
              tone={tone}
              id="gl-copy-path"
              label={`Copy ${glossary.path}`}
              onPress={surface => on.term.copyPath(surface)}
            />
          </Box>
        </Box>
      )}
    </Box>
  )
}

const PipelineHelpers = ({ ui, tone }: Pick<SettingsArgs, 'ui' | 'tone'>) => {
  const { Box, Text } = ui
  return (
    <Box key="helpers" flexDirection="column" rowGap={SPACE.lineGap}>
      <Text bold {...inkOf(tone, 'ink')}>
        Helpers inside each phase
      </Text>
      <Text wrap="wrap" {...inkOf(tone, 'text2')}>
        Model-invoked skills hold reusable discipline. You don’t type them: the agent reaches for
        them while a phase runs. Commands, with a /, start a phase.
      </Text>
      {HELPERS.map(group => (
        <Text key={`helpers-${group.phase}`} wrap="wrap" {...inkOf(tone, 'ink2')}>
          {`${group.phase}: ${group.skills.join(', ')}`}
        </Text>
      ))}
    </Box>
  )
}

const Body = ({
  ui,
  tone,
  def,
  args,
}: Pick<SettingsArgs, 'ui' | 'tone'> & { def: SectionDef; args: SettingsArgs }) => {
  const { Box, Text } = ui
  const { facts, readOnly, on } = args
  const header = (row: SettingsRow) => row.header === true
  return (
    <Box key={`section-${def.id}`} flexDirection="column" rowGap={SPACE.sectionGap}>
      <Text wrap="wrap" {...inkOf(tone, 'text2')}>
        {def.blurb(facts)}
      </Text>
      {def.custom === 'glossary' && (
        <GlossarySection ui={ui} tone={tone} readOnly={readOnly} glossary={args.glossary} on={on} />
      )}
      {visibleRows(def, facts, args.isTerminal)
        .filter(r => !header(r))
        .map(row => (
          <RowView
            key={row.id}
            ui={ui}
            tone={tone}
            row={row}
            ascii={args.ascii}
            facts={facts}
            readOnly={readOnly}
            on={on}
          />
        ))}
      {def.id === 'pipeline' && <PipelineHelpers ui={ui} tone={tone} />}
    </Box>
  )
}

export const SettingsTab = (args: SettingsArgs) => {
  const { ui, tone, readOnly, facts, section, isDraft, firstRun, note, pluginLine, on } = args
  const { Box, Text } = ui
  const def = SECTIONS.find(s => s.id === section) ?? SECTIONS[0]!
  const headerRows = SECTIONS.flatMap(s => visibleRows(s, facts, args.isTerminal)).filter(
    r => r.header === true,
  )
  return (
    <Box key="settings" flexDirection="column" rowGap={SPACE.paneGap}>
      <Text {...inkOf(tone, 'text2')}>{pluginLine}</Text>
      <Text wrap="wrap" {...inkOf(tone, 'text2')}>
        An SDLC framework, built on top of Matt Pocock’s skills, as a mod. Shared values are written
        to docs/agents/*.md, the glossary and .craftory/config.json, so every skill and every
        teammate reads the same ones.
      </Text>
      {readOnly && (
        <Text wrap="wrap" color={paint('hook', tone).fg}>
          Settings are read-only on mobile. Change them on desktop or in the terminal.
        </Text>
      )}
      {headerRows.map(row => (
        <RowView
          key={row.id}
          ui={ui}
          tone={tone}
          row={row}
          ascii={args.ascii}
          facts={facts}
          readOnly={readOnly}
          on={on}
        />
      ))}
      {isDraft && (
        <Box key="first-run" flexDirection="column" rowGap={SPACE.lineGap}>
          <Text bold {...inkOf(tone, 'ink')}>
            Set up Craftory
          </Text>
          <Text wrap="wrap" {...inkOf(tone, 'text2')}>
            {`${firstRun} The values below are pre-filled from this repo. Saving writes docs/agents/, the ## Agent skills block and .gitignore, as /setup-matt-pocock-skills would.`}
          </Text>
          {!readOnly && (
            <CardButton
              padY
              ui={ui}
              tone={tone}
              id="pane-write-setup"
              label="Save setup"
              onPress={() => on.saveSetup()}
            />
          )}
        </Box>
      )}
      <Segments
        ui={ui}
        tone={tone}
        id="section"
        prefix="section"
        choices={SECTIONS.map(s => [s.id, s.title] as const)}
        current={section}
        onPick={value => {
          const next = SECTIONS.find(s => s.id === value)
          if (next) on.section(next.id)
        }}
      />
      <Body ui={ui} tone={tone} def={def} args={args} />
      {!readOnly && (
        <Box
          key="settings-footer"
          flexDirection="row"
          flexWrap="wrap"
          columnGap={SPACE.buttonsGap}
          alignItems="center"
        >
          <CardButton
            padY
            ui={ui}
            tone={tone}
            id="settings-reset"
            label="Reset to defaults"
            onPress={() => on.reset()}
          />
          <CardButton
            padY
            ui={ui}
            tone={tone}
            id="settings-rerun"
            label="Re-run /setup-matt-pocock-skills"
            onPress={() => on.rerunSetup()}
          />
          <Text {...inkOf(tone, 'muted')}>
            {isDraft ? 'Nothing is saved until Save setup' : 'Changes save as you go'}
          </Text>
        </Box>
      )}
      {note !== null && (
        <Text wrap="wrap" {...inkOf(tone, 'text2')}>
          {note}
        </Text>
      )}
    </Box>
  )
}
