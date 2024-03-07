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
if (userTsConfig) console.info(`Load tsconfig from ${tsConfigPath}`)
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

const aliasPaths = tsConfig.compilerOptions.paths ?? {}

function resolveAliasPaths(specifier) {
  if (aliasPaths[specifier]) {
    return aliasPaths[specifier].map((x) =>
      path.join(path.resolve(process.cwd()), x),
    )
  }
  return [specifier]
}

async function resolveTs(specifier, context) {
  if (specifier.startsWith('file://')) return null
  if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
    return null
  }
  const parentPath = fileURLToPath(context.parentURL)
  let specifierPath = path.isAbsolute(specifier)
    ? specifier
    : path.join(path.dirname(parentPath), specifier)

  const isDirectory =
    fs.existsSync(specifierPath) && fs.statSync(specifierPath).isDirectory()
  const extension = path.basename(specifier).split('.').at(-1)
  if (['js', 'cjs', 'mjs'].includes(extension) && !isDirectory) {
    return null
  }
  if (fs.existsSync(specifierPath + '.ts')) {
    return pathToFileURL(specifierPath + '.ts').toString()
  } else if (isDirectory) {
    const indexPath = path.join(specifierPath, 'index.ts')
    if (fs.existsSync(indexPath)) {
      return pathToFileURL(indexPath).toString()
    }
  }
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

export async function load(url, context, nextLoad) {
  if (url.startsWith('file://') && url.endsWith('.ts')) {
    const urlPath = fileURLToPath(url)
    const filename = path.basename(urlPath)
    const tsSource = await fsp.readFile(urlPath, { encoding: 'utf-8' })

    const transpileResult = ts.transpileModule(tsSource, tsConfig)
    const sourceMap = JSON.parse(transpileResult.sourceMapText)
    sourceMap.file = filename
    sourceMap.sources[0] = `./${filename}`
    let source = transpileResult.outputText
    source = `${source.substring(0, source.lastIndexOf('\n'))}\n//# sourceMappingURL=data:application/json;base64,${btoa(JSON.stringify(sourceMap))}`
    return {
      shortCircuit: true,
      format:
        tsConfig.compilerOptions.module.toString().toLowerCase() === 'commonjs'
          ? 'commonjs'
          : 'module',
      source,
    }
  }
  return nextLoad(url)
}
