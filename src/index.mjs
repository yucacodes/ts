import { spawn } from 'child_process'
import * as path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const nodejs = process.execPath
const __dirname = fileURLToPath(new URL('.', import.meta.url).toString())
const customImport = pathToFileURL(path.join(__dirname, './custom-import.mjs')).toString()

const child = spawn(nodejs, [
  '--import',
  customImport,
  ...process.argv.slice(2),
])

process.stdin.on('data', (data) => {
  child.stdin.write(data)
})

child.stdout.on('data', (data) => {
  process.stdout.write(data)
})

child.stderr.on('data', (data) => {
  process.stderr.write(data)
})

child.on('exit', (code) => process.exit(code))
