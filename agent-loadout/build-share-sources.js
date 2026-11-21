import { realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { shareId, shareModuleName, sharePackageName, shareVersion } from './build-sharing.js'
import { declaredModules } from './package-actions.js'

const presetModule = '@deepseek-ai/dsh-agent-preset'
const stockPackage = '@deepseek-ai/dsh-web-app'
const declaringPackage = 'dsh-agent-loadout'
const hostedPresets = new Set(['standard', 'minimal', 'ptc', 'cordis'])
const portableProfileFields = new Set(['id', 'name', 'config', 'disabled', 'group'])

function installedPath(path) {
  return path.split(sep).includes('node_modules')
}

function packageIdentity(pkg) {
  if (!pkg || !sharePackageName(pkg.name) || !shareVersion(pkg.version ?? pkg.manifest?.version)) return
  return { package: pkg.name, version: pkg.version ?? pkg.manifest.version }
}

export function buildShareSources(ctx, ecosystem, { loadOverlayPatches, composeEntries }) {
  const manifests = new Map()
  const heroes = new Map()
  const declarations = new Map()
  const anchor = ctx.profileContext.installAnchor
  const installBase = anchor && pathToFileURL(anchor).href
  const linkedRoots = ctx.pluginPackages.resolution?.linkedRoots ?? []

  function namedPackage(moduleName, baseUrl = ctx.baseUrl) {
    const key = JSON.stringify([moduleName, baseUrl])
    if (!manifests.has(key)) {
      let pkg
      try {
        const candidate = ctx.pluginPackages.packageOf(moduleName, baseUrl)
        if (packageIdentity(candidate) && shareModuleName(moduleName, candidate.name)) {
          const path = realpathSync(candidate.manifestPath)
          if (installedPath(path) && !linkedRoots.some(root =>
            typeof root.realPath === 'string' && path.startsWith(root.realPath + sep))) pkg = candidate
        }
      } catch {
        // A missing or locally linked module has no portable package identity.
      }
      manifests.set(key, pkg)
    }
    return manifests.get(key)
  }

  function packageFromBase(baseUrl) {
    if (!baseUrl?.startsWith('file:')) return
    const path = fileURLToPath(baseUrl)
    if (!installedPath(path)) return
    const segments = path.split(sep)
    const start = segments.lastIndexOf('node_modules') + 1
    const name = segments[start]?.startsWith('@') ? segments.slice(start, start + 2).join('/') : segments[start]
    if (!sharePackageName(name)) return
    const pkg = namedPackage(name, baseUrl)
    const root = pkg?.manifestPath && dirname(realpathSync(pkg.manifestPath))
    if (root && realpathSync(path).startsWith(root + sep)) return pkg
  }

  function ownsDeclaration(pkg, patch, entry) {
    if (!pkg || typeof patch !== 'string' || !entry?.options ||
      typeof loadOverlayPatches !== 'function' || typeof composeEntries !== 'function') return false
    try {
      const root = dirname(realpathSync(pkg.manifestPath))
      const key = resolve(root, patch)
      if (!declarations.has(key)) {
        const path = realpathSync(key)
        if (!path.startsWith(root + sep)) return false
        declarations.set(key, composeEntries([loadOverlayPatches('dsh', path)]))
      }
      const rows = declarations.get(key)
      return rows.some(row => row.name === presetModule && row.id === entry.options.id &&
        isDeepStrictEqual(row, entry.options))
    } catch {
      return false
    }
  }

  function declareHero(id) {
    if (!shareId(id)) return
    // The generic preset registrar is also used by local overrides. Verify the packaged declaration itself.
    const definition = ctx.agentPresets.definitions?.get(id)
    const entry = definition?.context?.fiber?.entry
    if (entry?.options.name !== presetModule || !isDeepStrictEqual(definition.config, entry.options.config)) return
    if (hostedPresets.has(id)) {
      const stock = namedPackage(stockPackage, installBase)
      if (ownsDeclaration(stock, 'presets/' + id + '.patch.yml', entry)) return packageIdentity(stock)
    }
    const owners = []
    for (const bundle of ecosystem.bundleRows ?? []) {
      if (!bundle.enabled || !bundle.rows?.some(row => row.entryId === entry.id && row.moduleName === presetModule)) continue
      const pkg = namedPackage(bundle.name) ??
        (bundle.name === declaringPackage && ctx.pluginPackages.packageOf(declaringPackage, ctx.baseUrl))
      const patch = pkg?.manifest?.dsh?.bundle?.patch
      if (ownsDeclaration(pkg, patch, entry)) owners.push(packageIdentity(pkg))
    }
    if (owners.length === 1) return owners[0]
  }

  function hero(id) {
    if (!heroes.has(id)) heroes.set(id, declareHero(id))
    const owner = heroes.get(id)
    return owner && { id, owner }
  }

  function heroStatus(ref) {
    const preset = ecosystem.presets.find(candidate => candidate.id === ref.id)
    const current = preset && hero(ref.id)
    if (!preset) return { state: 'missing', reason: '接收方没有这个预设。' }
    if (!isDeepStrictEqual(current, ref)) return { state: 'different', reason: '当前预设的来源或版本与分享码不同。' }
    if (preset.broken) return { state: 'unavailable', reason: '当前预设无法加载，请在英雄图鉴查看原因。' }
    return { state: 'ready', preset }
  }

  function unitsFor(ref) {
    return (ecosystem.unitsByPreset.get(ref.id) ?? []).filter(unit => unit.active && unit.declaration && !unit.boundTool)
  }

  function slot(id, presetHint) {
    const item = ecosystem.equipment.get(id)
    if (!item?.declaration || item.sessionOnly || item.sessionRecipe || item.boundTool) return
    const presetIds = presetHint ? [presetHint] : [...item.sources].sort()
    for (const presetId of presetIds) {
      const ref = hero(presetId)
      if (!ref) continue
      const units = unitsFor(ref)
      const entry = units.find(unit => unit.id === id)?.declaration.id
      if (shareId(entry) && units.filter(unit => unit.declaration.id === entry).length === 1) {
        return { kind: 'preset', hero: ref, entry }
      }
    }
  }

  function profile(id) {
    const source = ecosystem.profileSources.get(id)
    const entry = source?.entry
    const row = entry?.options
    if (!source?.active || !shareId(row?.id) || row.group || Object.keys(row).some(key => !portableProfileFields.has(key)) ||
      (row.config != null && (Object.getPrototypeOf(row.config) !== Object.prototype || Object.keys(row.config).length))) return
    const owner = packageIdentity(namedPackage(row.name, entry.parent?.tree.ctx.baseUrl))
    if (owner) return { kind: 'profile', owner, module: row.name, entry: row.id }
  }

  function resolveSlot(source) {
    const status = heroStatus(source.hero)
    if (status.state !== 'ready') return status
    const units = unitsFor(source.hero).filter(unit => unit.declaration.id === source.entry)
    return units.length === 1 ? { state: 'ready', id: units[0].id }
      : { state: 'different', reason: '这个来源预设的装备位置已变化。' }
  }

  function tool(item, sourceId) {
    if (!item || !shareId(item.name)) return
    return profile(sourceId) ?? slot(sourceId)
  }

  function resolveTool(recipe) {
    const item = ecosystem.equipment.get(recipe.schema)
    if (item?.kind !== 'tool' || item.name !== recipe.tool) {
      const sameName = [...ecosystem.equipment.values()].some(candidate => candidate.kind === 'tool' && candidate.name === recipe.tool)
      return sameName ? { state: 'different', reason: '已有同名工具，但接口与分享码不同。' }
        : { state: 'missing', reason: '没有发现分享码里的工具。' }
    }
    if (recipe.source.kind === 'preset') {
      const source = resolveSlot(recipe.source)
      if (source.state !== 'ready') return source
      if (item.providers.includes(source.id) || item.liveProviders.has(source.id)) return { state: 'ready', id: item.id, sourceId: source.id }
    } else {
      const matching = [...item.profileProviders.keys()].filter(id => isDeepStrictEqual(profile(id), recipe.source))
      if (matching.length === 1) return { state: 'ready', id: item.id, sourceId: matching[0] }
    }
    return { state: 'different', reason: '已有同名工具，但没有找到分享码指定的来源。' }
  }

  function moduleOwners(unit) {
    return declaredModules(unit.declaration ?? unit.row, unit.baseUrl).map(({ moduleName, baseUrl }) => {
      const pkg = namedPackage(moduleName, baseUrl)
      if (pkg) return packageIdentity(pkg)
      try {
        const url = new URL(moduleName, baseUrl)
        return packageIdentity(packageFromBase(url.href))
      } catch {
        // A local companion cannot be reconstructed from the receiving Profile.
      }
    })
  }

  function packageStatus(ref) {
    const installed = packageIdentity(namedPackage(ref.package) ?? namedPackage(ref.package, installBase))
    if (!installed) return { state: 'missing', reason: '接收方缺少这个插件包。' }
    return installed.version === ref.version ? { state: 'ready' }
      : { state: 'different', reason: '当前已装版本与分享码不同。', currentVersion: installed.version }
  }

  return { hero, heroStatus, slot, tool, resolveSlot, resolveTool, moduleOwners, packageStatus,
    packageFor: (moduleName, baseUrl) => packageIdentity(namedPackage(moduleName, baseUrl) ?? namedPackage(moduleName, installBase)) }
}
