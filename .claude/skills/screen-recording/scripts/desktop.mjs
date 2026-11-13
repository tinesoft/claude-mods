#!/usr/bin/env node
// Record the Claude Desktop app on macOS and convert the recording to a GIF or MP4.
//
//   desktop.mjs scripted --tour tour.desktop.json --out out.gif [--appearance light|dark] [--maximize]
//   desktop.mjs probe    --tour tour.desktop.json --probe-dir DIR   # one PNG of the window per step
//   desktop.mjs checklist --tour tour.desktop.json                 # the tour as steps for a human
//   desktop.mjs handmade --input movie.mov --out out.gif [--crop window|none] [--trim-start S] [--trim-end S]
//
// Needs macOS, ffmpeg (with ffprobe) and, for scripted and probe, cliclick. See ../references/desktop.md.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const KEYS = {
  Enter: 'return',
  Esc: 'esc',
  Tab: 'tab',
  Space: 'space',
  Backspace: 'delete',
  Up: 'arrow-up',
  Down: 'arrow-down',
  Left: 'arrow-left',
  Right: 'arrow-right',
  PageUp: 'page-up',
  PageDown: 'page-down',
  Home: 'home',
  End: 'end',
}
const TYPE_DELAY_MS = 70

const [mode, ...rest] = process.argv.slice(2)
const { values: opt } = parseArgs({
  args: rest,
  options: {
    tour: { type: 'string' },
    out: { type: 'string' },
    input: { type: 'string' },
    'probe-dir': { type: 'string' },
    app: { type: 'string', default: 'Claude' },
    appearance: { type: 'string' },
    maximize: { type: 'boolean', default: false },
    crop: { type: 'string' },
    'trim-start': { type: 'string' },
    'trim-end': { type: 'string' },
    fps: { type: 'string', default: '12' },
    width: { type: 'string', default: '1440' },
  },
})

const fail = message => {
  console.error(`desktop.mjs: ${message}`)
  process.exit(1)
}
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const has = cmd => {
  try {
    run('/usr/bin/which', [cmd])
    return true
  } catch {
    return false
  }
}
const osascript = (script, lang = 'AppleScript') => run('osascript', ['-l', lang, '-e', script])
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (process.platform !== 'darwin') {
  fail(
    'the Desktop app can only be recorded on macOS. Run this from Claude Code on the Mac host, not the devcontainer.',
  )
}
if (!['scripted', 'probe', 'checklist', 'handmade'].includes(mode)) {
  fail(
    'usage: desktop.mjs scripted|probe|checklist|handmade [options]; see the header of this file',
  )
}
const needs = [
  'ffmpeg',
  'ffprobe',
  ...(mode === 'scripted' || mode === 'probe' ? ['cliclick'] : []),
]
const missing = needs.filter(cmd => !has(cmd))
if (missing.length > 0 && mode !== 'checklist')
  fail(`missing ${missing.join(', ')}: brew install ffmpeg cliclick`)

const tour = opt.tour ? JSON.parse(readFileSync(opt.tour, 'utf8')) : { steps: [] }

/** The main display's visible frame in points: { x, y, w, h } (y from the top, below the menu bar). */
function visibleFrame() {
  const json = osascript(
    `ObjC.import('AppKit'); const s = $.NSScreen.mainScreen; const f = s.frame, v = s.visibleFrame;
     JSON.stringify({ x: v.origin.x, y: f.size.height - v.origin.y - v.size.height, w: v.size.width, h: v.size.height, screenW: f.size.width })`,
    'JavaScript',
  )
  return JSON.parse(json)
}

/** Index of the app's largest window: the front window can be a title-bar strip, not the session. */
function mainWindowIndex() {
  const out = osascript(
    `tell application "System Events" to tell process "${opt.app}" to get size of every window`,
  )
  const n = out.split(',').map(v => Number(v.trim()))
  let best = 0
  let bestArea = -1
  for (let i = 0; i + 1 < n.length; i += 2) {
    if (n[i] * n[i + 1] > bestArea) [best, bestArea] = [i / 2, n[i] * n[i + 1]]
  }
  return best + 1
}

/** The app's main (largest) window in points: { x, y, w, h }. Needs Accessibility permission. */
function windowBounds() {
  const out = osascript(
    `tell application "System Events" to tell process "${opt.app}" to get {position, size} of window ${mainWindowIndex()}`,
  )
  const [x, y, w, h] = out.split(',').map(n => Number(n.trim()))
  return { x, y, w, h }
}

function activate() {
  osascript(`tell application "${opt.app}" to activate`)
}

function maximize(frame) {
  osascript(
    `tell application "System Events" to tell process "${opt.app}" to tell window ${mainWindowIndex()}
       set position to {${frame.x}, ${frame.y}}
       set size to {${frame.w}, ${frame.h}}
     end tell`,
  )
}

/** Fail unless the window fills the visible frame, as a scripted tour's coordinates assume. */
function checkMaximized(win, frame) {
  const fills = win.w >= frame.w * 0.97 && win.h >= frame.h * 0.97
  if (!fills) {
    fail(
      `the ${opt.app} window is ${win.w}x${win.h} but the screen's visible area is ${frame.w}x${frame.h}. ` +
        'Maximize it (Window > Zoom, or pass --maximize) so the tour coordinates land where they were probed.',
    )
  }
}

function setAppearance(dark) {
  const was =
    osascript(
      'tell application "System Events" to tell appearance preferences to get dark mode',
    ) === 'true'
  osascript(
    `tell application "System Events" to tell appearance preferences to set dark mode to ${dark}`,
  )
  return was
}

/** A click target, window-relative: [x, y] in points, or ["50%", "90%"] of the window size. */
function clickPoint(target, win) {
  const axis = (value, origin, size) =>
    typeof value === 'string' && value.endsWith('%')
      ? Math.round(origin + (size * Number(value.slice(0, -1))) / 100)
      : Math.round(origin + Number(value))
  return [axis(target[0], win.x, win.w), axis(target[1], win.y, win.h)]
}

/** cliclick commands for 'text{Enter}': typed characters and whole key presses. */
function keyCommands(keys) {
  const out = []
  for (let i = 0; i < keys.length;) {
    const end = keys[i] === '{' ? keys.indexOf('}', i) : -1
    const name = end === -1 ? '' : keys.slice(i + 1, end)
    if (name in KEYS) {
      out.push(`kp:${KEYS[name]}`)
      i = end + 1
    } else {
      out.push(`t:${keys[i]}`)
      i += 1
    }
  }
  return out
}

async function playStep(step, win) {
  // "click": null marks a target not calibrated yet; probe skips it rather than click a guess.
  if (step.click === null) console.log(`skipped uncalibrated click: ${step.note ?? ''}`)
  else if (step.click) run('cliclick', [`c:${clickPoint(step.click, win).join(',')}`])
  if (step.keys) run('cliclick', ['-w', String(TYPE_DELAY_MS), ...keyCommands(step.keys)])
  await sleep((step.wait ?? 2) * 1000)
}

const describe = step =>
  [
    step.click && `click ${step.note ?? JSON.stringify(step.click)}`,
    step.keys && `type ${JSON.stringify(step.keys)}`,
  ]
    .filter(Boolean)
    .join(', then ') || 'wait'

/** Pixel size of a movie, and its duration in seconds. */
function probeMovie(file) {
  const [w, h, d] = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:format=duration',
    '-of',
    'csv=p=0:s=,',
    file,
  ])
    .split(/[\n,]/)
    .filter(Boolean)
    .map(Number)
  return { w, h, duration: d }
}

/** Convert a full-screen or pre-cropped movie into the output, cropped to the window when asked. */
function convert(input, output, win) {
  const movie = probeMovie(input)
  const frame = visibleFrame()
  const scale = movie.w / frame.screenW
  const filters = []
  const crop = opt.crop ?? (win && Math.abs(scale - Math.round(scale)) < 0.01 ? 'window' : 'none')
  if (crop === 'window' && win) {
    const px = n => Math.round(n * scale)
    filters.push(`crop=${px(win.w)}:${px(win.h)}:${px(win.x)}:${px(win.y)}`)
  }
  filters.push(`fps=${opt.fps}`, `scale=${opt.width}:-2:flags=lanczos`)
  const trim = []
  if (opt['trim-start']) trim.push('-ss', opt['trim-start'])
  if (opt['trim-end'])
    trim.push(
      '-t',
      String(movie.duration - Number(opt['trim-start'] ?? 0) - Number(opt['trim-end'])),
    )
  if (output.endsWith('.gif')) {
    const vf = `${filters.join(',')},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`
    run('ffmpeg', [
      '-y',
      '-v',
      'error',
      ...trim,
      '-i',
      input,
      '-filter_complex',
      vf,
      '-loop',
      '0',
      output,
    ])
  } else if (output.endsWith('.mp4')) {
    run('ffmpeg', [
      '-y',
      '-v',
      'error',
      ...trim,
      '-i',
      input,
      '-vf',
      filters.join(','),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      output,
    ])
  } else {
    fail(`unsupported output: ${output} (use .gif or .mp4)`)
  }
  console.error(`wrote ${output}`)
}

async function scripted() {
  if (!opt.out) fail('--out is required')
  const uncalibrated = tour.steps.flatMap((s, i) => (s.click === null ? [i + 1] : []))
  if (uncalibrated.length > 0) {
    fail(
      `steps ${uncalibrated.join(', ')} have "click": null. Run probe and set them from the PNGs first.`,
    )
  }
  activate()
  await sleep(800)
  const frame = visibleFrame()
  if (opt.maximize) maximize(frame)
  await sleep(500)
  const win = windowBounds()
  checkMaximized(win, frame)
  const restore = opt.appearance ? setAppearance(opt.appearance === 'dark') : undefined
  const movie = join(tmpdir(), `desktop-${process.pid}.mov`)
  const seconds = Math.ceil(tour.steps.reduce((sum, s) => sum + (s.wait ?? 2), 0) + 3)
  try {
    await sleep(1000)
    // -v records the main display, -V stops after a fixed time, -x keeps it silent.
    const recorder = spawn('screencapture', ['-v', '-x', '-V', String(seconds), movie], {
      stdio: 'ignore',
    })
    const done = new Promise(resolve => recorder.on('exit', resolve))
    await sleep(1500)
    for (const step of tour.steps) await playStep(step, win)
    await done
    if (!existsSync(movie))
      fail('screencapture wrote nothing: grant Screen Recording to the app that runs this script')
    convert(movie, opt.out, win)
  } finally {
    if (restore !== undefined) setAppearance(restore)
    rmSync(movie, { force: true })
  }
}

async function probe() {
  const dir = opt['probe-dir'] ?? join(tmpdir(), 'desktop-probe')
  mkdirSync(dir, { recursive: true })
  activate()
  await sleep(800)
  const frame = visibleFrame()
  if (opt.maximize) maximize(frame)
  await sleep(500)
  const win = windowBounds()
  checkMaximized(win, frame)
  console.log(`window ${win.w}x${win.h} at ${win.x},${win.y} (points); PNGs are window-relative`)
  const shot = name => {
    const file = join(dir, `${name}.png`)
    run('screencapture', ['-x', `-R${win.x},${win.y},${win.w},${win.h}`, file])
    console.log(file)
  }
  shot('00-start')
  for (const [i, step] of tour.steps.entries()) {
    await playStep(step, win)
    shot(`${String(i + 1).padStart(2, '0')}`)
  }
}

function checklist() {
  console.log('Record the maximized Claude window (Cmd+Shift+5, Record Entire Screen), then:')
  for (const [i, step] of tour.steps.entries()) {
    console.log(`${String(i + 1).padStart(2)}. ${describe(step)}, hold ${step.wait ?? 2}s`)
  }
  console.log(
    'Stop the recording from the menu bar, then run: desktop.mjs handmade --input <movie> --out <gif>',
  )
}

function handmade() {
  if (!opt.input || !opt.out) fail('--input and --out are required')
  if (!existsSync(opt.input)) fail(`no such file: ${opt.input}`)
  let win
  if (opt.crop !== 'none') {
    try {
      win = windowBounds()
    } catch {
      win = undefined // the app is closed: convert without cropping
    }
  }
  convert(opt.input, opt.out, win)
}

if (mode === 'scripted') await scripted()
else if (mode === 'probe') await probe()
else if (mode === 'checklist') checklist()
else handmade()
