import { build } from 'vite'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(scriptDir, '..')
const projectDir = resolve(webDir, '..')
const outputDir = resolve(projectDir, '..', 'output')
const outputPath = join(outputDir, 'Lynx-Test.html')
const templatePath = join(webDir, 'lynx-beta.source.html')
const logoPath = join(webDir, 'public', 'Lynx.png')
const entryPath = join(webDir, 'offline-entry.js')
const temporaryBuildDir = await mkdtemp(join(tmpdir(), 'lynx-offline-build-'))

try {
  await build({
    root: webDir,
    configFile: false,
    base: './',
    logLevel: 'info',
    build: {
      outDir: temporaryBuildDir,
      emptyOutDir: true,
      cssCodeSplit: false,
      minify: 'esbuild',
      rollupOptions: {
        input: entryPath,
        output: {
          entryFileNames: 'lynx-offline.js',
          assetFileNames: 'lynx-offline[extname]',
          inlineDynamicImports: true,
        },
      },
    },
  })

  const builtFiles = await readdir(temporaryBuildDir)
  const scriptFile = builtFiles.find(name => name.endsWith('.js'))
  const styleFile = builtFiles.find(name => name.endsWith('.css'))
  if (!scriptFile || !styleFile) throw new Error('Offline build did not produce JavaScript and CSS')

  const [template, script, style, logo] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(join(temporaryBuildDir, scriptFile), 'utf8'),
    readFile(join(temporaryBuildDir, styleFile), 'utf8'),
    readFile(logoPath),
  ])
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`
  const sourceScript = '<script type="module" src="/src/main.js"></script>'
  const sourceStyle = '<link rel="stylesheet" href="/src/style.css">'
  if (!template.includes(sourceScript) || !template.includes(sourceStyle)) {
    throw new Error('Offline HTML template entry tags were not found')
  }

  const offlineBanner = `
  <div id="offline-mode-banner" role="status" style="max-width:768px;margin:12px auto 0;padding:9px 14px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1e40af;font-size:12px;text-align:center">
    Lynx Test 离线单文件版 · 所有数据仅保存在当前设备的浏览器中
  </div>`

  const html = template
    .replace('<title>Lynx Beta - TCG 赛事工具</title>', '<title>Lynx Test - 离线 TCG 赛事工具</title>')
    .replace(sourceStyle, `<style>\n${style}\n</style>`)
    .replace(sourceScript, `<script type="module">\n${script}\n</script>`)
    .replaceAll('/Lynx.png', logoUrl)
    .replace('<main>', `<main>\n${offlineBanner}`)
    .replace(
      '<!DOCTYPE html>',
      '<!DOCTYPE html>\n<!-- Lynx Test offline single-file edition. Data stays on the current device. -->',
    )

  if (/(?:src|href)="(?:\/|https?:)/i.test(html)) {
    throw new Error('Offline output still contains an external resource reference')
  }
  if (html.includes('\uFFFD')) {
    throw new Error('Offline output contains a Unicode replacement character')
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, html, 'utf8')
  console.log(`Lynx offline test file: ${outputPath}`)
} finally {
  await rm(temporaryBuildDir, { recursive: true, force: true })
}
