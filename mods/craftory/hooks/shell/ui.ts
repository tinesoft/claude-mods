/**
 * What the person sees and prefers, and the only code that reads or writes those atoms: the
 * system appearance, the personal prefs and how a tone follows from them.
 *
 * An atom is declared here and read or updated only here: the engine's state scan accepts
 * `read` and `update` on an atom of the same file, so other modules call these functions.
 */
import {
  atom,
  type EngineInterface,
  read,
  type RenderSurface,
  type Timer,
  update,
} from 'claude-code'
import { parseColorFgBg, SYSTEM_PROBES } from '../../src/appearance'
import { parsePrefOverrides, resolvePrefs, STORE_PREFS } from '../../src/config'
import type { Ui } from '../../src/rail'
import { resolveTone, type Tone } from '../../src/theme'
import type { PrefOverrides } from '../../types'

const APPEARANCE_MS = 5_000

const APPEARANCE_PROBE_TIMEOUT_MS = 1500

const prefsState = atom({ plugin: 'craftory', key: 'prefs' } as const, null)

const appearanceState = atom({ plugin: 'craftory', key: 'appearance' } as const, {
  system: null,
  colorFgBg: null,
})

let appearanceTimer: Timer | undefined

export /** `Svg` is handed to every surface whose element table has it; the terminal never draws one. */ function uiFor(
  $: EngineInterface,
  event: Parameters<EngineInterface['ui']['resolve']>[0],
): Ui {
  const table = $.ui.resolve(event)
  const { Box, Text, Button, Link } = table
  return {
    Box,
    Text,
    Button,
    Link,
    ...(event.surface !== 'terminal' && 'Svg' in table && { Svg: table.Svg }),
    ...('Input' in table && { Input: table.Input }),
  }
}

async function probeSystem($: EngineInterface): Promise<Tone | null> {
  for (const probe of SYSTEM_PROBES) {
    try {
      const result = await $.process.run(probe.argv, { timeoutMs: APPEARANCE_PROBE_TIMEOUT_MS })
      const tone = probe.read(result)
      if (tone !== undefined) return tone
    } catch {
      // The command is not installed here, or this surface cannot run commands.
    }
  }
  return null
}

async function refreshAppearance($: EngineInterface) {
  const current = {
    system: await probeSystem($),
    colorFgBg: parseColorFgBg(await $.env.get('COLORFGBG')) ?? null,
  }
  const old = await read($, appearanceState)
  if (old.system === current.system && old.colorFgBg === current.colorFgBg) return
  await update($, appearanceState, () => current)
  $.ui.invalidate('ui.render')
}

export /** Reads the system appearance off the render path, now and every five seconds. */ function watchAppearance(
  $: EngineInterface,
) {
  appearanceTimer?.cancel()
  appearanceTimer = $.clock.every(APPEARANCE_MS, () => refreshAppearance($))
  $.clock.after(0, () => refreshAppearance($))
}

export async function toneOf(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
  surface: RenderSurface,
): Promise<Tone | undefined> {
  const theme = (await $.config.list()).find(row => row.key === 'theme')
  const prefs = await resolvedPrefs($, options)
  const { system, colorFgBg } = await read($, appearanceState)
  return resolveTone({
    theme: prefs.theme,
    claudeTheme: theme?.value,
    surface,
    colorFgBg: colorFgBg ?? undefined,
    system: system ?? undefined,
  })
}

export /** The personal prefs this session sees: the mod's options under whatever the person stored. */ async function resolvedPrefs(
  $: EngineInterface,
  options: Readonly<Record<string, unknown>>,
) {
  return resolvePrefs(options, await read($, prefsState))
}

export async function loadPrefs($: EngineInterface) {
  const prefs = parsePrefOverrides(await $.store.get(STORE_PREFS))
  await update($, prefsState, () => prefs)
}

export async function savePrefs($: EngineInterface, patch: PrefOverrides) {
  const merged = { ...(await read($, prefsState)), ...patch }
  await $.store.set(STORE_PREFS, merged)
  await update($, prefsState, () => merged)
}

export async function resetPrefs($: EngineInterface) {
  await $.store.set(STORE_PREFS, {})
  await update($, prefsState, () => ({}))
}
