const bcrypt = require('bcryptjs')
const readline = require('readline')

function readHidden(prompt) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal')
    process.stdout.write(prompt)
    const chars = []
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    const onData = key => {
      if (key === '\u0003') process.exit(130)
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(chars.join(''))
        return
      }
      if (key === '\u007f' || key === '\b') {
        chars.pop()
        return
      }
      chars.push(key)
    }
    process.stdin.on('data', onData)
  })
}

async function main() {
  const first = await readHidden('New super password: ')
  if (Buffer.byteLength(first, 'utf8') < 12) throw new Error('Password must be at least 12 bytes')
  const second = await readHidden('Confirm password: ')
  if (first !== second) throw new Error('Passwords do not match')
  console.log(bcrypt.hashSync(first, 12))
}

main().catch(error => {
  readline.clearLine(process.stdout, 0)
  console.error(error.message)
  process.exit(1)
})

