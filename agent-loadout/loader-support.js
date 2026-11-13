import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

export function jsonFingerprint(value) {
  try {
    const serialized = JSON.stringify(value, (_key, field) => {
      if (!field || Object.getPrototypeOf(field) !== Object.prototype) return field
      return Object.fromEntries(Object.keys(field).sort().map(key => [key, field[key]]))
    })
    if (isDeepStrictEqual(value, JSON.parse(serialized))) {
      return createHash('sha256').update(serialized).digest('hex').slice(0, 24)
    }
  } catch {
    // A declaration backed by process-local values has no persistent identity.
  }
}

function requireFrom(ctx, name) {
  const anchor = ctx.get('profileContext')?.installAnchor
  const runtime = anchor && ctx.pluginPackages.packageOf(name, pathToFileURL(anchor).href)
  const pkg = runtime ?? ctx.pluginPackages.packageOf(name, ctx.baseUrl)
  if (!pkg) throw new Error('DSH 缺少 ' + name + '。')
  return createRequire(pkg.manifestPath)
}

export function runtimeModule(ctx, name, subpath = '') {
  return import(pathToFileURL(requireFrom(ctx, name).resolve(name + subpath)).href)
}

export async function entryYaml(ctx) {
  const name = '@deepseek-ai/cordis-plugin-include'
  const require = requireFrom(ctx, name)
  const { entryListSchema, applyEntryPatches } = await import(pathToFileURL(require.resolve(name)).href)
  const yaml = require('js-yaml')
  return { parse: text => yaml.load(text, { schema: entryListSchema }), dump: yaml.dump, applyEntryPatches }
}
