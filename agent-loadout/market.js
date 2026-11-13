import { installStandalone, reviewStandalone } from './standalone-installer.js'

export const marketBundle = '@deepseek-ai/dsh-experimental-plugin-market-bundle'
export const communityIndex = 'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json'

function label(value) {
  if (typeof value === 'string') return value
  return value?.['zh-cn'] ?? value?.['zh-hans'] ?? value?.zh ?? value?.en ?? Object.values(value ?? {})[0]
}

function sourceSummary(source) {
  return { url: source.url, title: label(source.title), error: source.error }
}

function marketCard(entry) {
  return {
    name: entry.name,
    title: label(entry.title) ?? entry.name,
    summary: label(entry.description),
    author: entry.author,
    installation: entry.installation.status,
    installedVersion: entry.installation.installedVersion,
    defaultVersion: entry.defaultVersion,
    versions: entry.versions.map(({ version, source, install, compatibility, engines }) => ({
      version, source, spec: install.spec, registry: install.registry,
      compatible: compatibility.compatible || compatibility.exempted === true,
      exemption: compatibility.exempted === true,
      runtimeVersion: compatibility.runtimeVersion,
      requirements: compatibility.requirements ?? (engines?.dsh ? { 'engines.dsh': engines.dsh } : undefined),
    })),
  }
}

export function marketActions(ctx, lifetime) {
  let adding = Promise.resolve()
  const installing = new Set()

  async function indexes() {
    const market = ctx.get('pluginMarket')
    if (market) return { available: true, sources: (await market.listIndexes()).map(sourceSummary), communityIndex }
    const manager = ctx.get('pluginManager')
    const bundle = manager && (await manager.listBundles()).find(item => item.name === marketBundle)
    const canEnable = bundle && !bundle.enabled && !bundle.readOnlyReason && bundle.availability !== 'missing'
    return { available: false, enableId: canEnable ? 'bundle:' + bundle.name : undefined }
  }

  function add({ url }) {
    if (typeof url !== 'string' || !url.trim()) throw new Error('请输入插件索引网址。')
    const result = adding.then(async () => {
      const market = ctx.get('pluginMarket')
      if (!market) throw new Error('当前 Profile 尚未启用插件市场。')
      const sources = await market.listIndexes()
      const urls = sources.map(source => source.url)
      if (!urls.includes(url.trim())) await market.setIndexes([...urls, url.trim()])
      return indexes()
    })
    adding = result.catch(() => {})
    return result
  }

  async function search({ url, query = '', offset = 0, refresh = false }) {
    const market = ctx.get('pluginMarket')
    if (!market) throw new Error('当前 Profile 尚未启用插件市场。')
    if (typeof url !== 'string' || typeof query !== 'string' || !Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('装备市场查询无效。')
    }
    const result = await market.search(url, {
      text: query, offset, limit: 8, sort: { kind: query.trim() ? 'relevance' : 'index' }, refresh: refresh === true,
    })
    return { title: label(result.title), entries: result.entries.map(marketCard), nextOffset: result.nextOffset, total: result.total }
  }

  async function checkedSource(manager, spec, registry, signal) {
    const checked = await manager.inspect(spec, { registry }, signal)
    if (checked.status !== 'accepted') throw new Error(checked.reason)
    return checked
  }

  async function installChecked(manager, spec, registry, approvedBuilds, signal, onStandalone) {
    signal?.throwIfAborted()
    const result = await manager.installBundle(spec, {
      registry, enabled: true, saveExact: true, approvedBuilds,
    })
    if (result.application === 'applied' || result.application === 'restart-required') {
      return { application: result.application, bundle: result.bundle, version: result.version }
    }
    if (result.pendingBuilds?.length) {
      return { application: 'approval-required', pendingBuilds: result.pendingBuilds }
    }
    if (result.error?.code === 'not-bundle' && onStandalone) return onStandalone()
    const diagnostic = result.error?.diagnostic
    if (diagnostic?.includes('ERR_PNPM_ADDING_TO_ROOT')) {
      throw new Error('当前 Profile 的 pnpm 设置禁止向工作区根目录安装。请按安装说明设置 ignore-workspace-root-check 后重试。')
    }
    throw new Error(diagnostic ?? 'DSH 未能安装此装备。')
  }

  function scriptApproval(value) {
    if (value === undefined) return
    if (!Array.isArray(value) || !value.length || value.some(name => typeof name !== 'string' || !name.trim())) {
      throw new Error('安装脚本选择无效。')
    }
    return value
  }

  async function install({ url, name, version, spec, registry, approvedBuilds }, signal) {
    const market = ctx.get('pluginMarket')
    const manager = ctx.get('pluginManager')
    if (!market || !manager) throw new Error('当前 Profile 无法从装备市场安装。')
    if (![url, name, version, spec].every(value => typeof value === 'string' && value.length)) {
      throw new Error('装备安装来源无效。')
    }
    if (installing.has(name)) throw new Error('这件装备正在安装。')
    installing.add(name)
    try {
      const entry = await market.entry(url, name)
      if (!entry) throw new Error('装备已从索引下架，请刷新市场。')
      if (entry.installation.status !== 'not-installed') return { application: 'already-installed' }
      const selected = entry.versions.find(item => item.version === version)
      if (!selected || selected.install.spec !== spec || selected.install.registry !== registry) {
        throw new Error('装备安装来源已变化，请刷新市场后再确认。')
      }
      if (!selected.compatibility.compatible && !selected.compatibility.exempted) {
        throw new Error('此装备版本与当前 DSH 不兼容。')
      }
      const checked = await checkedSource(manager, selected.install.spec, selected.install.registry, signal)
      if (checked.kind === 'registry' && (checked.name !== name || checked.version !== version)) {
        throw new Error('安装来源返回了不同的包或版本。')
      }
      return await installChecked(manager, selected.install.spec, checked.registry ?? selected.install.registry,
        scriptApproval(approvedBuilds), signal)
    } finally {
      installing.delete(name)
    }
  }

  async function reviewSource({ spec, registry }, signal) {
    const manager = ctx.get('pluginManager')
    if (!manager) throw new Error('当前 Profile 无法安装插件。')
    if (typeof spec !== 'string' || !spec.trim() || (registry !== undefined && typeof registry !== 'string')) {
      throw new Error('请输入插件包名、Git 地址、安装包链接或本机绝对路径。')
    }
    const requested = spec.trim()
    const requestedRegistry = registry?.trim() || undefined
    const checked = await manager.inspect(requested, { registry: requestedRegistry }, signal)
    if (checked.status === 'refused') {
      if (checked.problem !== 'not-a-bundle') throw new Error(checked.reason)
      return {
        requested, requestedRegistry,
        ...await reviewStandalone(ctx, requested, requestedRegistry, checked, signal),
      }
    }
    if (checked.kind === 'registry' && (!checked.name || !checked.version)) {
      throw new Error('安装来源没有提供确切的包名和版本。')
    }
    return {
      requested, requestedRegistry, kind: checked.kind, name: checked.name, version: checked.version,
      description: checked.description, registry: checked.registry, host: checked.host,
      spec: checked.kind === 'registry' ? checked.name + '@' + checked.version : requested,
    }
  }

  async function importPlugin({ source, approvedBuilds }, signal) {
    const manager = ctx.get('pluginManager')
    if (!manager || !source || typeof source !== 'object') throw new Error('请先核对安装来源。')
    const checked = await reviewSource({ spec: source.requested, registry: source.requestedRegistry }, signal)
    if (['kind', 'name', 'version', 'registry', 'spec', 'standalone'].some(key => checked[key] !== source[key])
      || checked.archive?.url !== source.archive?.url || checked.archive?.integrity !== source.archive?.integrity) {
      throw new Error('装备安装来源已变化，请重新核对。')
    }
    const key = checked.name ?? checked.spec
    if (installing.has(key)) throw new Error('这件装备正在安装。')
    installing.add(key)
    try {
      const cancellation = signal && lifetime ? AbortSignal.any([signal, lifetime]) : signal ?? lifetime
      if (checked.standalone) {
        return await installStandalone(ctx, checked, cancellation)
      }
      const opaque = checked.kind === 'git' || checked.kind === 'tarball'
      return await installChecked(manager, checked.spec, checked.registry, scriptApproval(approvedBuilds), signal,
        opaque ? () => installStandalone(ctx, checked, cancellation) : undefined)
    } finally {
      installing.delete(key)
    }
  }

  return { indexes, add, search, install, reviewSource, importPlugin }
}
