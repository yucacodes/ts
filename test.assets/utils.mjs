import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function execTsFile(file, options = {}) {
  return new Promise((resolve, reject) => {
    exec(
      `${path.join(__dirname, '../src/yts.mjs')} ${path.join(__dirname, '../', file)}`,
      {
        cwd: options.cwd && path.join(__dirname, '../', options.cwd),
      },
      (err, stdout, stderr) => {
        if (err) return reject(err)
        resolve(stdout)
      },
    )
  })
}
