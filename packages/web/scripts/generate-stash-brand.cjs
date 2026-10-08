// Run from the repository root: node packages/web/scripts/generate-stash-brand.cjs
// Uses the web package's existing sharp dependency.
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
const source = fs.readFileSync(path.join(root, 'components/elements/images/StashBrand.ts'), 'utf8')
const orange = source.match(/STASH_ORANGE = '([^']+)'/)[1]
const ink = source.match(/STASH_INK = '([^']+)'/)[1]
const ribbon = source.match(/STASH_RIBBON =\s*'([^']+)'/)[1]
const bookmark = source.match(/STASH_BOOKMARK =\s*'([^']+)'/)[1]
const symbol = `<path d="${ribbon}" fill="${ink}"/><path d="${bookmark}" fill="${ink}"/>`
const tile = `<rect width="24" height="24" rx="5.5" fill="${orange}"/>${symbol}`
const wrap = (content, viewBox = '0 0 24 24') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>\n`
const mark = wrap(tile)
const maskable = wrap(`<rect width="24" height="24" fill="${orange}"/><g transform="translate(4 4) scale(0.6666667)">${symbol}</g>`)
const touch = wrap(`<rect width="24" height="24" fill="${orange}"/><g transform="translate(1 1) scale(0.9166667)">${symbol}</g>`)
const font = fs.readFileSync(path.join(publicDir, 'static/fonts/Geist/Geist-Variable.woff2')).toString('base64')
const lockup = (color) => wrap(`<defs><style>@font-face{font-family:StashGeist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}</style></defs><g transform="translate(0 1.5)">${tile}</g><text x="34" y="22" font-family="StashGeist, sans-serif" font-weight="600" font-size="25" letter-spacing="-0.5" fill="${color}">Stash</text>`, '0 0 102 27')
const save = (name, data) => {
  const dest = path.join(publicDir, name)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, data)
}
const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()

async function main() {
  save('static/brand/stash-mark.svg', mark)
  save('static/brand/stash-logo.svg', lockup(ink))
  save('static/brand/stash-logo-light.svg', lockup('#FAFAFA'))
  for (const name of ['favicon.svg', 'favicon-dark.svg', 'favicon-auto.svg']) save(name, mark)
  for (const name of ['static/icons/logo-landing.svg', 'static/icons/default/logo-landing.svg']) save(name, lockup(ink))
  save('static/icons/onboarding-logo.svg', mark)
  for (const size of [16, 24, 32, 48, 64]) {
    const data = await png(mark, size)
    save(`favicon-${size}.png`, data)
    save(`favicon-dark-${size}.png`, data)
  }
  // ICO directory containing PNG entries; supports all modern browsers.
  const entries = await Promise.all([16, 32, 48].map(size => png(mark, size)))
  const header = Buffer.alloc(6 + entries.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach((data, i) => {
    const pos = 6 + i * 16
    header[pos] = header[pos + 1] = [16, 32, 48][i]
    header.writeUInt16LE(1, pos + 4)
    header.writeUInt16LE(32, pos + 6)
    header.writeUInt32LE(data.length, pos + 8)
    header.writeUInt32LE(offset, pos + 12)
    offset += data.length
  })
  const ico = Buffer.concat([header, ...entries])
  for (const name of ['favicon.ico', 'favicon-dark.ico', 'static/icons/favicon.ico', 'static/icons/favicon-light.ico', 'static/icons/favicon-dark.ico', 'static/icons/default/favicon-light.ico', 'static/icons/default/favicon-dark.ico']) save(name, ico)
  save('favicon.gif', await sharp(Buffer.from(mark)).resize(32, 32).gif().toBuffer())
  for (const size of [36, 48, 72, 96, 128, 144, 192, 256, 384, 512]) {
    save(`pwa-${size}.png`, await png(mark, size))
    save(`pwa-maskable-${size}.png`, await png(maskable, size))
  }
  for (const size of [57, 60, 72, 76, 114, 120, 144, 152, 180]) {
    const data = await png(touch, size)
    save(`apple-touch-icon-${size}x${size}.png`, data)
    save(`apple-touch-icon-${size}x${size}-precomposed.png`, data)
  }
  for (const name of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) save(name, await png(touch, 180))
  for (const name of ['logo-light.png', 'logo-dark.png', 'logo-grey.png']) save(`static/icons/default/${name}`, await png(mark, 256))
  const manifestPath = path.join(publicDir, 'manifest.webmanifest')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  for (const icon of manifest.icons) {
    const size = icon.src.match(/-(\d+)\.png/)[1]
    icon.sizes = `${size}x${size}`
    icon.src = icon.src.replace(/\?.*$/, '') + '?v=stash-folded-s'
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Generated Stash SVGs, favicons, touch icons and manifest icons.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
