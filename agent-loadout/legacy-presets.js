import { createHash } from 'node:crypto'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { entryYaml, jsonFingerprint, runtimeModule } from './loader-support.js'

const moduleNames = new WeakMap()
const oldWorkflow = '@deepseek-ai/dsh-workflow-worker-thread'
const workflow = '@deepseek-ai/dsh-workflow-ptc'
const subagentControl = '@deepseek-ai/dsh-tool-subagent-control'
const oldListAgents = subagentControl + '/list-agents'
const integratedListAgentsVersions = new Set(['0.2.2-rc.1', '0.2.2-rc.2'])

export function presetModuleName(ctx, name) {
  return moduleNames.get(ctx)?.get(name) ?? name
}

function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && id === id.trim()
    && id !== '.' && id !== '..' && !/[\\/\p{Cc}]/u.test(id)
}

function fileKey(id) {
  return createHash('sha256').update(id).digest('hex').slice(0, 24)
}

function entries(directory) {
  return readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return []
  })
}

function moduleConfigurations(rows, activeOnly) {
  const modules = new Map()
  function collect(list) {
    for (const row of list) {
      if (activeOnly && row.disabled === true) continue
      if (row.group === true && Array.isArray(row.config)) collect(row.config)
      else {
        if (!modules.has(row.name)) modules.set(row.name, [])
        modules.get(row.name).push(row)
      }
    }
  }
  collect(rows)
  return modules
}

function changesFrom(previous, next, missing) {
  const before = moduleConfigurations(previous.definition.plugins, true)
  const after = moduleConfigurations(next.definition.plugins, true)
  const unavailable = new Set(missing)
  const skipped = new Set(previous.skipped)
  const available = [...after.keys()].filter(name => !unavailable.has(name))
  return {
    added: available.filter(name => !before.has(name) && !skipped.has(name)),
    changed: available.filter(name => before.has(name) && jsonFingerprint(before.get(name)) !== jsonFingerprint(after.get(name))),
    removed: [...before.keys()].filter(name => !after.has(name)),
    restoring: available.filter(name => skipped.has(name)),
  }
}

export function legacyPresets(ctx, directory, saveEntry, warn) {
  const root = join(ctx.profileContext.home, '.agent-presets')
  const saved = join(directory, 'legacy-presets')
  const mounted = new Map()
  const pending = new Map()
  const aliases = new Map()
  moduleNames.set(ctx, aliases)
  let support
  let restoring
  let closed = false

  function nativeSupport() {
    return support ??= Promise.all([entryYaml(ctx), runtimeModule(ctx, '@deepseek-ai/dsh-agent-preset-registry')])
  }

  function registered(id) {
    return ctx.agentPresets.definitions.has(id)
  }

  async function source(id) {
    if (!validId(id)) throw new Error('旧预设目录名无效。')
    const folder = await realpath(join(root, id))
    const [{ parse }, { entryListProblem }] = await nativeSupport()
    const [metadata, composition] = await Promise.all([
      readFile(join(folder, 'preset.yml'), 'utf8'), readFile(join(folder, 'agent.cordis.yml'), 'utf8'),
    ])
    const meta = parse(metadata)
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('preset.yml 需要包含预设名称和说明。')
    const plugins = parse(composition)
    const problem = entryListProblem(plugins, 'agent.cordis.yml')
    if (problem) throw new Error(problem)
    const definition = { id, name: typeof meta.name === 'string' && meta.name.trim() || id,
      ...(typeof meta.description === 'string' && { description: meta.description }),
      ...(Number.isFinite(meta.order) && { order: meta.order }), plugins }
    const baseUrl = pathToFileURL(folder + sep).href
    const record = { version: 1, baseUrl, definition }
    const revision = jsonFingerprint(record)
    if (!revision) throw new Error('这份旧预设含有无法保存的配置。')
    return { record, folder, revision }
  }

  async function list() {
    await ready
    const presets = await Promise.all((await entries(root)).filter(entry => validId(entry.name) && (entry.isDirectory() || entry.isSymbolicLink()))
      .sort((a, b) => a.name.localeCompare(b.name)).map(async ({ name: id }) => {
        try {
          const folder = await realpath(join(root, id))
          const [{ parse }] = await nativeSupport()
          const meta = parse(await readFile(join(folder, 'preset.yml'), 'utf8'))
          return { id, name: typeof meta?.name === 'string' && meta.name.trim() || id, registered: registered(id),
            managed: mounted.has(id) }
        } catch (error) {
          if (error.code !== 'ENOENT') return { id, name: id, registered: registered(id), managed: mounted.has(id) }
        }
      }))
    return presets.filter(Boolean)
  }

  async function review(id, previous) {
    const { record, folder, revision } = await source(id)
    const replacements = await adaptNativeModules(record)
    if (replacements.length) record.replacements = replacements
    const { missing, plugins } = await resolveRows(record)
    return { record, folder, missing, replacements,
      revision: jsonFingerprint([revision, plugins, missing, replacements, previous ?? null]) }
  }

  async function preview(id) {
    await ready
    const previous = mounted.get(id)?.record
    const { record, folder, missing, replacements, revision } = await review(id, previous)
    const { name, description, plugins } = record.definition
    return { id, name, description, folder, revision, missing, replacements,
      modules: [...moduleConfigurations(plugins, false).keys()], registered: registered(id), managed: Boolean(previous),
      ...(previous && { previousSkipped: previous.skipped ?? [], changes: changesFrom(previous, record, missing) }) }
  }

  async function adaptNativeModules(record) {
    const { getDshRuntimeVersion, resolvePluginResource } = await runtimeModule(ctx, '@deepseek-ai/dsh-app-boot')
    const integratedListAgents = integratedListAgentsVersions.has(getDshRuntimeVersion())
    const replacements = []
    const cache = new Map()
    function available(name) {
      if (!cache.has(name)) {
        let found = false
        for (const base of [record.baseUrl, ctx.baseUrl]) {
          try { resolvePluginResource(name, base); found = true; break } catch { /* Try the Profile base. */ }
        }
        cache.set(name, found)
      }
      return cache.get(name)
    }
    function adapt(rows) {
      return rows.map(row => {
        if (row.disabled === true) return row
        if (row.group === true && Array.isArray(row.config)) return { ...row, config: adapt(row.config) }
        if (row.disabled !== undefined && row.disabled !== false) return row
        const config = row.config ?? {}
        if (typeof config !== 'object' || Array.isArray(config)) return row
        if (row.name === oldWorkflow && Object.keys(config).every(key => key === 'provider' && typeof config.provider === 'string')
          && !rows.some(item => item.name === workflow && item.disabled !== true) && !available(oldWorkflow) && available(workflow)) {
          replacements.push({ from: oldWorkflow, to: workflow })
          return { ...row, name: workflow }
        }
        if (row.name === oldListAgents && Object.keys(config).length === 0 && integratedListAgents
          && rows.some(item => item.name === subagentControl && (item.disabled === undefined || item.disabled === false))
          && !available(oldListAgents) && available(subagentControl)) {
          replacements.push({ from: oldListAgents, to: subagentControl, included: true })
          return { ...row, disabled: true }
        }
        return row
      })
    }
    record.definition.plugins = adapt(record.definition.plugins)
    return replacements
  }

  async function resolveRows(record, onAlias) {
    const { resolvePluginResource } = await runtimeModule(ctx, '@deepseek-ai/dsh-app-boot')
    const missing = new Set()
    function resolve(name, base) {
      try { return pathToFileURL(resolvePluginResource(name, base)).href } catch { return undefined }
    }
    function bind(row, inactive) {
      const disabled = inactive || row.disabled === true
      if (row.group === true && Array.isArray(row.config)) return { ...row, config: row.config.map(child => bind(child, disabled)) }
      if (row.name.startsWith('cordis:') || resolve(row.name, record.baseUrl)) return row
      if (!/^(?:[./#]|[a-z][a-z\d+.-]*:)/iu.test(row.name)) {
        const url = resolve(row.name, ctx.baseUrl)
        if (url) {
          onAlias?.(url, row.name)
          return { ...row, name: url }
        }
      }
      if (!disabled) missing.add(row.name)
      return row
    }
    const plugins = record.definition.plugins.map(row => bind(row, false))
    return { plugins, missing: [...missing] }
  }

  async function mount(record) {
    const { plugins } = await resolveRows(record, (url, name) => aliases.set(url, name))
    return ctx.extend({ baseUrl: record.baseUrl }).agentPresets.register({ ...record.definition, plugins })
  }

  function disableWaitingRows(record) {
    const tree = ctx.agentPresets.definitions.get(record.definition.id)?.generation?.mount.tree
    if (!tree) return false
    const waiting = new Set([...tree.entries()].filter(entry => !entry.disabled && entry.fiber &&
      Object.keys(entry.fiber.inject).some(name => entry.fiber.ctx.get(name) === undefined)).map(entry => entry.options))
    const skipped = new Set(record.skipped)
    let changed = false
    function disable(rows, live) {
      return rows.map((row, index) => {
        const active = live?.[index]
        if (row.group === true && Array.isArray(row.config)) return { ...row, config: disable(row.config, active?.config) }
        if (row.disabled === true || !waiting.has(active)) return row
        changed = true
        skipped.add(row.name)
        return { ...row, disabled: true }
      })
    }
    record.definition.plugins = disable(record.definition.plugins, tree.root.data)
    record.skipped = [...skipped]
    return changed
  }

  function restoredModules(record, previous) {
    if (!previous?.skipped?.length) return []
    const tree = ctx.agentPresets.definitions.get(record.definition.id)?.generation?.mount.tree
    const active = new Set(tree && [...tree.entries()].filter(entry => !entry.disabled && entry.fiber?.state === 2)
      .map(entry => presetModuleName(ctx, entry.options.name)))
    const replaced = new Map(record.replacements?.filter(item => !item.included).map(item => [item.from, item.to]))
    return previous.skipped.filter(name => !record.skipped?.includes(name) && active.has(replaced.get(name) ?? name))
  }

  async function restore() {
    for (const file of await entries(saved)) {
      if (closed) break
      if (!file.isFile() || !/^[a-f0-9]{24}\.json$/.test(file.name)) continue
      try {
        const record = JSON.parse(await readFile(join(saved, file.name), 'utf8'))
        const id = record?.definition?.id
        const [, { entryListProblem }] = await nativeSupport()
        if (record?.version !== 1 || !validId(id) || file.name !== fileKey(id) + '.json'
          || typeof record.baseUrl !== 'string' || !record.baseUrl.startsWith('file:') || entryListProblem(record.definition.plugins)) {
          throw new Error('Invalid saved preset')
        }
        if (closed || registered(id)) continue
        mounted.set(id, { record, dispose: await mount(record) })
      } catch {
        warn(file.name)
      }
    }
  }

  // Native definitions take precedence, including Profile plugins that activate after this one.
  const ready = ctx.loader.await().then(() => {
    if (!closed) return restoring = restore()
  }).catch(() => warn('legacy-presets'))

  async function attach(id, revision, skipMissing, update = false) {
    await ready
    if (closed) throw new Error('备战大厅正在关闭，请重试。')
    if (!validId(id) || typeof revision !== 'string') throw new Error('请先查看旧预设。')
    if (pending.has(id)) throw new Error('此预设正在处理，请稍后刷新。')
    const previous = mounted.get(id)
    if (update && !previous) throw new Error('请选择当前 Profile 已接入的旧预设。')
    if (!update && registered(id)) return { id, alreadyRegistered: true }
    const work = (async () => {
      const { record, revision: current, missing } = await review(id, previous?.record)
      if (current !== revision) throw new Error('预设或插件已变化，请重新核对。')
      if (missing.length) {
        if (skipMissing !== true) throw new Error('请确认按当前可用插件接入。')
        const skipped = new Set(missing)
        const disable = row => row.group === true && Array.isArray(row.config) ? { ...row, config: row.config.map(disable) }
          : skipped.has(row.name) ? { ...row, disabled: true } : row
        record.definition.plugins = record.definition.plugins.map(disable)
        record.skipped = missing
      }
      if (closed) throw new Error('备战大厅正在关闭，请重试。')
      if (!update && registered(id)) return { id, alreadyRegistered: true }
      let dispose
      try {
        await previous?.dispose()
        dispose = await mount(record)
        let preset = await ctx.agentPresets.resolve(id)
        while (preset.broken && record.skipped?.length && disableWaitingRows(record)) {
          await dispose()
          dispose = await mount(record)
          preset = await ctx.agentPresets.resolve(id)
        }
        if (update && preset.broken) throw new Error('新配置加载失败，已保留原阵容。\n' + preset.broken)
        await saveEntry(saved, fileKey(id), record)
        mounted.set(id, { record, dispose })
        return { id, name: record.definition.name, broken: preset.broken, skipped: record.skipped,
          updated: update, replacements: record.replacements,
          restored: restoredModules(record, previous?.record) }
      } catch (error) {
        await dispose?.()
        if (previous) {
          try {
            mounted.set(id, { record: previous.record, dispose: await mount(previous.record) })
          } catch (rollback) {
            mounted.delete(id)
            warn(fileKey(id))
            throw new Error('新配置加载失败。重启 DSH 可重新读取已保存的原阵容。\n' + rollback.message)
          }
        }
        throw error
      }
    })()
    pending.set(id, work)
    try {
      return await work
    } finally {
      pending.delete(id)
    }
  }

  async function close() {
    closed = true
    await Promise.allSettled([restoring, ...pending.values()])
    await Promise.allSettled([...mounted.values()].map(item => item.dispose()))
  }

  return { ready, list, preview, attach, close,
    settle: () => Promise.allSettled(pending.values()),
    moduleName: name => aliases.get(name) ?? name, skipped: id => mounted.get(id)?.record.skipped,
    managed: id => mounted.has(id) }
}
