import type { Tone } from '../types'

/** The last field of `COLORFGBG` is the background colour index: 0-6 and 8 are dark, 7 and 9-15 light. */
export const parseColorFgBg = (value: string | undefined): Tone | undefined => {
  const last = value?.split(';').at(-1)?.trim()
  if (last === undefined || !/^\d{1,2}$/.test(last)) return undefined
  const index = Number(last)
  if (index > 15) return undefined
  return index <= 6 || index === 8 ? 'dark' : 'light'
}

export type Probe = {
  argv: readonly string[]
  /** The tone the command's result names, or undefined when it says nothing about it. */
  read: (result: { exitCode: number; stdout: string }) => Tone | undefined
}

/** Tried in order; the first to name a tone wins. A binary that is not installed rejects and is skipped. */
export const SYSTEM_PROBES: readonly Probe[] = [
  {
    argv: ['defaults', 'read', '-g', 'AppleInterfaceStyle'],
    read: ({ exitCode, stdout }) => (exitCode === 0 && stdout.trim() === 'Dark' ? 'dark' : 'light'),
  },
  {
    argv: ['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'],
    read: ({ exitCode, stdout }) =>
      exitCode !== 0 ? undefined : stdout.includes('prefer-dark') ? 'dark' : 'light',
  },
  {
    argv: [
      'reg',
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
      '/v',
      'AppsUseLightTheme',
    ],
    read: ({ exitCode, stdout }) =>
      exitCode !== 0
        ? undefined
        : /AppsUseLightTheme\s+REG_DWORD\s+0x0\b/.test(stdout)
          ? 'dark'
          : 'light',
  },
]
