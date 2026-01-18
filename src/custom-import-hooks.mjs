import fs from 'fs'
import fsp from 'fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath, pathToFileURL } from 'url'

function resolveTsConfig() {
  let searchPath = path.resolve(process.cwd())

  const tsconfigPath = path.join(searchPath, 'tsconfig.json')
  if (fs.existsSync(tsconfigPath)) {
    return tsconfigPath
  }
  return null
}

function loadTsConfig(path) {
  try {
    const raw = fs.readFileSync(path, { encoding: 'utf-8' })
    return JSON.parse(raw)
  } catch (e) {
    return undefined
  }
}

const tsConfigPath = resolveTsConfig()
const userTsConfig = loadTsConfig(tsConfigPath)

const tsConfig = {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: 'es2015',
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    allowJs: true,
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true,
    ...(userTsConfig && userTsConfig.compilerOptions),
    sourceMap: true,
  },
}
tsConfig.compilerOptions.jsx = undefined

const aliasPaths = tsConfig.compilerOptions.paths ?? {}

// Cache for resolved alias paths
const aliasCache = new Map()
const cwdResolved = path.resolve(process.cwd())

// Pre-process aliases for faster lookups
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
      aliasPaths[alias].map((x) => path.join(cwdResolved, x)),
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
        result = paths.map((p) => path.join(cwdResolved, p + suffix))
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

  // Try .ts file first (most common case)
  const tsPath = specifierPath + '.ts'
  if (fs.existsSync(tsPath)) {
    const result = pathToFileURL(tsPath).toString()
    resolveTsCache.set(cacheKey, result)
    return result
  }

  // Check if directory and try index.ts
  try {
    const stats = fs.statSync(specifierPath)
    if (stats.isDirectory()) {
      const indexPath = path.join(specifierPath, 'index.ts')
      if (fs.existsSync(indexPath)) {
        const result = pathToFileURL(indexPath).toString()
        resolveTsCache.set(cacheKey, result)
        return result
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
// Pre-compute the format to avoid repeated toString() and toLowerCase()
const moduleFormat =
  tsConfig.compilerOptions.module.toString().toLowerCase() === 'commonjs'
    ? 'commonjs'
    : 'module'

export async function load(url, context, nextLoad) {
  if (url.startsWith('file://') && url.endsWith('.ts')) {
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
