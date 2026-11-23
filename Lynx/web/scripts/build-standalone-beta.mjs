import { readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(scriptDir, '..')
const distDir = join(webDir, 'dist')
const builtSourcePath = join(distDir, 'lynx-beta.source.html')
const deployedPath = join(distDir, 'lynx-beta.html')
const standalonePath = join(webDir, 'lynx-beta.html')
const logoPath = join(webDir, 'public', 'Lynx.png')
const policeIconPath = join(webDir, 'public', 'police.png')

const builtHtml = await readFile(builtSourcePath, 'utf8')
const logoBase64 = (await readFile(logoPath)).toString('base64')
const policeIconBase64 = (await readFile(policeIconPath)).toString('base64')

const scriptMatch = builtHtml.match(
  /<script\s+type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/i,
)
const styleMatch = builtHtml.match(
  /<link\s+rel="stylesheet"[^>]*\shref="([^"]+)"[^>]*>/i,
)

if (!scriptMatch || !styleMatch) {
  throw new Error('Cannot find the Vite JavaScript or CSS asset in the Beta build')
}

function assetPathFromUrl(url) {
  const relative = url.replace(/^\.?\//, '')
  const fullPath = resolve(distDir, relative)
  if (!fullPath.startsWith(distDir)) throw new Error(`Unsafe build asset path: ${url}`)
  return fullPath
}

const [script, style] = await Promise.all([
  readFile(assetPathFromUrl(scriptMatch[1]), 'utf8'),
  readFile(assetPathFromUrl(styleMatch[1]), 'utf8'),
])

const standaloneHtml = builtHtml
  .replace(
    scriptMatch[0],
    () => `<script type="module">\n${script}\n</script>`,
  )
  .replace(
    styleMatch[0],
    () => `<style>\n${style}\n</style>`,
  )
  .replaceAll('/Lynx.png', `data:image/png;base64,${logoBase64}`)
  .replaceAll('/police.png', `data:image/png;base64,${policeIconBase64}`)
  .replace(
    '<!DOCTYPE html>',
    '<!DOCTYPE html>\n<!-- Generated file: edit lynx-beta.source.html, then run npm run build. -->',
  )

if (/(?:src|href)="\//i.test(standaloneHtml)) {
  throw new Error(`Standalone Beta still contains a root-absolute resource reference: ${standaloneHtml.match(/.{0,50}(?:src|href)="\/.{0,80}/i)?.[0] || 'unknown'}`)
}

await Promise.all([
  writeFile(deployedPath, builtHtml, 'utf8'),
  writeFile(standalonePath, standaloneHtml, 'utf8'),
])
await unlink(builtSourcePath)

console.log(`Standalone Beta: ${standalonePath}`)
console.log(`Deployable Beta: ${deployedPath}`)
