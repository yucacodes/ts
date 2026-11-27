// Hooks for the TypeScript 7 backend: resolution is shared with the in-process
// backend, loading serves what `tsc` emitted into the cache (see native-emit).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NativeEmitter } from './native-emit.mjs'
import { createResolver } from './resolver.mjs'

const TS_FILE = /\.(ts|tsx|jsx|mts|cts)$/

let emitter
let moduleKind
let resolveTs

export function initialize(data) {
  emitter = new NativeEmitter(data.emitter)
  const options = data.compilerOptions ?? {}
  moduleKind = String(options.module ?? 'esnext').toLowerCase()
  resolveTs = createResolver({
    paths: options.paths,
    baseUrl: options.baseUrl,
    configDir: emitter.configDir,
  })
}

export function resolve(specifier, context, nextResolve) {
  return resolveTs(specifier, context, nextResolve)
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file://') || !TS_FILE.test(url)) return nextLoad(url)
  const file = fileURLToPath(url)
  if (!fs.existsSync(file)) return nextLoad(url)
  const emitted = emitter.load(file)
  if (!emitted) return nextLoad(url)
  return {
    shortCircuit: true,
    format: formatOf(emitted.path, file),
    source: emitted.source,
  }
}

function formatOf(output, file) {
  if (output.endsWith('.mjs')) return 'module'
  if (output.endsWith('.cjs')) return 'commonjs'
  if (moduleKind === 'commonjs') return 'commonjs'
  // node16/node18/node20/nodenext emit per the nearest package.json "type".
  if (moduleKind.startsWith('node')) return packageType(path.dirname(file))
  return 'module'
}

const packageTypes = new Map()

function packageType(dir) {
  if (packageTypes.has(dir)) return packageTypes.get(dir)
  let type
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    )
    type = pkg.type === 'module' ? 'module' : 'commonjs'
  } catch {
    const parent = path.dirname(dir)
    type = parent === dir ? 'commonjs' : packageType(parent)
  }
  packageTypes.set(dir, type)
  return type
}
