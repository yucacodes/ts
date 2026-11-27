import { exec } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const yts = path.join(root, 'src/yts.mjs')

/**
 * Each suite runs against both backends. The repo installs TypeScript 7
 * (`native`); `legacy` runs the same fixtures from a copy of the repo whose
 * node_modules/typescript is TypeScript 6, the in-process transpiler.
 */
export const BACKENDS = ['native', 'legacy']

const TYPESCRIPT_PACKAGES = {
  native: path.join(root, 'node_modules/typescript'),
  legacy: path.join(root, 'node_modules/typescript6'),
}

const tempDirs = []
process.on('exit', () => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
})

/** A temp directory whose node_modules links the repo's, with the chosen TypeScript. */
function makeRoot(typescript) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'yts-test-')),
  )
  tempDirs.push(dir)
  const modules = path.join(dir, 'node_modules')
  fs.mkdirSync(modules)
  for (const name of fs.readdirSync(path.join(root, 'node_modules'))) {
    if (name.startsWith('.') || name === 'typescript') continue
    fs.symlinkSync(
      path.join(root, 'node_modules', name),
      path.join(modules, name),
    )
  }
  fs.symlinkSync(
    TYPESCRIPT_PACKAGES[typescript],
    path.join(modules, 'typescript'),
  )
  return dir
}

let legacyRoot
function rootFor(typescript = 'native') {
  if (typescript === 'native') return root
  if (!legacyRoot) {
    legacyRoot = makeRoot('legacy')
    for (const entry of ['package.json', 'test', 'test.assets']) {
      fs.cpSync(path.join(root, entry), path.join(legacyRoot, entry), {
        recursive: true,
      })
    }
  }
  return legacyRoot
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }))
      resolve({ stdout, stderr })
    })
  })
}

const run = async (command, cwd) => (await runCommand(command, cwd)).stdout

/** Runs a repo fixture through the `yts` CLI on the given backend. */
export async function execTsFile(file, options = {}) {
  const base = rootFor(options.typescript)
  return run(
    `${yts} ${options.nodeArgs ?? ''} ${path.join(base, file)}`,
    options.cwd && path.join(base, options.cwd),
  )
}

/**
 * A throwaway project: `files` maps relative paths to contents. Returns helpers
 * to run a file with `yts` from the project root and to rewrite files.
 */
export function makeApp(files, { typescript = 'native' } = {}) {
  const dir = makeRoot(typescript)
  const write = (relative, contents) => {
    const file = path.join(dir, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, contents)
  }
  for (const [relative, contents] of Object.entries(files))
    write(relative, contents)
  return {
    dir,
    write,
    run: (file, nodeArgs = '') =>
      run(`${yts} ${nodeArgs} ${path.join(dir, file)}`, dir),
    /** Like `run`, resolving `{ stdout, stderr }`. */
    exec: (file, nodeArgs = '') =>
      runCommand(`${yts} ${nodeArgs} ${path.join(dir, file)}`, dir),
    cacheDirs: () => {
      const cache = path.join(dir, 'node_modules/.cache/yts')
      return fs.existsSync(cache)
        ? fs.readdirSync(cache).map((name) => path.join(cache, name))
        : []
    },
  }
}
