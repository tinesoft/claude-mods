import { execFileSync } from 'node:child_process'
import path from 'node:path'

const hasClaude = () => {
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const modRoot = file => {
  const rel = path.relative(process.cwd(), file).split(path.sep)
  return rel[0] === 'mods' && rel.length > 2 ? path.join('mods', rel[1]) : null
}

export default {
  '*.{ts,tsx,mjs,json,md}': files => {
    const quoted = files.map(f => JSON.stringify(f)).join(' ')
    const cmds = [`prettier --write ${quoted}`]
    const lintable = files.filter(f => /\.(ts|tsx|mjs)$/.test(f))
    if (lintable.length) {
      cmds.push(`eslint --fix ${lintable.map(f => JSON.stringify(f)).join(' ')}`)
    }
    if (hasClaude()) {
      const mods = new Set(files.map(modRoot).filter(Boolean))
      for (const mod of mods) cmds.push(`claude plugin validate ${mod} --strict`)
    }
    return cmds
  },
}
