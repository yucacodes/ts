import fs from 'fs'
import fsp from 'fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath, pathToFileURL } from 'url'

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

const aliasPaths = compilerOptions.paths ?? {}
// TS 6.0 deprecates `baseUrl` as a paths base; paths now resolve relative to
// the tsconfig directory. We still honor `baseUrl` if explicitly set, to keep
// pre-6.0 configs working.
const pathsBase = compilerOptions.baseUrl
  ? path.resolve(configDir, compilerOptions.baseUrl)
  : configDir

const aliasCache = new Map()

const exactAliases = new Map()
const wildcardAliases = []

for (const alias in aliasPaths) {
  if (alias.endsWith('/*')) {
    const aliasPrefix = alias.slice(0, -1)
    const paths = aliasPaths[alias]
      .filter((x) => x.endsWith('/*'))
      .map((x) => x.slice(0, -1))
    wildcardAliases.push({ prefix: aliasPrefix, paths })
  } else {
    exactAliases.set(
      alias,
      aliasPaths[alias].map((x) => path.resolve(pathsBase, x)),
    )
  }
}

function resolveAliasPaths(specifier) {
  // Check cache first
  const cached = aliasCache.get(specifier)
  if (cached) return cached

  let result
  // Check exact match first
  if (exactAliases.has(specifier)) {
    result = exactAliases.get(specifier)
  } else {
    // Check wildcard aliases
    for (const { prefix, paths } of wildcardAliases) {
      if (specifier.startsWith(prefix)) {
        const suffix = specifier.substring(prefix.length)
        result = paths.map((p) => path.resolve(pathsBase, p + suffix))
        break
      }
    }
  }

  if (!result) {
    result = [specifier]
  }

  // Cache the result
  aliasCache.set(specifier, result)
  return result
}

// Cache for resolved TypeScript file URLs
const resolveTsCache = new Map()
// Set of JS extensions to skip
const jsExtensions = new Set(['js', 'cjs', 'mjs'])
// TypeScript/JSX extensions we can resolve when present on the specifier
const tsExtensions = new Set(['ts', 'tsx', 'jsx', 'mts', 'cts'])
// Extensions to probe (in order) when the specifier has no extension
const resolveExtensions = ['.ts', '.tsx', '.jsx', '.mts', '.cts']
// Directory index files to probe (in order)
const indexFiles = ['index.ts', 'index.tsx', 'index.jsx']

async function resolveTs(specifier, context) {
  if (specifier.startsWith('file://')) return null
  if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
    return null
  }
  const parentPath = fileURLToPath(context.parentURL)
  let specifierPath = path.isAbsolute(specifier)
    ? specifier
    : path.join(path.dirname(parentPath), specifier)

  // Check cache
  const cacheKey = specifierPath
  const cached = resolveTsCache.get(cacheKey)
  if (cached !== undefined) return cached

  // Quick extension check before fs calls
  const extension = path.extname(specifier).slice(1)
  if (jsExtensions.has(extension)) {
    resolveTsCache.set(cacheKey, null)
    return null
  }

  // 1. Specifier as-is if it already has a resolvable extension
  if (tsExtensions.has(extension) && fs.existsSync(specifierPath)) {
    const result = pathToFileURL(specifierPath).toString()
    resolveTsCache.set(cacheKey, result)
    return result
  }

  // 2. Probe known TypeScript/JSX extensions (.ts is the most common case)
  for (const ext of resolveExtensions) {
    const candidate = specifierPath + ext
    if (fs.existsSync(candidate)) {
      const result = pathToFileURL(candidate).toString()
      resolveTsCache.set(cacheKey, result)
      return result
    }
  }

  // 3. Check if directory and try its index variants
  try {
    const stats = fs.statSync(specifierPath)
    if (stats.isDirectory()) {
      for (const indexFile of indexFiles) {
        const indexPath = path.join(specifierPath, indexFile)
        if (fs.existsSync(indexPath)) {
          const result = pathToFileURL(indexPath).toString()
          resolveTsCache.set(cacheKey, result)
          return result
        }
      }
    }
  } catch {
    // Path doesn't exist, not an error
  }

  resolveTsCache.set(cacheKey, null)
  return null
}

export async function resolve(specifier, context, nextResolve) {
  const resolvedSpecifiers = resolveAliasPaths(specifier)
  for (const rs of resolvedSpecifiers) {
    const tsFileUrl = await resolveTs(rs, context)
    if (tsFileUrl) {
      return {
        shortCircuit: true,
        url: tsFileUrl,
      }
    }
  }
  return nextResolve(specifier)
}

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
