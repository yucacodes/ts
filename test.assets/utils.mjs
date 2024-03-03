import { exec } from 'child_process'

export async function execTsFile(file) {
  return new Promise((resolve, reject) => {
    exec(`./src/yts.mjs ${file}`, (err, stdout, stderr) => {
      if (err) return reject(err)
      resolve(stdout)
    })
  })
}
