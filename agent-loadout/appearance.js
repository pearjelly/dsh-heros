import { createHash, randomUUID } from 'node:crypto'
import { constants, realpathSync, statSync } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadoutPackage, presetDeclarer } from './package-actions.js'

const imageLimit = 4 * 1024 * 1024
const mediaType = 'image/webp'
const filePattern = /^([a-f0-9]{32})\.webp$/
const acceptedTypes = new Map([['image/png', 'png'], ['image/jpeg', 'jpeg'], ['image/webp', 'webp']])
const artworkTypes = new Map([['.png', 'png'], ['.jpeg', 'jpeg'], ['.jpg', 'jpeg'], ['.webp', 'webp']])
const iconPattern = /^data:(image\/(?:svg\+xml|png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/
const iconLimit = 256 * 1024

function artKey(kind, id) {
  return createHash('sha256').update(JSON.stringify([kind, id])).digest('hex').slice(0, 32)
}

function revisionOf(stat) {
  return stat.mtimeNs.toString(36) + '-' + stat.size.toString(36)
}

export async function readArtwork(request, signal) {
  const declared = acceptedTypes.get(request.headers.get('content-type'))
  if (!request.body) throw new Error('请选择 PNG、JPEG 或 WebP 图片。')
  if (Number(request.headers.get('content-length')) > imageLimit) throw new Error('请选择 4 MB 以内的图片。')
  const reader = request.body.getReader()
  try {
    const chunks = []
    let bytes = 0
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) {
        if (!declared) throw new Error('请选择 PNG、JPEG 或 WebP 图片。')
        return { bytes: Buffer.concat(chunks), declared }
      }
      bytes += value.byteLength
      if (bytes > imageLimit) {
        void reader.cancel().catch(() => {})
        throw new Error('请选择 4 MB 以内的图片。')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}

export function appearanceStore(ctx, directory, route) {
  let sharp
  const packageIcons = new Map()
  const packageFiles = new Map()
  let iconBytes = 0
  function loadImageLibrary() {
    if (!sharp) {
      const anchor = pathToFileURL(ctx.profileContext.installAnchor).href
      const runtime = ctx.pluginPackages.packageOf('@deepseek-ai/dsh-attachment-local', anchor)
      if (!runtime) throw new Error('当前 DSH 缺少图片处理组件。')
      sharp = createRequire(runtime.manifestPath)('sharp')
    }
    return sharp
  }

  function icon(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(iconLimit / 3) * 4 + 40) return
    const parsed = iconPattern.exec(value)
    if (!parsed) return
    const [, type, base64] = parsed
    const key = artKey('icon', value)
    let cached = packageIcons.get(key)
    if (cached) packageIcons.delete(key)
    else {
      const bytes = Buffer.from(base64, 'base64')
      if (!bytes.length || bytes.length > iconLimit) return
      cached = { bytes, type }
      iconBytes += bytes.length
    }
    packageIcons.set(key, cached)
    while (iconBytes > 32 * 1024 * 1024) {
      const [oldest, image] = packageIcons.entries().next().value
      iconBytes -= image.bytes.length
      packageIcons.delete(oldest)
    }
    return route + '?' + new URLSearchParams({ icon: key })
  }

  function fileArtwork(kind, pkg, path) {
    if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\') || /^[\w+.-]+:/.test(path)) return
    const format = artworkTypes.get(extname(path).toLowerCase())
    if (!format) return
    const root = realpathSync(pkg.dir ?? dirname(pkg.manifestPath))
    const filename = realpathSync(resolve(root, path))
    const inside = relative(root, filename)
    if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) return
    const stat = statSync(filename, { bigint: true })
    if (!stat.isFile() || stat.size > imageLimit) return
    const revision = revisionOf(stat)
    const field = kind === 'hero' ? 'portrait' : 'equipment'
    const key = artKey(field, JSON.stringify([filename, revision]))
    packageFiles.delete(key)
    packageFiles.set(key, { filename, revision, format, kind, field })
    if (packageFiles.size > 4096) packageFiles.delete(packageFiles.keys().next().value)
    return route + '?' + new URLSearchParams({ [field]: key })
  }

  function packageArtwork() {
    const packages = new Map()
    const artwork = new Map()
    function packageFor({ moduleName, baseUrl }) {
      const key = JSON.stringify([moduleName, baseUrl])
      if (!packages.has(key)) {
        try { packages.set(key, loadoutPackage(ctx, moduleName, baseUrl)) }
        catch { packages.set(key, undefined) }
      }
      return packages.get(key)
    }
    function candidates(modules, kind, field, id) {
      const found = new Set()
      for (const module of modules) {
        if (!module?.moduleName) continue
        const pkg = packageFor(module)
        const declaration = pkg?.manifest?.dsh?.loadout?.[field]
        const path = id === undefined ? declaration : declaration && Object.hasOwn(declaration, id) && declaration[id]
        if (typeof path !== 'string') continue
        const art = JSON.stringify([kind, pkg.manifestPath, path])
        if (!artwork.has(art)) {
          try { artwork.set(art, fileArtwork(kind, pkg, path)) }
          catch { artwork.set(art, undefined) }
        }
        const url = artwork.get(art)
        if (url) found.add(url)
      }
      return found
    }
    function unique(values) {
      if (values.size === 1) return values.values().next().value
    }
    return {
      portrait(id, modules = []) {
        return unique(candidates([presetDeclarer(ctx, id)], 'hero', 'portraits', id))
          ?? candidates(modules, 'hero', 'portraits', id).values().next().value
      },
      gear(modules) { return unique(candidates(modules, 'gear', 'equipmentArt')) },
      tool(name, modules) { return unique(candidates(modules, 'gear', 'toolArt', name)) },
    }
  }

  function imageResponse(bytes, type) {
    return new Response(bytes, { headers: {
      'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    } })
  }

  async function index() {
    const revisions = new Map()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      entries = []
    }
    await Promise.all(entries.filter(entry => entry.isFile() && filePattern.test(entry.name)).map(async entry => {
      try {
        const stat = await lstat(join(directory, entry.name), { bigint: true })
        if (stat.isFile() && stat.size <= imageLimit) revisions.set(entry.name.slice(0, -5), revisionOf(stat))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }))
    return (kind, id) => {
      const key = artKey(kind, id)
      const revision = revisions.get(key)
      if (revision) return route + '?' + new URLSearchParams({ key, revision })
    }
  }

  async function image(request) {
    const query = new URL(request.url).searchParams
    if (query.has('icon')) {
      const image = packageIcons.get(query.get('icon'))
      return image ? imageResponse(image.bytes, image.type) : new Response(null, { status: 404 })
    }
    const field = query.has('portrait') ? 'portrait' : query.has('equipment') ? 'equipment' : undefined
    if (field) {
      const ref = packageFiles.get(query.get(field))
      if (ref?.field !== field) return new Response(null, { status: 404 })
      let file
      try {
        if (await realpath(ref.filename) !== ref.filename) return new Response(null, { status: 404 })
        file = await open(ref.filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        const stat = await file.stat({ bigint: true })
        if (!stat.isFile() || stat.size > imageLimit || revisionOf(stat) !== ref.revision) return new Response(null, { status: 404 })
        const bytes = await file.readFile()
        const matchesFormat = ref.format === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ref.format === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        if (bytes.length > imageLimit || !matchesFormat) return new Response(null, { status: 404 })
        return imageResponse(await normalize(ref.kind, { bytes, declared: ref.format }), mediaType)
      } catch {
        return new Response(null, { status: 404 })
      } finally {
        await file?.close()
      }
    }
    const key = query.get('key')
    if (!/^[a-f0-9]{32}$/.test(key ?? '')) return new Response(null, { status: 404 })
    let file
    try {
      file = await open(join(directory, key + '.webp'), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      const stat = await file.stat({ bigint: true })
      if (!stat.isFile() || stat.size > imageLimit || query.get('revision') !== revisionOf(stat)) {
        return new Response(null, { status: 404 })
      }
      const bytes = await file.readFile()
      return imageResponse(bytes, mediaType)
    } catch (error) {
      if (!['ENOENT', 'ELOOP'].includes(error.code)) throw error
      return new Response(null, { status: 404 })
    } finally {
      await file?.close()
    }
  }

  async function normalize(kind, { bytes, declared }) {
    const decode = loadImageLibrary()
    try {
      const source = decode(bytes, { limitInputPixels: 16_000_000, failOn: 'error' })
      const metadata = await source.metadata()
      if (metadata.format !== declared || (metadata.pages ?? 1) > 1) throw new Error('unsupported image')
      const size = kind === 'hero' ? 1200 : 320
      return await source.rotate().resize({
        width: size, height: size, fit: 'inside', withoutEnlargement: true,
      }).webp({ quality: 86 }).toBuffer()
    } catch {
      throw new Error('无法读取此图片。请选择静态 PNG、JPEG 或 WebP，且像素不超过 1600 万。')
    }
  }

  async function save(kind, id, input, signal) {
    const webp = await normalize(kind, input)
    signal.throwIfAborted()
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const target = join(directory, artKey(kind, id) + '.webp')
    const temp = target + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temp, webp, { mode: 0o600, flag: 'wx', signal })
      signal.throwIfAborted()
      await rename(temp, target)
    } finally {
      await rm(temp, { force: true })
    }
  }

  function reset(kind, id) {
    return rm(join(directory, artKey(kind, id) + '.webp'), { force: true })
  }

  return { index, image, save, reset, icon, packageArtwork }
}
