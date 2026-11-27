import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Set of JS extensions to skip
const jsExtensions = new Set(['js', 'cjs', 'mjs'])
// TypeScript/JSX extensions we can resolve when present on the specifier
const tsExtensions = new Set(['ts', 'tsx', 'jsx', 'mts', 'cts'])
// Extensions to probe (in order) when the specifier has no extension
const resolveExtensions = ['.ts', '.tsx', '.jsx', '.mts', '.cts']
// Directory index files to probe (in order)
const indexFiles = ['index.ts', 'index.tsx', 'index.jsx']

/**
 * The `resolve` hook shared by both backends: tsconfig `paths` aliases, then
 * extensionless and directory specifiers probed against TypeScript files.
 *
 * `paths` entries resolve against `baseUrl` when set and against the tsconfig
 * directory otherwise (TypeScript 6.0 deprecates `baseUrl` as a paths base).
 */
export function createResolver({ paths = {}, baseUrl, configDir }) {
  const pathsBase = baseUrl ? path.resolve(configDir, baseUrl) : configDir

  const aliasCache = new Map()
  const exactAliases = new Map()
  const wildcardAliases = []

  for (const alias in paths) {
    if (alias.endsWith('/*')) {
      const aliasPrefix = alias.slice(0, -1)
      const targets = paths[alias]
        .filter((x) => x.endsWith('/*'))
        .map((x) => x.slice(0, -1))
      wildcardAliases.push({ prefix: aliasPrefix, paths: targets })
    } else {
      exactAliases.set(
        alias,
        paths[alias].map((x) => path.resolve(pathsBase, x)),
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

  function resolveTs(specifier, context) {
    if (specifier.startsWith('file://')) return null
    if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
      return null
    }
    const parentPath = fileURLToPath(context.parentURL)
    const specifierPath = path.isAbsolute(specifier)
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

  return async function resolve(specifier, context, nextResolve) {
    const resolvedSpecifiers = resolveAliasPaths(specifier)
    for (const rs of resolvedSpecifiers) {
      const tsFileUrl = resolveTs(rs, context)
      if (tsFileUrl) {
        return {
          shortCircuit: true,
          url: tsFileUrl,
        }
      }
    }
    return nextResolve(specifier)
  }
}
