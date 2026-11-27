// Backend for TypeScript 7 (the native compiler), which ships the `tsc`
// executable but no JavaScript compiler API. Instead of transpiling module by
// module, the project is emitted with `tsc --noCheck` into a disk cache that
// every process shares (node --test workers included); the load hook serves
// the emitted JavaScript from there.
//
// - Freshness: a stamp records when the project was last emitted, the resolved
//   compiler options and the project's root files. When neither tsconfig.json
//   nor any root file is newer than the stamp, startup runs no compiler at all.
//   Each emit rewrites every output, so a module is stale exactly when its
//   source is newer than its output.
// - Concurrency: a lock directory (holding the owner's pid) lets one process
//   emit while the others wait, then reuse its output.
// - Files outside the project (not matched by tsconfig `include`) are emitted
//   on demand with a one-file config that extends the project's.
// - Outputs mirror absolute source paths under the cache (`--rootDir` is the
//   filesystem root) and carry inline source maps whose `sourceRoot` is
//   `file:///`, so stack traces point at the original files.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const LOADER_VERSION = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

const OUTPUT_EXTENSIONS = {
  '.ts': '.js',
  '.tsx': '.js',
  '.jsx': '.js',
  '.mts': '.mjs',
  '.cts': '.cjs',
}

const LOCK_TIMEOUT_MS = 120_000

const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const hash = (value) =>
  createHash('sha256').update(value).digest('hex').slice(0, 16)

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return undefined
  }
}

/** The nearest tsconfig.json from `dir` upwards, as `ts.findConfigFile` does. */
export function findConfigFile(dir) {
  for (let current = path.resolve(dir); ; current = path.dirname(current)) {
    const candidate = path.join(current, 'tsconfig.json')
    if (fs.existsSync(candidate)) return candidate
    if (path.dirname(current) === current) return null
  }
}

function findCacheRoot(dir) {
  for (let current = dir; ; current = path.dirname(current)) {
    const modules = path.join(current, 'node_modules')
    if (fs.existsSync(modules)) return path.join(modules, '.cache', 'yts')
    if (path.dirname(current) === current) return path.join(os.tmpdir(), 'yts')
  }
}

/**
 * The native executable from the platform package, as TypeScript's own
 * `bin/tsc` locates it; falls back to that script (one extra Node startup).
 */
function findTsc(typescriptPkgJson) {
  const req = createRequire(typescriptPkgJson)
  const exeName = process.platform === 'win32' ? 'tsc.exe' : 'tsc'
  try {
    const platformPkg = req.resolve(
      `@typescript/typescript-${process.platform}-${process.arch}/package.json`,
    )
    const exe = path.join(path.dirname(platformPkg), 'lib', exeName)
    if (fs.existsSync(exe)) return { command: exe, prefix: [] }
  } catch {
    // Not installed for this platform: use the JavaScript entry point.
  }
  return {
    command: process.execPath,
    prefix: [path.join(path.dirname(typescriptPkgJson), 'bin', 'tsc')],
  }
}

export class NativeEmitter {
  /**
   * @param {{ cwd: string, typescriptPkgJson: string, typescriptVersion: string }} options
   */
  constructor(options) {
    this.options = options
    this.configPath = findConfigFile(options.cwd)
    this.configDir = this.configPath
      ? path.dirname(this.configPath)
      : path.resolve(options.cwd)
    this.rootDir = path.parse(this.configDir).root
    this.dir = path.join(
      findCacheRoot(this.configDir),
      hash(
        [
          this.configPath ?? this.configDir,
          options.typescriptVersion,
          LOADER_VERSION,
        ].join('\0'),
      ),
    )
    this.outDir = path.join(this.dir, 'out')
    this.stampPath = path.join(this.dir, 'stamp.json')
    this.lockPath = path.join(this.dir, 'lock')
    this.tsc = findTsc(options.typescriptPkgJson)
    this.stamp = null
  }

  /** Emits the project unless the cache is fresh; returns the stamp (null without tsconfig). */
  prepare() {
    if (!this.configPath) return null
    const fresh = () => {
      const stamp = this.#readStamp()
      return this.#isProjectFresh(stamp) ? stamp : null
    }
    this.stamp = fresh() ?? this.#withLock(() => this.#emitProject(), fresh)
    return this.stamp
  }

  /** The emitted JavaScript for a source file, emitting it first when stale. */
  load(file) {
    const output = this.outputFor(file)
    const isFresh = () => {
      const outputTime = mtime(output)
      return outputTime !== undefined && outputTime >= (mtime(file) ?? Infinity)
    }
    if (!isFresh() && this.configPath) {
      this.stamp = this.#withLock(
        () => this.#emitProject(),
        () => (isFresh() ? this.#readStamp() ?? {} : null),
      )
    }
    if (!isFresh()) {
      this.#withLock(() => this.#emitFile(file), isFresh)
    }
    if (!fs.existsSync(output)) return null
    return { path: output, source: fs.readFileSync(output, 'utf8') }
  }

  outputFor(file) {
    const extension = path.extname(file)
    const mirrored = path.join(this.outDir, path.relative(this.rootDir, file))
    return mirrored.slice(0, -extension.length) + OUTPUT_EXTENSIONS[extension]
  }

  #readStamp() {
    try {
      return JSON.parse(fs.readFileSync(this.stampPath, 'utf8'))
    } catch {
      return null
    }
  }

  #isProjectFresh(stamp) {
    if (!stamp) return false
    for (const file of stamp.watch) {
      const time = mtime(file)
      if (time === undefined || time > stamp.time) return false
    }
    return true
  }

  #emitProject() {
    const time = Date.now()
    const shown = this.#showConfig(this.configPath)
    this.#run([
      '-p',
      this.configPath,
      ...this.#emitFlags(shown.compilerOptions),
    ])
    const stamp = {
      time,
      compilerOptions: shown.compilerOptions,
      watch: [
        this.configPath,
        ...(shown.files ?? []).map((f) => path.resolve(this.configDir, f)),
      ],
    }
    fs.writeFileSync(`${this.stampPath}.${process.pid}`, JSON.stringify(stamp))
    fs.renameSync(`${this.stampPath}.${process.pid}`, this.stampPath)
    return stamp
  }

  #emitFile(file) {
    const configPath = path.join(this.dir, `file-${hash(file)}.json`)
    const config = {
      compilerOptions: { allowJs: true },
      files: [file],
      include: [],
    }
    if (this.configPath) config.extends = this.configPath
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config))
    const shown = this.#showConfig(configPath)
    this.#run(['-p', configPath, ...this.#emitFlags(shown.compilerOptions)])
  }

  #emitFlags(options = {}) {
    const flags = [
      '--noCheck',
      '--outDir',
      this.outDir,
      '--rootDir',
      this.rootDir,
      '--inlineSourceMap',
      '--sourceRoot',
      pathToFileURL(this.rootDir).href,
      '--sourceMap',
      'false',
      '--noEmit',
      'false',
      '--noEmitOnError',
      'false',
      '--declaration',
      'false',
      '--declarationMap',
      'false',
      '--emitDeclarationOnly',
      'false',
      '--composite',
      'false',
      '--incremental',
      'false',
      // Only valid without emit; imports keep their `.ts` extension either way,
      // and the resolve hook handles them.
      '--allowImportingTsExtensions',
      'false',
      '--pretty',
      'false',
    ]
    // The loader's defaults, applied only where the project leaves them unset.
    const decorators = options.experimentalDecorators ?? true
    if (options.experimentalDecorators === undefined) {
      flags.push('--experimentalDecorators')
    }
    if (options.emitDecoratorMetadata === undefined && decorators) {
      flags.push('--emitDecoratorMetadata')
    }
    if (options.jsx === undefined) flags.push('--jsx', 'react-jsx')
    if (options.module === undefined) flags.push('--module', 'esnext')
    return flags
  }

  #showConfig(configPath) {
    const output = this.#run(['-p', configPath, '--showConfig'], true)
    try {
      return JSON.parse(output)
    } catch {
      // A config tsc cannot resolve: the emit that follows reports why.
      return { compilerOptions: {}, files: [] }
    }
  }

  #run(args, quiet = false) {
    try {
      return execFileSync(this.tsc.command, [...this.tsc.prefix, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      if (typeof error.status !== 'number') throw error
      // Syntax and configuration errors: --noCheck still reports them, and the
      // emit still happens. Show them the way tsc would.
      if (!quiet) process.stderr.write(error.stdout + error.stderr)
      return error.stdout
    }
  }

  #withLock(task, recheck) {
    fs.mkdirSync(this.dir, { recursive: true })
    const startedAt = Date.now()
    for (;;) {
      try {
        fs.mkdirSync(this.lockPath)
        fs.writeFileSync(path.join(this.lockPath, 'pid'), String(process.pid))
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
      if (this.#isLockAbandoned() || Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        fs.rmSync(this.lockPath, { recursive: true, force: true })
        continue
      }
      sleep(20)
      const result = recheck()
      if (result) return result
    }
    try {
      return recheck() || task()
    } finally {
      fs.rmSync(this.lockPath, { recursive: true, force: true })
    }
  }

  #isLockAbandoned() {
    let pid
    try {
      pid = Number(fs.readFileSync(path.join(this.lockPath, 'pid'), 'utf8'))
    } catch {
      // Created but not yet stamped with a pid: give its owner a moment.
      const created = mtime(this.lockPath)
      return created !== undefined && Date.now() - created > 2_000
    }
    try {
      process.kill(pid, 0)
      return false
    } catch (error) {
      return error.code === 'ESRCH'
    }
  }
}
