// Backend for TypeScript 6 and earlier: transpiles each module in process with
// the JavaScript compiler API (`ts.transpileModule`).
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createResolver } from './resolver.mjs'
import { findTypeScript } from './typescript.mjs'

const typescript = findTypeScript()
if (typescript.major >= 7) {
  throw new Error(
    `@yucacodes/ts: TypeScript ${typescript.version} has no JavaScript compiler API; ` +
      'import @yucacodes/ts (custom-import.mjs) to get the native backend.',
  )
}
const ts = typescript.api()

function loadTsConfig() {
  const cwd = path.resolve(process.cwd())
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) {
    return { options: {}, configDir: cwd }
  }

  const readResult = ts.readConfigFile(configPath, ts.sys.readFile)
  if (readResult.error || !readResult.config) {
    return { options: {}, configDir: cwd }
  }

  const configDir = path.dirname(configPath)
  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    configDir,
  )
  return { options: parsed.options ?? {}, configDir }
}

const { options: userOptions, configDir } = loadTsConfig()

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2015,
  esModuleInterop: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  allowJs: true,
  resolveJsonModule: true,
  allowSyntheticDefaultImports: true,
  ...userOptions,
  sourceMap: true,
  jsx: userOptions.jsx ?? ts.JsxEmit.ReactJSX,
  jsxImportSource: userOptions.jsxImportSource,
  jsxFactory: userOptions.jsxFactory,
  jsxFragmentFactory: userOptions.jsxFragmentFactory,
}

export const resolve = createResolver({
  paths: compilerOptions.paths,
  baseUrl: compilerOptions.baseUrl,
  configDir,
})

// Cache for transpiled modules with file modification time
const transpileCache = new Map()
const moduleFormat =
  compilerOptions.module === ts.ModuleKind.CommonJS ? 'commonjs' : 'module'
const tsConfig = { compilerOptions }

export async function load(url, context, nextLoad) {
  if (url.startsWith('file://') && /\.(ts|tsx|jsx|mts|cts)$/.test(url)) {
    const urlPath = fileURLToPath(url)

    // Check cache with mtime validation
    let stats
    try {
      stats = await fsp.stat(urlPath)
      const cached = transpileCache.get(urlPath)
      if (cached && cached.mtime >= stats.mtimeMs) {
        return cached.result
      }
    } catch {
      // File doesn't exist or stat failed
      return nextLoad(url)
    }

    const filename = path.basename(urlPath)
    const tsSource = await fsp.readFile(urlPath, { encoding: 'utf-8' })

    const transpileResult = ts.transpileModule(tsSource, tsConfig)
    const sourceMap = JSON.parse(transpileResult.sourceMapText)
    sourceMap.file = filename
    sourceMap.sources[0] = `./${filename}`

    // Pre-compute the base64 source map
    const sourceMapBase64 = Buffer.from(
      JSON.stringify(sourceMap),
      'utf-8',
    ).toString('base64')

    const lastNewline = transpileResult.outputText.lastIndexOf('\n')
    const source = `${transpileResult.outputText.substring(0, lastNewline)}\n//# sourceMappingURL=data:application/json;base64,${sourceMapBase64}`

    const result = {
      shortCircuit: true,
      format: moduleFormat,
      source,
    }

    // Cache the result with modification time
    transpileCache.set(urlPath, { mtime: stats.mtimeMs, result })

    return result
  }
  return nextLoad(url)
}
