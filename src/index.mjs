import { spawn } from 'child_process'
import * as path from 'path'

const nodejs = process.execPath
const __dirname = new URL('.', import.meta.url).pathname
const customImport = path.join(__dirname, './custom-import.mjs')

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
