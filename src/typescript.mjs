import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const ownRequire = createRequire(import.meta.url)

/**
 * The TypeScript the project runs with: resolved from the working directory
 * first (the app's own install), then from the loader's location.
 *
 * TypeScript 7 is the native compiler: its package ships the `tsc` executable
 * but no JavaScript compiler API, so the loader picks its backend from `major`.
 */
export function findTypeScript(cwd = process.cwd()) {
  const appRequire = createRequire(path.join(cwd, '__yts__.js'))
  for (const req of [appRequire, ownRequire]) {
    let pkgJson
    try {
      pkgJson = req.resolve('typescript/package.json')
    } catch {
      continue
    }
    const { version } = JSON.parse(fs.readFileSync(pkgJson, 'utf8'))
    return {
      pkgJson,
      version,
      major: Number.parseInt(version, 10),
      /** The JavaScript compiler API (TypeScript 6 and earlier only). */
      api: () => req('typescript'),
    }
  }
  throw new Error(
    '@yucacodes/ts: TypeScript is not installed. Run `npm install -D typescript`.',
  )
}
