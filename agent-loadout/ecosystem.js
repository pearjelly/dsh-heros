import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { basename, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { agentPluginModule, isAgentPlugin } from './agent-plugins.js'
import { configuredEquipmentModule, isConfiguredEquipment } from './configured-equipment.js'
import { declaredIsolation } from './equipment-isolation.js'
import { presetModuleName } from './legacy-presets.js'
import { entryYaml, jsonFingerprint, runtimeModule } from './loader-support.js'
import { profileProviderActive, profileProviderId, scopeApi } from './tool-origins.js'
import { validToolModule } from './tool-discoveries.js'

const personaModule = '@deepseek-ai/dsh-persona'
const nativePrefix = '@deepseek-ai/dsh-'
const declarationsByScope = new WeakMap()
const stockToolProviders = new Map(Object.entries({
  'tool-ask-user': ['ask_user_question'],
  'tool-bash': ['bash'],
  'tool-bash-persistent': ['bash'],
  'tool-pwsh': ['pwsh'],
  'tool-pwsh-persistent': ['pwsh'],
  'tool-fs': ['read', 'write', 'edit', 'read_image'],
  'tool-fs-search': ['grep', 'glob'],
  'tool-web': ['web_search', 'web_fetch'],
  'tool-present': ['present'],
  'tool-jobs': ['job_list', 'job_kill', 'job_output'],
  'tool-todo': ['todo_write'],
  'tool-goal': ['get_goal', 'create_goal', 'update_goal'],
  'tool-schedule': ['schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete'],
  'tool-subagent-control': ['send_message', 'interrupt_agent'],
  'tool-subagent-control/list-agents': ['list_agents'],
  'tool-subagent': ['subagent_fork', 'subagent'],
  'plan-mode': ['exit_plan_mode'],
  'tool-cordis': ['cordis_inspect_list', 'cordis_inspect_query'],
  'plugin-manager/tools': ['plugin_manager'],
  'agent-tool-presentation': ['run_code'],
  'tool-executor-ptc': ['run_code'],
}).map(([module, tools]) => [nativePrefix + module, new Set(tools)]))

export function stockToolNames(module) {
  return [...(stockToolProviders.get(module) ?? [])]
}

export function moduleLabel(name) {
  if (name.startsWith(nativePrefix)) return name.slice(nativePrefix.length)
  if (name.startsWith('file:')) {
    try {
      return basename(fileURLToPath(name)).replace(/\.[cm]?[jt]s$/u, '')
    } catch {
      // Use the original URL segment if the loader supplied an unusual path.
    }
  }
  if (name.startsWith('file:') || name.startsWith('/') || name.startsWith('.')) {
    return name.split('/').at(-1).replace(/\.[cm]?[jt]s$/u, '')
  }
  return name
}

export function unitFingerprint(row) {
  const { id: _id, ...config } = row
  return createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 24)
}

export function childModules(row) {
  if (isConfiguredEquipment(row.name) && Array.isArray(row.config?.plugins)) {
    return row.config.plugins.flatMap(childModules)
  }
  return row.group === true && Array.isArray(row.config)
    ? row.config.flatMap(childModules)
    : [row.name]
}

function pluginTitle(row) {
  if (isConfiguredEquipment(row.name) && row.config?.sourceUnitId && row.config.plugins?.length === 1) {
    return pluginTitle(row.config.plugins[0])
  }
  if (row.group !== true) {
    const label = moduleLabel(row.name)
    return label === 'index' && row.id ? row.id : label
  }
  const names = childModules(row).map(moduleLabel)
  return row.id ?? names[0] ?? '插件组'
}

function moduleResolver(ctx) {
  const loader = ctx.loader.internal
  const targetBase = ctx.baseUrl
  const cache = new Map()
  function resolve(name, baseUrl) {
    try {
      return (loader?.version === 'v2'
        ? loader.resolveSync(baseUrl, { specifier: name, attributes: {} })
        : loader?.resolveSync(name, baseUrl, {}))?.url
    } catch {
      return undefined
    }
  }
  return (name, baseUrl) => {
    if (!baseUrl || name.startsWith('cordis:') || name.startsWith('file:') || name.startsWith('/')) return name
    const key = baseUrl + '\n' + name
    if (cache.has(key)) return cache.get(key)
    let result = name
    if (/^\.\.?\//u.test(name)) {
      result = resolve(name, baseUrl) ?? new URL(name, baseUrl).href
    } else if (baseUrl !== targetBase) {
      const source = resolve(name, baseUrl)
      if (source?.startsWith('file:') && source !== resolve(name, targetBase)) result = source
    }
    cache.set(key, result)
    return result
  }
}

function portableRow(declaration, baseUrl, resolveModule) {
  function resolve(row) {
    const name = isConfiguredEquipment(row.name) ? configuredEquipmentModule
      : isAgentPlugin(row.name) ? agentPluginModule : resolveModule(row.name, baseUrl)
    return {
      ...row, name,
      ...(row.group === true && Array.isArray(row.config) ? { config: row.config.map(resolve) } : {}),
    }
  }
  return resolve(declaredIsolation(declaration))
}

function agentPluginRecipe(row, baseUrl, resolveModule) {
  const recipe = { row: portableRow(row, baseUrl, resolveModule), ...(baseUrl ? { baseUrl } : {}) }
  try {
    const snapshot = JSON.parse(JSON.stringify(recipe))
    if (isDeepStrictEqual(recipe, snapshot)) return snapshot
  } catch {
    // Some live Loader configs are backed by process-local objects.
  }
}

function agentPluginUnit({ row, baseUrl }) {
  const { id: _id, ...config } = row
  const modules = childModules(row)
  return {
    id: 'plugin:' + unitFingerprint({ session: true, config, baseUrl }),
    row, modules, active: true, persona: modules.includes(personaModule),
    sessionRecipe: { row, ...(baseUrl ? { baseUrl } : {}) },
  }
}

export function configuredAgentUnits(plugins) {
  return plugins.filter(row => isAgentPlugin(row.name) && Array.isArray(row.config?.units))
    .flatMap(row => row.config.units.map(agentPluginUnit))
}

function sessionOnlyUnitId(entry) {
  return 'plugin:' + unitFingerprint({ entry: entry.id, name: entry.options.name, session: true })
}

export function activeAgentUnits(ctx, scope, resolveModule = moduleResolver(ctx)) {
  const units = ctx.get('agentLoadoutToolOrigins')?.unitModules(scope)
  return Array.from(units ?? [], ([entry, actionModules]) => {
    const recipe = agentPluginRecipe(entry.options, entry.parent.tree.ctx.baseUrl, resolveModule)
    if (recipe) return { ...agentPluginUnit(recipe), actionModules }
    const row = { id: entry.options.id, name: entry.options.name }
    return {
      id: sessionOnlyUnitId(entry),
      row, modules: childModules(entry.options), active: true, sessionOnly: true, actionModules,
    }
  })
}

function unitId(row, baseUrl, defaultBase) {
  if (!baseUrl || baseUrl === defaultBase || (isConfiguredEquipment(row.name) && row.config?.baseUrl)) {
    return 'plugin:' + unitFingerprint(row)
  }
  const { id: _id, ...config } = row
  return 'plugin:' + unitFingerprint({ config, baseUrl })
}

function makeUnits(ctx, preset, rows, baseUrl, defaultBase, resolveModule) {
  const units = rows.filter(row => !isAgentPlugin(row.name)).map(declaration => {
    const row = portableRow(declaration, baseUrl, resolveModule)
    const modules = childModules(row)
    const byId = row.id ? preset.rows.filter(item => item.entryId === row.id || item.entryId?.startsWith(row.id + ':')) : []
    const inventoryRows = byId.length ? byId : preset.rows.filter(item => modules.includes(resolveModule(item.moduleName, baseUrl)))
    const id = unitId(row, baseUrl, defaultBase)
    const legacyId = 'plugin:' + unitFingerprint(row)
    return {
      id, baseUrl, ...(id !== legacyId ? { legacyId } : {}),
      row, declaration, inventoryRows,
      modules,
      boundTool: isConfiguredEquipment(row.name) && Boolean(row.config?.boundTool),
      active: !preset.broken && row.disabled !== true && inventoryRows.some(item => item.enabled === true),
      persona: modules.some(name => presetModuleName(ctx, name) === personaModule),
    }
  })
  return [...units, ...configuredAgentUnits(rows).map(unit => ({ ...unit, active: !preset.broken }))]
}

export function activePresetUnits(ctx, agentCtx, definition) {
  // Use the retained Loader tree, which can differ from the currently
  // registered revision after a profile reload.
  const generation = ctx.agentPresets.generationFor?.(agentCtx)
  if (!generation) return []
  const { tree, presetId } = generation.mount
  const current = ctx.agentPresets.definitions?.get(presetId)
  const declared = definition ?? declarationsByScope.get(generation.key)
    ?? (current?.generation === generation ? current.config.plugins : tree.root.data)
  const owner = tree.ctx.fiber.entry
  const prefix = owner ? owner.id + ':' : ''
  const loaded = new Set()
  for (const entry of tree.entries()) {
    if (entry.options.group || entry.disabled || entry.fiber?.state !== 2) continue
    let current = entry
    while (current && !loaded.has(current)) {
      loaded.add(current)
      if (current.parent === tree.root) break
      current = current.parent?.ctx.fiber.entry
    }
  }
  const rows = Array.from(loaded, entry => ({
    entryId: entry.id.slice(prefix.length),
    moduleName: entry.options.name,
    baseUrl: entry.parent.tree.ctx.baseUrl,
    group: Boolean(entry.options.group),
    enabled: true,
  }))
  // A Loader group assigns ids to anonymous child rows. Fingerprint the
  // original declaration, using the mounted top-level id only for activation.
  const matched = declared.map((row, index) => {
    const mounted = tree.root.data[index]
    return row.id || mounted?.name !== row.name ? row : { ...row, id: mounted.id }
  })
  return makeUnits(ctx, { rows }, matched, tree.ctx.baseUrl, ctx.baseUrl, moduleResolver(ctx))
    .filter(unit => unit.active && !unit.sessionRecipe)
    .map(unit => ({ ...unit, actionModules: unit.inventoryRows.filter(row => !row.group) }))
}

export function metadata(meta, key) {
  const field = meta?.[key]
  if (typeof field === 'string') return field
  if (field && typeof field === 'object') {
    return field['zh-cn'] ?? field['zh-hans'] ?? field.zh ?? field.en
  }
}

export function equipmentMetadata(ctx, module, baseUrl) {
  try {
    return ctx.pluginPackages.metaOf(module, baseUrl ?? ctx.baseUrl)
  } catch {
    // Use the declared module name when optional package metadata is unreadable.
  }
}

function rowIcon(ctx, row, baseUrl, meta = equipmentMetadata(ctx, row.name, baseUrl)) {
  if (meta?.icon) return meta.icon
  const configured = isConfiguredEquipment(row.name) && Array.isArray(row.config?.plugins)
  const children = configured ? row.config.plugins : row.group && Array.isArray(row.config) ? row.config : []
  const base = configured ? row.config.baseUrl ?? baseUrl : baseUrl
  const icons = new Set(children.map(child => rowIcon(ctx, child, base)).filter(Boolean))
  if (icons.size === 1) return icons.values().next().value
}

export function nativeEquipmentIcon(ctx, unit) {
  if (unit) return rowIcon(ctx, unit.declaration ?? unit.row, unit.baseUrl)
}

function putUnit(equipment, unit, source, ctx) {
  const entry = equipment.get(unit.id)
  if (entry) {
    if (source.id && !entry.sources.includes(source.id)) entry.sources.push(source.id)
    entry.active ||= unit.active
    entry.sourceSessionId ??= source.sessionId
    return entry
  }
  const module = presetModuleName(ctx, unit.row.name)
  const declaration = unit.declaration ?? unit.row
  const meta = equipmentMetadata(ctx, declaration.name, unit.baseUrl)
    ?? (module !== unit.row.name ? equipmentMetadata(ctx, module, ctx.baseUrl) : undefined)
  const title = source.title ?? metadata(meta, 'title') ?? pluginTitle({ ...unit.row, name: module })
  const item = {
    ...unit,
    name: title,
    kind: 'plugin',
    nativeIcon: rowIcon(ctx, declaration, unit.baseUrl, meta),
    summary: metadata(meta, 'description')
      ?? (source.title || unit.modules.length > 1 ? '加载 ' + unit.modules.map(name => moduleLabel(presetModuleName(ctx, name))).join('、') : module),
    sources: source.id ? [source.id] : [], sourceSessionId: source.sessionId,
  }
  equipment.set(unit.id, item)
  return item
}

function toolWords(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function findToolProvider(schema, units, packageOf) {
  const candidates = units.filter(unit => unit.active && !unit.persona)
  const tool = toolWords(schema.name)
  const matches = candidates.filter(unit => unit.modules.some(module => {
    if (stockToolProviders.get(module)?.has(schema.name)) return true
    const packageInfo = packageOf(module)
    const declared = packageInfo?.manifest?.dsh?.loadout?.tools
    if (Array.isArray(declared) && declared.includes(schema.name)) return true
    const label = toolWords(moduleLabel(module).split('/').at(-1).replace(/\.[cm]?js$/u, '')).replace(/^tool-/, '')
    return label === tool
  }))
  if (matches.length === 1) return matches[0]
}

export function toolKey(schema) {
  return 'tool:' + createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0, 12)
}

function toolSummary(schema) {
  return schema.name === 'run_code' && schema.description?.startsWith('Execute a TypeScript program against the available tools.')
    ? '用程序编排当前阵容的工具。适合批量处理材料，或根据前一步的结果决定接下来调用哪个工具。'
    : schema.description
}

export function executorTools(ctx, scope, registered = ctx.tools.schemas(scope)) {
  const { tools } = ctx
  if (typeof tools.selectExecutor !== 'function') return { schemas: [] }
  try {
    const names = new Set(registered.map(schema => schema.name))
    const executor = tools.selectExecutor(scope)
    const origin = ctx.get('agentLoadoutToolOrigins')?.executor(executor)
    const schemas = executor.describe(tools.definitions(scope)).schemas.filter(schema => !names.has(schema.name))
    return { executor, schemas, origin }
  } catch {
    // A preset can have a pending executor while its provider is loading.
    return { schemas: [] }
  }
}

function toolCard(equipment, schema, id = toolKey(schema)) {
  const existing = equipment.get(id)
  if (existing) return existing
  const entry = {
    id, kind: 'tool', name: schema.name, summary: toolSummary(schema), sources: [], providers: [], liveProviders: new Map(),
    profileProviders: new Map(),
  }
  equipment.set(id, entry)
  return entry
}

function linkTool(entry, provider, deferred, transport) {
  if (transport) {
    entry.transport = true
    entry.transportProviders ??= new Set()
    entry.transportProviders.add(provider.id)
  }
  if (deferred !== undefined) {
    // A provider observed at initialization can satisfy the stricter check.
    entry.liveProviders.set(provider.id, deferred && entry.liveProviders.get(provider.id) !== false)
  } else if (!entry.providers.includes(provider.id)) {
    entry.providers.push(provider.id)
  }
  provider.provides ??= []
  if (!provider.provides.includes(entry.name)) provider.provides.push(entry.name)
}

function unitShape({ id: _id, ...row }) {
  return row.group === true && Array.isArray(row.config)
    ? { ...row, config: row.config.map(unitShape) } : row
}

function discoveryKey(row, baseUrl) {
  return jsonFingerprint({ baseUrl, config: unitShape(row) })
}

function providerDiscoveryKeys(unit, defaultBase, resolveModule) {
  if (unit.sessionRecipe) return [unit.id.slice('plugin:'.length)]
  const { row } = unit
  const baseUrl = unit.baseUrl ?? defaultBase
  const keys = [discoveryKey(row, baseUrl)]
  // A selected preset plugin can be mounted inside a wrapper to preserve its original base.
  if (isConfiguredEquipment(row.name) && row.config.sourceUnitId && row.config.plugins?.length === 1) {
    const sourceBase = row.config.baseUrl ?? baseUrl
    keys.push(discoveryKey(portableRow(row.config.plugins[0], sourceBase, resolveModule), sourceBase))
  }
  return keys.filter(Boolean)
}

function toolModuleReference(resolveModule, { moduleName, baseUrl }) {
  const name = resolveModule(moduleName, baseUrl)
  if (name.startsWith('file:') || isAbsolute(name)) {
    try {
      return { moduleName: pathToFileURL(realpathSync(isAbsolute(name) ? name : fileURLToPath(name))).href }
    } catch {
      // Use the Loader's name when the source cannot be normalized on disk.
    }
  }
  return { moduleName: name, ...(baseUrl && { baseUrl }) }
}

function observedModule(resolveModule, origin) {
  return origin?.moduleName && toolModuleReference(resolveModule, { moduleName: origin.moduleName, baseUrl: origin.moduleBaseUrl })
}

function discoveredToolModules(ctx, store, unit, id, snapshots, resolveModule) {
  const modules = new Set()
  for (const snapshot of snapshots) {
    for (const tool of snapshot.tools) {
      if (tool.id !== id || tool.provider !== unit.id) continue
      for (const module of tool.modules ?? []) modules.add(JSON.stringify(module))
    }
  }
  for (const key of providerDiscoveryKeys(unit, ctx.baseUrl, resolveModule)) {
    const tool = store.forProvider(key, id)
    for (const module of tool?.modules.values() ?? []) modules.add(JSON.stringify(module))
  }
  return modules
}

export function waitingScopedToolSources(ctx, store, { scope, record }, tool, unit, snapshots) {
  if (!unit) return []
  const resolve = moduleResolver(ctx)
  const known = discoveredToolModules(ctx, store, unit, tool.id, snapshots, resolve)
  const origins = ctx.get('agentLoadoutToolOrigins')
  const candidates = Array.from(origins?.scopedToolSources(scope) ?? [])
    .filter(([, origin]) => !isConfiguredEquipment(origin.moduleName) &&
      scopedToolMatches(ctx, scope, tool, record.definition.plugins, origin, undefined, resolve))
    .map(([key, origin]) => ({ key, module: observedModule(resolve, origin) }))
  if (known.size) return candidates.filter(({ module }) => known.has(JSON.stringify(module)))
  return candidates.length === 1 ? candidates : []
}

function observedTool({ name, description, parameters, deferLoading }) {
  const id = toolKey({ name, description, parameters, ...(deferLoading === true ? { deferLoading: true } : {}) })
  return { id, name, summary: description }
}

export function registeredToolKey(definition) {
  return definition && observedTool(definition).id
}

function rememberSessionTool(store, scope, provider, card) {
  store?.rememberSession(scope, provider.id, card)
  if (provider.sessionRecipe) store?.remember(provider.id.slice('plugin:'.length), card)
}

export function recordToolDiscovery(ctx, store, origin, definition, scope, session) {
  if (!origin.scope) {
    if (origin.profileSourceId && (session || origin.initialization || origin.deferred)) {
      store.remember(origin.profileSourceId.slice('profile:'.length), {
        ...observedTool(definition), deferred: origin.deferred === true,
      })
    }
    return
  }
  const resolve = moduleResolver(ctx)
  const card = { ...observedTool(definition), module: observedModule(resolve, origin) }
  if (origin.scope === scope) {
    if (!session) return
    const recipe = agentPluginRecipe(origin.unit, origin.baseUrl, resolve)
    if (recipe) rememberSessionTool(store, scope, agentPluginUnit(recipe),
      { ...card, deferred: origin.deferred === true })
    return
  }
  const baseUrl = origin.baseUrl ?? ctx.baseUrl
  const row = portableRow(origin.unit, baseUrl, resolve)
  const provider = discoveryKey(row, baseUrl)
  if (!provider) return
  store.remember(provider, { ...card, deferred: origin.initialization !== true })
}

function observedUnit(origin, ecosystem, candidates = []) {
  if (!origin?.scope) return
  const row = portableRow(origin.unit, origin.baseUrl, ecosystem.resolveModule)
  const exact = ecosystem.equipment.get(unitId(row, origin.baseUrl, ecosystem.defaultBase))
  if (exact) return exact
  const shape = unitShape(row)
  const same = candidates.filter(unit => (!unit.row.id || unit.row.id === row.id)
    && isDeepStrictEqual(unitShape(unit.row), shape))
  if (same.length === 1) return ecosystem.equipment.get(same[0].id)
}

function originFor(ctx, schema, scope) {
  return ctx.get('agentLoadoutToolOrigins')?.get(ctx.tools.get(schema.name, scope), scope)
}

function conditionalTool(ctx, scope, definition) {
  return Boolean(definition && typeof ctx.tools.executable === 'function' && !ctx.tools.executable(definition.name, scope))
}

function markConditional(item, property, id) {
  item[property] ??= new Set()
  item[property].add(id)
}

function liveToolSchemas(ctx, scope) {
  const schemas = ctx.tools.schemas(scope)
  const executor = executorTools(ctx, scope, schemas)
  return [
    ...schemas.map(schema => ({ schema, origin: originFor(ctx, schema, scope) })),
    ...(executor.origin?.scope === scope
      ? executor.schemas.map(schema => ({ schema, origin: executor.origin, transport: true })) : []),
  ]
}

export function toolSource(unit) {
  if (!unit) return
  const sourceId = unit.row.config?.sourceUnitId ?? unit.id
  return { sourceId, sourceName: unit.name ?? pluginTitle(unit.row) }
}

export const profileToolSource = Object.freeze({ sourceId: 'profile', sourceName: '当前 Profile' })

function profileSourceDetails(ctx, entry, sourceId) {
  const row = entry.options
  const base = entry.parent.tree.ctx.baseUrl
  const meta = equipmentMetadata(ctx, row.name, base)
  const name = metadata(meta, 'title') ?? moduleLabel(row.name)
  return { sourceId, sourceName: [profileToolSource.sourceName, name, row.id !== name && row.id].filter(Boolean).join(' · '),
    nativeIcon: rowIcon(ctx, row, base, meta) }
}

export function profileToolSources(ctx) {
  const sources = new Map()
  const runtime = scopeApi(ctx)
  if (!runtime) return sources
  for (const entry of ctx.loader.entries()) {
    if (runtime.scopeOf(entry.ctx)) continue
    const id = profileProviderId(entry)
    if (id) sources.set(id, { entry, active: profileProviderActive(entry) })
  }
  return sources
}

function artworkSource(ctx, scope, origin, resolveModule = moduleResolver(ctx)) {
  if (origin?.profileSourceId) return origin.profileSourceId
  if (!origin?.scope) return
  if (origin.scope === scope) {
    const recipe = agentPluginRecipe(origin.unit, origin.baseUrl, resolveModule)
    return recipe ? agentPluginUnit(recipe).id : origin.shortcutSourceId
  }
  const row = portableRow(origin.unit, origin.baseUrl, resolveModule)
  return row.config?.sourceUnitId ?? unitId(row, origin.baseUrl, ctx.baseUrl)
}

function scopedToolProviders(ctx, scope, presetPlugins, sessionPlugins, resolveModule) {
  const equipment = new Map([...presetPlugins, ...sessionPlugins].map(unit => [unit.id, unit]))
  const context = { equipment, resolveModule, defaultBase: ctx.baseUrl }
  const sessionById = new Map(sessionPlugins.map(unit => [unit.id, unit]))
  return origin => sourceProvider(origin, scope, sessionById, presetPlugins, context)
}

export function scopedEquipmentProvider(ctx, scope, origin, presetPlugins, sessionPlugins) {
  return scopedToolProviders(ctx, scope, presetPlugins, sessionPlugins, moduleResolver(ctx))(origin)
}

export function dispatchedToolDetails(ctx, scope, definition, agentCtx, plugins, selectedSource) {
  const { id } = observedTool(definition)
  const origin = ctx.get('agentLoadoutToolOrigins')?.get(definition, scope)
  const standingScope = ctx.agentPresets.generationFor?.(agentCtx)?.key
  const runtimeOnly = origin?.deferred === true || origin?.initialization === true
    || ctx.tools.get(definition.name, standingScope) !== definition
  if (!origin) {
    return { id, runtimeOnly, sourceName: ctx.tools.get(definition.name) === definition ? profileToolSource.sourceName : undefined }
  }
  const { unit, baseUrl } = origin
  const profile = profileProviderActive(origin.profileEntry) ? {
    id: origin.profileEntry.id, module: origin.profileEntry.options.name, unitId: origin.unitEntry.id,
  } : undefined
  if (profile && origin.profileSourceId) {
    return { id, runtimeOnly, profile, sourceId: origin.profileSourceId,
      sourceName: profileSourceDetails(ctx, origin.profileEntry, origin.profileSourceId).sourceName }
  }
  const meta = equipmentMetadata(ctx, unit.name, baseUrl)
  const label = metadata(meta, 'title') ?? pluginTitle(unit)
  if (!origin.scope) return { id, runtimeOnly, profile, sourceId: origin.profileSourceId, sourceName: profileToolSource.sourceName + ' · ' + label }
  const entry = origin.scope === scope && unit.id !== label ? unit.id : undefined
  let sourceId = selectedSource && selectedSource !== 'profile' ? selectedSource : undefined
  let provider
  try {
    const resolveModule = moduleResolver(ctx)
    const sessionPlugins = activeAgentUnits(ctx, scope, resolveModule)
    provider = scopedToolProviders(ctx, scope, activePresetUnits(ctx, agentCtx, plugins), sessionPlugins, resolveModule)(origin)
    sourceId ??= toolSource(provider)?.sourceId ?? artworkSource(ctx, scope, origin, resolveModule)
  } catch {
    // Attribution is optional for a native tool call.
  }
  return { id, runtimeOnly, sourceId, provider, sourceName: entry ? label + ' · ' + entry : label }
}

export function registeredToolDetails(ctx, scope, schemas, presetPlugins, sessionPlugins, transport = executorTools(ctx, scope, schemas)) {
  const resolveModule = moduleResolver(ctx)
  const origins = ctx.get('agentLoadoutToolOrigins')
  const providerFor = scopedToolProviders(ctx, scope, presetPlugins, sessionPlugins, resolveModule)
  const labeled = new Map()
  const tools = new Map(schemas.map(schema => {
    const id = toolKey(schema)
    const definition = ctx.tools.get(schema.name, scope)
    const origin = origins?.get(definition, scope)
    let source
    let nativeIcon
    if (origin?.scope) {
      const unit = providerFor(origin)
      const item = unit && putUnit(labeled, unit, {}, ctx)
      source = item ? toolSource(item) : { sourceName: pluginTitle(origin.unit) }
      nativeIcon = item ? item.nativeIcon : rowIcon(ctx, origin.unit, origin.baseUrl)
    } else if (origin || (definition && ctx.tools.get(schema.name) === definition)) {
      if (origin?.profileSourceId && profileProviderActive(origin.profileEntry)) {
        const { nativeIcon: icon, ...details } = profileSourceDetails(ctx, origin.profileEntry, origin.profileSourceId)
        source = details
        nativeIcon = icon
      } else {
        source = profileToolSource
        if (origin) nativeIcon = rowIcon(ctx, origin.unit, origin.baseUrl)
      }
    }
    const artSourceId = source?.sourceId && source.sourceId !== 'profile' ? source.sourceId : artworkSource(ctx, scope, origin, resolveModule)
    const artModule = origin?.moduleName && { moduleName: origin.moduleName, baseUrl: origin.moduleBaseUrl }
    return [id, { id, name: schema.name, summary: toolSummary(schema), ...source, artSourceId, nativeIcon, artModule,
      ...(conditionalTool(ctx, scope, definition) && { conditional: true }) }]
  }))
  if (!transport.schemas.length) return tools
  const origin = transport.origin
  const unit = origin?.scope && providerFor(origin)
  const item = unit && putUnit(labeled, unit, {}, ctx)
  const profile = profileProviderActive(origin?.profileEntry) && origin.profileSourceId &&
    profileSourceDetails(ctx, origin.profileEntry, origin.profileSourceId)
  const source = item ? toolSource(item) : origin?.scope ? { sourceName: pluginTitle(origin.unit) }
    : profile ? { sourceName: profile.sourceName, sourceId: profile.sourceId } : origin?.profileEntry && profileToolSource
  const artSourceId = item ? source.sourceId : artworkSource(ctx, scope, origin, resolveModule)
  const nativeIcon = item?.nativeIcon ?? (profile ? profile.nativeIcon : origin && rowIcon(ctx, origin.unit, origin.baseUrl))
  const artModule = origin?.moduleName && { moduleName: origin.moduleName, baseUrl: origin.moduleBaseUrl }
  for (const schema of transport.schemas) {
    const id = toolKey(schema)
    tools.set(id, { id, name: schema.name, summary: toolSummary(schema), transport: true, ...source, artSourceId, nativeIcon, artModule })
  }
  return tools
}

export function toolDefinitionMatches(ctx, scope, requirement, plugins, definition, { requireProvider = false, standingScope } = {}) {
  let origin
  if (requirement.transport) {
    if (definition) return false
    const transport = executorTools(ctx, scope)
    if (!transport.schemas.some(schema => schema.name === requirement.name && toolKey(schema) === requirement.id)) return false
    origin = transport.origin
    if (!origin || (!origin.scope && !requirement.profile)) return false
  } else {
    if (!definition || observedTool(definition).id !== requirement.id) return false
    origin = ctx.get('agentLoadoutToolOrigins')?.get(definition, scope)
  }
  if (requirement.profile) {
    if (!origin || origin.scope) return false
    const source = requirement.profileSourceId
    return !source || (origin.profileSourceId === source && profileProviderActive(origin.profileEntry)
      && profileProviderId(origin.profileEntry) === source)
  }
  if (!requirement.equipId) return true
  if (!origin) {
    // Standing definitions can predate attribution. Verify the exact registered
    // object from the preset scope before accepting it in a child session.
    return !requireProvider || Boolean(requirement.standing && standingScope &&
      ctx.tools.get(requirement.name, standingScope) === definition)
  }
  return scopedToolMatches(ctx, scope, requirement, plugins, origin, standingScope)
}

function scopedToolMatches(ctx, scope, requirement, plugins, origin, standingScope, resolveModule = moduleResolver(ctx)) {
  if (!origin.scope) return false
  const actual = portableRow(origin.unit, origin.baseUrl, resolveModule)
  const equipId = requirement.equipId
  if (configuredAgentUnits(plugins).some(unit => unit.id === equipId)) {
    return origin.scope === scope && agentPluginUnit({ row: actual, baseUrl: origin.baseUrl }).id === equipId
  }
  if (requirement.standing && standingScope && origin.scope !== standingScope) return false
  const matches = row => equipId === unitId(row, origin.baseUrl, ctx.baseUrl) || equipId === 'plugin:' + unitFingerprint(row)
    || (isConfiguredEquipment(row.name) && row.config?.sourceUnitId === equipId)
  if (matches(actual)) return true
  const shape = unitShape(actual)
  const declared = plugins.map(row => portableRow(row, origin.baseUrl, resolveModule))
    .filter(row => isDeepStrictEqual(unitShape(row), shape))
  return declared.length === 1 && matches(declared[0])
}

export function verifiedToolKeys(ctx, scope, requirements, plugins, options) {
  return requirements.filter(requirement => toolDefinitionMatches(ctx, scope, requirement, plugins,
    ctx.tools.get(requirement.name, scope), options)).map(requirement => requirement.id)
}

function putStandingTools(ctx, ecosystem, schemas, preset, scope, packageOf) {
  const { equipment, unitsByPreset, standingByPreset, standingNamesByPreset, standingNamesByUnit } = ecosystem
  const units = unitsByPreset.get(preset.id).filter(unit => !unit.sessionRecipe)
  const tools = new Map()
  const names = new Map()
  standingByPreset.set(preset.id, tools)
  standingNamesByPreset.set(preset.id, names)
  const transports = executorTools(ctx, scope, schemas)
  const executor = transports.origin?.scope === scope && observedUnit(transports.origin, ecosystem, units)
  if (executor) {
    ecosystem.executorByPreset.set(preset.id, executor.id)
    ecosystem.executorUnits.add(executor.id)
  }
  const append = (schema, transport) => {
    const entry = toolCard(equipment, schema)
    entry.sources.push(preset.id)
    if (transport) entry.transport = true
    const origin = transport ? transports.origin : originFor(ctx, schema, scope)
    const global = !transport && ctx.tools.get(schema.name)
    const inherited = transport ? transports.executor === ecosystem.hostExecutor
      : global && ctx.tools.get(schema.name, scope) === global
    const provider = transport ? executor : origin
      ? origin.scope === scope && observedUnit(origin, ecosystem, units)
      : !inherited && !transport && findToolProvider(schema, units, packageOf)
    const profileSource = transport ? inherited && linkProfileProvider(ctx, ecosystem, entry, origin, false, true)
      : linkProfileProvider(ctx, ecosystem, entry, origin)
    if (!transport && conditionalTool(ctx, scope, ctx.tools.get(schema.name, scope))) {
      markConditional(entry, 'conditionalPresets', preset.id)
      if (provider) markConditional(entry, 'conditionalSources', provider.id)
      if (profileSource) markConditional(entry, 'conditionalSources', profileSource)
    }
    tools.set(entry.id, provider?.id ?? (profileSource || (inherited ? 'profile' : undefined)))
    if (provider || !inherited) names.set(schema.name, provider?.id)
    if (provider) {
      linkTool(entry, equipment.get(provider.id), undefined, transport)
      rememberToolModule(ecosystem, entry, toolSource(provider).sourceId, observedModule(ecosystem.resolveModule, origin))
      let registered = standingNamesByUnit.get(provider.id)
      if (!registered) standingNamesByUnit.set(provider.id, registered = new Set())
      registered.add(schema.name)
    }
  }
  for (const schema of schemas) append(schema, false)
  for (const schema of transports.schemas) append(schema, true)
}

function sourceProvider(origin, scope, sessionPlugins, presetUnits, ecosystem) {
  if (origin.scope !== scope) return observedUnit(origin, ecosystem, presetUnits)
  const recipe = agentPluginRecipe(origin.unit, origin.baseUrl, ecosystem.resolveModule)
  return sessionPlugins.get(recipe ? agentPluginUnit(recipe).id : sessionOnlyUnitId(origin.unitEntry))
}

function linkProfileTool(entry, sourceId, deferred) {
  entry.live = true
  entry.profileProviders.set(sourceId, deferred && entry.profileProviders.get(sourceId) !== false)
}

function rememberToolModule(ecosystem, item, sourceId, module) {
  if (!sourceId || !module) return
  const key = item.id + '/' + sourceId
  if (!ecosystem.toolModules.has(key)) ecosystem.toolModules.set(key, new Map())
  ecosystem.toolModules.get(key).set(JSON.stringify(module), module)
}

function linkProfileProvider(ctx, ecosystem, item, origin, deferred = false, transport = false) {
  const id = origin?.profileSourceId
  const profile = !origin?.scope && ecosystem.profileSources.get(id)
  if (!profile?.active) return
  if (!profile.sourceName) Object.assign(profile, profileSourceDetails(ctx, profile.entry, id))
  linkProfileTool(item, id, deferred)
  rememberToolModule(ecosystem, item, id, observedModule(ecosystem.resolveModule, origin))
  if (transport) {
    item.transportProviders ??= new Set()
    item.transportProviders.add(id)
  }
  return id
}

function putProfileTools(ctx, ecosystem, discoveries) {
  for (const [sourceId, provider] of ecosystem.profileSources) {
    const remembered = discoveries?.forProvider(sourceId.slice('profile:'.length))
    if (!remembered) continue
    Object.assign(provider, profileSourceDetails(ctx, provider.entry, sourceId))
    for (const tool of remembered) {
      const entry = toolCard(ecosystem.equipment, { name: tool.name, description: tool.summary }, tool.id)
      linkProfileTool(entry, sourceId, tool.deferred)
    }
  }
}

function putLiveTools(ctx, ecosystem, discoveries) {
  const agents = ctx.get('agents')
  const runtime = agents && scopeApi(ctx)
  if (!runtime) return
  const origins = ctx.get('agentLoadoutToolOrigins')
  for (const agent of agents.list()) {
    const scope = runtime.scopeOf(agent.ctx)
    if (!scope) continue
    const presetId = ctx.agentPresets.composedPreset(agent.ctx)
    const standing = ecosystem.standingByPreset.get(presetId)
    const sessionPlugins = new Map(activeAgentUnits(ctx, scope, ecosystem.resolveModule).map(unit => [
      unit.id, putUnit(ecosystem.equipment, unit, { id: presetId, sessionId: agent.id }, ctx),
    ]))
    const providerInSession = origin => sourceProvider(origin, scope, sessionPlugins, ecosystem.unitsByPreset.get(presetId), ecosystem)
    readServiceRelations(ecosystem, origins?.serviceRelations(scope), providerInSession)
    const compaction = origins?.service?.('compaction', scope)
    const compactor = compaction?.scope && providerInSession(compaction)
    if (compactor) compactor.compaction = true
    for (const { schema, origin, transport } of liveToolSchemas(ctx, scope)) {
      const id = toolKey(schema)
      const profileId = origin?.profileSourceId
      if (standing?.has(id) && origin?.scope !== scope && (!profileId || standing.get(id) === profileId)) continue
      if (origin && !origin.scope && ecosystem.equipment.get(id)?.host && !transport &&
        ctx.tools.get(schema.name, scope) === ctx.tools.get(schema.name)) continue
      const entry = toolCard(ecosystem.equipment, schema)
      entry.live = true
      if (transport) entry.transport = true
      const conditional = !transport && conditionalTool(ctx, scope, ctx.tools.get(schema.name, scope))
      if (origin && !origin.scope) {
        const deferred = origin.deferred === true
        const sourceId = linkProfileProvider(ctx, ecosystem, entry, origin, deferred, transport)
        if (sourceId) {
          if (conditional) markConditional(entry, 'conditionalSources', sourceId)
          discoveries?.remember(sourceId.slice('profile:'.length), { id, name: schema.name, summary: schema.description, deferred })
        } else if (!ecosystem.profileSources.has(profileId) && profileProviderActive(origin.profileEntry)
          && (!profileId || profileProviderId(origin.profileEntry) === profileId)) {
          linkProfileTool(entry, profileToolSource.sourceId, origin.deferred === true)
          if (conditional) markConditional(entry, 'conditionalSources', profileToolSource.sourceId)
        }
      } else if (origin?.scope) {
        const provider = providerInSession(origin)
        if (provider) {
          const deferred = origin.deferred === true
          linkTool(entry, provider, deferred, transport)
          const module = observedModule(ecosystem.resolveModule, origin)
          rememberToolModule(ecosystem, entry, toolSource(provider).sourceId, module)
          if (conditional) markConditional(entry, 'conditionalSources', provider.id)
          if (origin.scope === scope) {
            rememberSessionTool(discoveries, scope, provider, { id, name: schema.name, summary: toolSummary(schema),
              deferred, module, ...(transport && { transport: true }) })
          }
        }
      }
      entry.sourceSessionId ??= agent.id
    }
    for (const provider of sessionPlugins.values()) {
      for (const tool of discoveries?.forSession(scope, provider.id) ?? []) putRememberedTool(ecosystem, provider, tool)
    }
  }
}

function putRememberedTool(ecosystem, provider, { id, name, summary, deferred, transport, modules }) {
  const entry = toolCard(ecosystem.equipment, { name, description: summary }, id)
  entry.live = true
  linkTool(entry, provider, deferred, transport)
  for (const module of modules?.values() ?? []) rememberToolModule(ecosystem, entry, toolSource(provider).sourceId, module)
}

function putDiscoveredTools(ecosystem, discoveries) {
  for (const provider of ecosystem.equipment.values()) {
    if (provider.kind !== 'plugin' || !provider.active || provider.persona || provider.sessionOnly) continue
    for (const key of providerDiscoveryKeys(provider, ecosystem.defaultBase, ecosystem.resolveModule)) {
      for (const tool of discoveries?.forProvider(key) ?? []) {
        putRememberedTool(ecosystem, provider, tool)
      }
    }
  }
}

function putSavedLiveTools(ecosystem, records) {
  const ready = new Set(ecosystem.inventory.filter(preset => !preset.broken).map(preset => preset.id))
  for (const [id, record] of records) {
    if (!ready.has(id)) continue
    for (const tool of record.liveTools ?? []) {
      const provider = ecosystem.equipment.get(tool.equipId) ?? ecosystem.equipment.get(ecosystem.aliases.get(tool.equipId))
      if (!provider?.active) continue
      const entry = toolCard(ecosystem.equipment, { name: tool.name, description: tool.summary }, tool.id)
      entry.live = true
      linkTool(entry, provider, tool.deferred === true, tool.transport)
    }
  }
}

function putBoundTools(ecosystem, customEquipment) {
  const { equipment } = ecosystem
  for (const { id, row } of customEquipment) {
    const bound = row.config.boundTool
    if (!bound) continue
    const entry = toolCard(equipment, { name: bound.name, description: bound.summary }, bound.id)
    entry.live = true
    linkTool(entry, equipment.get(id), bound.deferred === true)
  }
}

function labelBaseVariants(ecosystem) {
  const heroes = new Map(ecosystem.presets.map(preset => [preset.id, preset.name ?? preset.id]))
  const variants = new Map()
  for (const item of ecosystem.equipment.values()) {
    if (item.kind !== 'plugin' || !item.active || !item.baseUrl) continue
    const source = item.sources.find(id => heroes.has(id))
    if (!source) continue
    const key = item.legacyId ?? item.id
    const siblings = variants.get(key) ?? []
    siblings.push({ item, source })
    variants.set(key, siblings)
  }
  for (const siblings of variants.values()) {
    if (siblings.length < 2) continue
    for (const { item, source } of siblings) item.name = heroes.get(source) + ' · ' + item.name
  }
}

function readServiceRelations(eco, relations, identify, presetId) {
  const realms = new Map()
  if (!relations) return realms
  for (const { provider, realm } of relations.services) {
    const key = JSON.stringify(realm)
    realms.set(key, realm)
    const item = identify(provider)
    if (!item) continue
    let owned = eco.unitRealms.get(item.id)
    if (!owned) eco.unitRealms.set(item.id, owned = new Map())
    owned.set(key, realm)
  }
  for (const { consumer, provider } of relations.dependencies) {
    const target = identify(consumer)
    const source = identify(provider)
    if (!target || !source || source.id === target.id) continue
    let needed = eco.dependencies.get(target.id)
    if (!needed) eco.dependencies.set(target.id, needed = new Set())
    needed.add(source.id)
  }
  if (presetId) {
    const dependents = new Map()
    for (const { consumer, provider } of relations.required ?? []) {
      const target = identify(consumer)
      const source = identify(provider)
      if (!target || !source || source.id === target.id) continue
      let list = dependents.get(source.id)
      if (!list) dependents.set(source.id, list = new Set())
      list.add(target.id)
    }
    eco.presetDependents.set(presetId, dependents)
  }
  return realms
}

function requiredUnits(ids, ecosystem) {
  const needed = new Set(ids)
  for (const id of needed) {
    for (const dependency of ecosystem.dependencies.get(id) ?? []) needed.add(dependency)
  }
  return needed
}

export function standingToolClaims(id, ecosystem) {
  return [...requiredUnits([id], ecosystem)].flatMap(provider => Array.from(
    ecosystem.standingNamesByUnit.get(provider) ?? [], name => ({ name, provider })))
}

export function collectSessionEquipment(ctx, discoveries, itemId, sessionId) {
  const agent = typeof sessionId === 'string' && ctx.get('agents')?.get(sessionId)
  const scope = agent && scopeApi(ctx)?.scopeOf(agent.ctx)
  const origins = ctx.get('agentLoadoutToolOrigins')
  if (!scope || !origins) throw new Error('来源会话已关闭，请重新打开装备来源。')

  const resolveModule = moduleResolver(ctx)
  const defaultBase = ctx.baseUrl
  const preset = activePresetUnits(ctx, agent.ctx)
  const session = new Map(activeAgentUnits(ctx, scope, resolveModule).map(unit => [unit.id, unit]))
  if (!session.get(itemId)?.sessionRecipe) throw new Error('来源会话中没有可收藏的这件装备。')
  const equipment = new Map([...preset.map(unit => [unit.id, unit]), ...session])
  const local = { equipment, resolveModule, defaultBase, unitRealms: new Map(), dependencies: new Map() }
  const locate = origin => sourceProvider(origin, scope, session, preset, local)
  const presetScope = ctx.agentPresets.generationFor?.(agent.ctx)?.key
  if (presetScope && presetScope !== scope) readServiceRelations(local, origins.serviceRelations(presetScope), locate)
  readServiceRelations(local, origins.serviceRelations(scope), locate)

  const wanted = requiredUnits([itemId], local)
  const tools = new Map()
  function keepTool(provider, tool) {
    const key = provider + '/' + tool.id
    const previous = tools.get(key)
    const modules = new Map([...(previous?.modules ?? []), ...(tool.modules ?? [])]
      .map(module => [JSON.stringify(module), module]))
    const preferred = previous?.deferred === false ? previous : tool
    tools.set(key, { ...preferred, provider, ...(modules.size && { modules: [...modules.values()] }) })
  }
  for (const id of wanted) {
    for (const tool of discoveries.forSession(scope, id) ?? []) keepTool(id, { ...tool, modules: [...tool.modules.values()] })
  }
  for (const { schema, origin, transport } of liveToolSchemas(ctx, scope)) {
    if (!origin?.scope) continue
    const provider = locate(origin)
    if (provider && wanted.has(provider.id)) keepTool(provider.id, { id: toolKey(schema), name: schema.name,
      summary: toolSummary(schema), deferred: origin.deferred === true, ...(transport && { transport: true }),
      modules: [observedModule(resolveModule, origin)].filter(Boolean) })
  }
  return sessionEquipmentSnapshot(local, itemId, [...tools.values()])
}

export function sessionEquipmentSnapshot(ecosystem, itemId, tools = []) {
  const units = Array.from(requiredUnits([itemId], ecosystem), id => {
    const item = ecosystem.equipment.get(id)
    if (!item?.active || item.persona || item.sessionOnly) throw new Error('有随装依赖无法保存。')
    return {
      id, row: item.row,
      ...(item.sessionRecipe ? { session: true } : {}),
      baseUrl: item.sessionRecipe?.baseUrl ?? item.baseUrl,
      requires: [...(ecosystem.dependencies.get(id) ?? [])].sort(),
      realms: [...(ecosystem.unitRealms.get(id)?.values() ?? [])].sort(),
    }
  })
  const record = { id: itemId, units, tools }
  const snapshot = JSON.parse(JSON.stringify(record))
  // Optional values are omitted from the stored format. Reject configs that otherwise change in JSON.
  if (units.some((unit, index) => !isDeepStrictEqual(unit.row, snapshot.units[index].row))) {
    throw new Error('有随装依赖的配置只能在原会话使用。')
  }
  return snapshot
}

function collectedUnit({ row, baseUrl, session }, defaultBase) {
  if (session) return agentPluginUnit({ row, baseUrl })
  const modules = childModules(row)
  return { id: unitId(row, baseUrl, defaultBase), row, baseUrl, modules, active: true, persona: modules.includes(personaModule) }
}

export function checkEquipmentCollection(record, id, defaultBase) {
  if (record?.id !== id || !Array.isArray(record.units) || !Array.isArray(record.tools)) throw new Error('Invalid collection')
  const units = new Map(record.units.map(unit => [unit.id, unit]))
  if (units.size !== record.units.length || units.get(id)?.session !== true) throw new Error('Invalid collection root')
  for (const unit of units.values()) {
    const parsed = collectedUnit(unit, defaultBase)
    if (parsed.id !== unit.id || parsed.persona || !Array.isArray(unit.requires) || !Array.isArray(unit.realms)
      || unit.requires.some(id => id === unit.id || !units.has(id))
      || unit.realms.some(realm => !Array.isArray(realm) || realm.length !== 2 || realm.some(value => typeof value !== 'string' || !value))) {
      throw new Error('Invalid collection unit')
    }
  }
  for (const tool of record.tools) {
    if (!units.has(tool.provider) || !/^tool:[a-f0-9]{12}$/.test(tool.id) || typeof tool.name !== 'string'
      || (tool.summary !== undefined && typeof tool.summary !== 'string') || typeof tool.deferred !== 'boolean'
      || (tool.transport !== undefined && tool.transport !== true)
      || (tool.modules !== undefined && (!Array.isArray(tool.modules) || !tool.modules.every(validToolModule)))) {
      throw new Error('Invalid collected tool')
    }
  }
}

function putSessionSnapshots(ctx, ecosystem, snapshots, collected = false) {
  for (const record of snapshots) {
    for (const snapshot of record.units) {
      const unit = putUnit(ecosystem.equipment, collectedUnit(snapshot, ecosystem.defaultBase), {}, ctx)
      if (collected && snapshot.id === record.id) unit.collected = true
      if (collected || !ecosystem.dependencies.has(unit.id)) ecosystem.dependencies.set(unit.id, new Set(snapshot.requires))
      if (collected || !ecosystem.unitRealms.has(unit.id)) {
        ecosystem.unitRealms.set(unit.id, new Map(snapshot.realms.map(realm => [JSON.stringify(realm), realm])))
      }
    }
    for (const tool of record.tools) putRememberedTool(ecosystem, ecosystem.equipment.get(tool.provider), tool)
  }
}

export function presetEquipment(ecosystem, presetId) {
  if (ecosystem.builtInsByPreset.has(presetId)) return ecosystem.builtInsByPreset.get(presetId)
  const units = new Map((ecosystem.unitsByPreset.get(presetId) ?? [])
    .filter(unit => unit.active && unit.declaration).map(unit => [unit.id, unit]))
  const dependents = ecosystem.presetDependents.get(presetId)
  const builtIn = Object.fromEntries(Array.from(units, ([id, unit]) => {
    const affected = new Set([id])
    for (const key of affected) {
      for (const next of dependents?.get(key) ?? []) if (units.has(next)) affected.add(next)
    }
    const linked = [...affected].filter(key => key !== id)
    const identity = [...affected].find(key => units.get(key).persona)
    return [id, {
      name: ecosystem.equipment.get(id).name, linked, tools: ecosystem.equipment.get(id).provides ?? [],
      ...(identity ? { locked: identity === id ? '身份指引随英雄加载。'
        : '此装备提供英雄身份指引所需的服务。' } : {}),
    }]
  }))
  ecosystem.builtInsByPreset.set(presetId, builtIn)
  return builtIn
}

function requiredReplacement(presetId, required, kept, removed, ecosystem) {
  const registered = ecosystem.standingNamesByPreset.get(presetId)
  if (!registered?.size) return
  const collisions = new Map()
  for (const id of required) {
    if (kept.has(id)) continue
    for (const name of ecosystem.standingNamesByUnit.get(id) ?? []) {
      if (!registered.has(name)) continue
      const original = registered.get(name)
      if (original !== id && !removed?.has(original)) collisions.set(name, original)
    }
  }
  if (!collisions.size) return

  const builtIn = presetEquipment(ecosystem, presetId)
  const tools = [...collisions.keys()].sort()
  const remove = [...new Set(collisions.values())]
  for (const id of remove) {
    const item = builtIn[id]
    const reason = !item ? '无法确认同名工具属于哪件自带装备。' : item.locked
      ?? ([id, ...item.linked].some(key => required.has(key)) ? '新装备仍依赖 ' + item.name + '。' : undefined)
    if (reason) return { state: 'unavailable', reason: tools.join('、') + ' · ' + reason, replacement: { tools, remove: [] } }
  }
  return { replacement: { tools, remove: remove.sort() } }
}

export function checkSelectedStandingTools(selected, ecosystem) {
  const seen = new Map()
  for (const [id, item] of selected) {
    for (const name of ecosystem.standingNamesByUnit.get(id) ?? []) {
      const previous = seen.get(name)
      if (seen.has(name)) throw new Error(previous + ' 和 ' + item.name + ' 都会注册 ' + name + '，请选择一个来源。')
      seen.set(name, item.name)
    }
  }
}

export function includeDependencies(selected, presetId, ecosystem, removed) {
  const replaced = new Set([...selected.values()].map(item => item.replaceId))
  const kept = new Set((ecosystem.unitsByPreset.get(presetId) ?? [])
    .filter(unit => unit.active && !replaced.has(unit.id) && !removed.has(unit.id)).map(unit => unit.id))
  for (const id of requiredUnits([...kept, ...selected.keys()], ecosystem)) {
    if (kept.has(id) || selected.has(id)) continue
    const provider = ecosystem.equipment.get(id)
    if (removed.has(id)) throw new Error('所选装备还需要 ' + (provider?.name ?? id) + '，请恢复这件自带装备。')
    if (!provider?.active || provider.persona || provider.sessionOnly) {
      throw new Error('缺少可随阵容加载的依赖 ' + (provider?.name ?? id) + '。')
    }
    selected.set(id, provider)
  }
  const realms = new Map(ecosystem.presetRealms.get(presetId))
  const sessionRealms = new Map()
  for (const id of [...kept, ...selected.keys()]) {
    const target = ecosystem.equipment.get(id)?.sessionRecipe ? sessionRealms : realms
    for (const [key, realm] of ecosystem.unitRealms.get(id) ?? []) target.set(key, realm)
  }
  const ordered = values => [...values.keys()].sort().map(key => values.get(key))
  return { realms: ordered(realms), sessionRealms: ordered(sessionRealms) }
}

export async function discoverEcosystem(ctx, records, customEquipment = [], discoveries, collection = []) {
  const inventory = await ctx.agentPresets.compositionInventory()
  const presets = inventory.filter(preset => !records.has(preset.id))
  const definitions = new Map()
  const unitsByPreset = new Map()
  const equipment = new Map()
  const aliases = new Map()
  const presetBases = new Map()
  const defaultBase = ctx.baseUrl
  const resolveModule = moduleResolver(ctx)
  const hostExecutor = executorTools(ctx, undefined)
  const ecosystem = { inventory, presets, definitions, unitsByPreset, equipment, aliases, presetBases, defaultBase, resolveModule,
    toolModules: new Map(),
    profileSources: profileToolSources(ctx),
    hostTools: new Map(), hostTransports: new Map(), hostExecutor: hostExecutor.executor,
    executorByPreset: new Map(), executorUnits: new Set(),
    dependencies: new Map(), presetRealms: new Map(), presetDependents: new Map(), unitRealms: new Map(),
    standingByPreset: new Map(), standingNamesByPreset: new Map(), standingNamesByUnit: new Map(), builtInsByPreset: new Map() }
  for (const { id, title, row } of customEquipment) {
    const boundTool = Boolean(row.config.boundTool)
    putUnit(equipment, { id, row, modules: childModules(row), active: true, boundTool, baseUrl: defaultBase }, { title }, ctx)
  }
  const compositions = new Map(ctx.agentPresets.inspectCompositions().map(composition => [composition.id, composition.modules]))
  ecosystem.compositions = compositions
  let parse
  const packageCache = new Map()
  function packageOf(module, baseUrl = defaultBase) {
    const key = JSON.stringify([module, baseUrl])
    if (!packageCache.has(key)) packageCache.set(key, ctx.pluginPackages.packageOf(module, baseUrl))
    return packageCache.get(key)
  }
  const { evaluatePluginCompatibility, readProfileVersionExemptions } = await runtimeModule(ctx, '@deepseek-ai/dsh-app-boot')
  const exemptions = readProfileVersionExemptions(ctx.profileContext.dir)
  const checked = new Map()
  function versionIssue(module, baseUrl = defaultBase) {
    try {
      const pkg = packageOf(module, baseUrl)
      let manifestPath = pkg?.manifestPath
      if (!manifestPath && (isAbsolute(module) || /^(?:file:|\.\.?\/)/u.test(module))) {
        const url = isAbsolute(module) ? pathToFileURL(module) : new URL(module, baseUrl)
        manifestPath = findPackageJSON(pathToFileURL(realpathSync(url)), baseUrl)
      }
      if (!manifestPath) return
      if (!checked.has(manifestPath)) {
        const manifest = pkg?.manifest ?? JSON.parse(readFileSync(manifestPath, 'utf8'))
        const issue = evaluatePluginCompatibility(manifest, exemptions)
        checked.set(manifestPath, issue?.exempted ? undefined : issue)
      }
      return checked.get(manifestPath)
    } catch {
      // Unreadable metadata leaves the native loader's status authoritative.
    }
  }

  for (const schema of ctx.tools.schemas()) {
    const item = Object.assign(toolCard(equipment, schema), { host: true })
    const sourceId = linkProfileProvider(ctx, ecosystem, item, originFor(ctx, schema, undefined))
    if (sourceId) ecosystem.hostTools.set(item.id, sourceId)
  }
  for (const schema of hostExecutor.schemas) {
    const item = Object.assign(toolCard(equipment, schema), { host: true, transport: true })
    ecosystem.hostTransports.set(item.id, linkProfileProvider(ctx, ecosystem, item, hostExecutor.origin, false, true) ?? 'profile')
  }
  const origins = ctx.get('agentLoadoutToolOrigins')
  for (const preset of inventory) {
    let lease
    try {
      if (!preset.broken) lease = await ctx.agentPresets.acquireScope(preset.id)
      const baseUrl = (lease && origins?.baseOf(lease.key))
        ?? compositions.get(preset.id)?.find(module => module.useHostBase && module.baseUrl)?.baseUrl ?? defaultBase
      presetBases.set(preset.id, baseUrl)
      let rows = records.get(preset.id)?.definition.plugins
      if (!rows) {
        try {
          parse ??= (await entryYaml(ctx)).parse
          rows = parse((await ctx.agentPresets.readDocument(preset.id)).content)
        } catch {
          // A preset can still be selected when its declaration can't be cloned.
        }
      }
      if (Array.isArray(rows)) {
        definitions.set(preset.id, rows)
        if (lease) declarationsByScope.set(lease.key, rows)
      }
      const units = makeUnits(ctx, preset, Array.isArray(rows) ? rows : [], baseUrl, defaultBase, resolveModule)
      unitsByPreset.set(preset.id, units)
      for (const unit of units) {
        const issues = unit.inventoryRows?.filter(row => row.enabled === false)
          .map(row => versionIssue(row.moduleName, baseUrl)).filter(Boolean) ?? []
        if (issues.length) unit.compatibility = [...new Set(issues)]
        putUnit(equipment, unit, preset, ctx)
        if (unit.legacyId) {
          const previous = aliases.get(unit.legacyId)
          aliases.set(unit.legacyId, previous === undefined || previous === unit.id ? unit.id : null)
        }
      }
      if (lease) {
        const schemas = ctx.tools.schemas(lease.key)
        putStandingTools(ctx, ecosystem, schemas, preset, lease.key, packageOf)
        const compactor = observedUnit(origins?.service?.('compaction', lease.key), ecosystem, units)
        if (compactor) compactor.compaction = true
        ecosystem.presetRealms.set(preset.id, readServiceRelations(ecosystem, origins?.serviceRelations(lease.key),
          origin => observedUnit(origin, ecosystem, units), preset.id))
      }
    } catch (error) {
      // A preset can be replaced while the catalog is being read.
      preset.broken = error instanceof Error ? error.message : String(error)
    } finally {
      await lease?.[Symbol.asyncDispose]()
    }
  }

  putBoundTools(ecosystem, customEquipment)
  putProfileTools(ctx, ecosystem, discoveries)
  putLiveTools(ctx, ecosystem, discoveries)
  const usableBuilds = inventory.filter(preset => !preset.broken)
  putSessionSnapshots(ctx, ecosystem, usableBuilds.flatMap(preset => records.get(preset.id)?.sessionGear ?? []))
  putSessionSnapshots(ctx, ecosystem, collection, true)
  putDiscoveredTools(ecosystem, discoveries)
  putSavedLiveTools(ecosystem, records)
  for (const [id, { name, ...proof }] of discoveries?.usedTools() ?? []) {
    toolCard(equipment, { name }, id).discovery = proof
  }
  labelBaseVariants(ecosystem)
  for (const module of ctx.pluginPackages.resolution?.localPackageNames ?? []) {
    let pkg
    try {
      pkg = packageOf(module)
    } catch {
      // A damaged dependency manifest should not prevent catalog discovery.
      continue
    }
    if (!pkg || pkg.manifest.dsh?.bundle !== undefined) continue
    const id = 'module:' + module
    const meta = equipmentMetadata(ctx, module)
    const issue = versionIssue(module)
    equipment.set(id, {
      id, kind: 'module', module, version: pkg.version,
      name: metadata(meta, 'title') ?? moduleLabel(module),
      summary: metadata(meta, 'description') ?? (typeof pkg.manifest.description === 'string' ? pkg.manifest.description : undefined),
      nativeIcon: meta?.icon,
      sources: [],
      ...(issue && { compatibility: [issue] }),
    })
  }
  const manager = ctx.get('pluginManager')
  if (manager) {
    try {
      const [plugins, bundles] = await Promise.all([manager.listPlugins(), manager.listBundles()])
      ecosystem.bundleRows = bundles
      const entries = new Map(Array.from(ctx.loader.entries(), entry => [entry.id, entry]))
      for (const plugin of plugins) {
        const id = 'host:' + plugin.entryId
        const baseUrl = entries.get(plugin.entryId)?.parent.tree.ctx.baseUrl
        const issue = !plugin.enabled && versionIssue(plugin.moduleName, baseUrl)
        equipment.set(id, {
          id, kind: 'host', name: metadata(plugin.meta, 'title') ?? moduleLabel(plugin.moduleName),
          summary: metadata(plugin.meta, 'description') ?? plugin.moduleName,
          nativeIcon: plugin.meta?.icon,
          module: plugin.moduleName, baseUrl,
          target: plugin.entryId, manageable: Boolean(plugin.patchId),
          enabled: plugin.enabled, phase: plugin.fiberPhase, sources: [],
          ...(issue && { compatibility: [issue] }),
        })
      }
      for (const bundle of bundles) {
        const id = 'bundle:' + bundle.name
        const issue = !bundle.enabled && bundle.availability !== 'missing' && versionIssue(bundle.name)
        equipment.set(id, {
          id, kind: 'bundle', name: metadata(bundle.meta, 'title') ?? moduleLabel(bundle.name),
          summary: metadata(bundle.meta, 'description') ?? bundle.description ?? bundle.name,
          nativeIcon: bundle.meta?.icon,
          bundle: bundle.name, modules: bundle.rows.map(row => row.moduleName),
          target: bundle.name, manageable: !bundle.readOnlyReason && bundle.availability !== 'missing',
          enabled: bundle.enabled, installed: bundle.availability !== 'missing', sources: [],
          ...(issue && { compatibility: [issue] }),
        })
      }
    } catch (error) {
      ecosystem.profileError = error instanceof Error ? error.message : String(error)
    }
  }

  return ecosystem
}

function collectionAction(item) {
  if (item.collected) return { id: item.id, saved: true }
  if (item.sessionRecipe && item.sourceSessionId && !item.persona) return { id: item.id, sessionId: item.sourceSessionId }
}

function toolStatus(item, preset, ecosystem, sourceId, removed) {
  const options = new Map()
  for (const [providers, live] of [[item.providers.map(id => [id, false]), false], [item.liveProviders, true]]) {
    for (const [id, deferred] of providers) {
      const provider = ecosystem.equipment.get(id)
      if (!provider) continue
      const original = isConfiguredEquipment(provider.row.name) && provider.row.config?.sourceUnitId
      const key = /^plugin:[a-f0-9]{24}$/.test(original) ? original : id
      if (removed?.has(key)) continue
      const existing = options.get(key)
      if (existing && (existing.equipId === key || id !== key)) continue
      const status = statusForEcosystem(provider, preset, ecosystem, undefined, removed)
      if (status.state !== 'available' && (!live || status.state !== 'included') && !status.replacement) continue
      const otherTools = provider.provides?.filter(name => name !== item.name) ?? []
      const extra = otherTools.length ? '。同一来源还提供 ' + otherTools.join('、') : ''
      const conditional = item.conditionalSources?.has(id)
      options.set(key, {
        state: status.state === 'included' ? 'available' : status.state,
        sourceId: key, sourceName: ecosystem.equipment.get(key)?.name ?? provider.name,
        replaceId: status.replaceId, equipId: id,
        live, deferred, providerIncluded: status.state === 'included', collection: collectionAction(provider),
        ...(conditional && { conditional }),
        ...(item.transportProviders?.has(id) ? { transport: true } : {}),
        ...(status.dependencies ? { dependencies: status.dependencies } : {}),
        ...(status.replacement ? { replacement: status.replacement } : {}),
        ...(provider.boundTool ? { canConfigureSource: true } : {}),
        reason: '随 ' + provider.name + ' 装配' + extra + '。' +
          (provider.sessionRecipe && status.state === 'available' ? '' : status.reason ?? '') +
          (deferred ? '满足触发条件后，在对局装备中查看是否就绪。'
            : conditional ? '由 DSH 在回合中按条件启用。' : live ? '开局时由会话初始化加载并核验。' : ''),
      })
    }
  }
  const profiles = []
  if (!preset.broken && ecosystem.definitions.has(preset.id)) {
    const executor = ecosystem.executorByPreset.get(preset.id)
    for (const [id, deferred] of item.profileProviders) {
      const provider = id === profileToolSource.sourceId ? profileToolSource : ecosystem.profileSources.get(id)
      if (!provider || provider.active === false) continue
      const transport = item.transportProviders?.has(id)
      const standing = !transport && ecosystem.hostTools.get(item.id) === id ? ecosystem.standingNamesByPreset.get(preset.id) : undefined
      const shadow = standing?.get(item.name)
      if (standing?.has(item.name) && !shadow) continue
      const conflicts = transport ? executor : shadow
      const replace = conflicts && !removed?.has(conflicts)
      const builtIn = replace && presetEquipment(ecosystem, preset.id)[conflicts]
      if (replace && (!builtIn || builtIn.locked || transport && !ecosystem.hostTransports.has(item.id))) continue
      const option = { state: 'available', sourceId: id, sourceName: provider.sourceName, live: true,
        deferred, providerIncluded: true, ...(item.conditionalSources?.has(id) && { conditional: true }),
        ...(transport && { transport: true }),
        ...(replace && { replacement: { tools: [item.name], remove: [conflicts] } }),
        reason: replace ? '卸下「' + builtIn.name + '」后，使用当前 Profile 的' + (transport ? '执行器。' : '同名工具。')
          : deferred ? '由此 Profile 插件在回合中按条件注册。'
          : item.conditionalSources?.has(id) ? '由 DSH 在回合中按条件启用。' : '由此 Profile 插件初始化，开局时核验。' }
      profiles.push(option)
      options.set(id, option)
    }
  }
  const included = item.sources.includes(preset.id) && !removed?.has(ecosystem.standingByPreset.get(preset.id)?.get(item.id))
  const choices = [...options.values()].sort((a, b) => Number(b.state === 'available') - Number(a.state === 'available')
    || Number(Boolean(b.collection?.saved)) - Number(Boolean(a.collection?.saved)))
  const labelCounts = new Map()
  for (const choice of choices) labelCounts.set(choice.sourceName, (labelCounts.get(choice.sourceName) ?? 0) + 1)
  for (const choice of choices) {
    if (labelCounts.get(choice.sourceName) === 1) continue
    const provider = ecosystem.equipment.get(choice.equipId)
    const rowName = provider?.row?.id
    if (rowName && rowName !== choice.sourceName) choice.sourceName += ' · ' + rowName
  }
  const names = choices.map(choice => choice.sourceName)
  for (const [index, choice] of choices.entries()) {
    if (names.indexOf(names[index]) !== names.lastIndexOf(names[index])) choice.sourceName += ' · ' + choice.sourceId.slice(-6)
  }
  const inactiveProfile = item.profileProviders.size > 0 && [...item.profileProviders.keys()]
    .every(id => ecosystem.profileSources.get(id)?.active === false)
  const unavailable = sourceId ? '已选来源当前不可用，请重新选择。'
    : inactiveProfile ? '提供此工具的 Profile 插件当前未启用。'
    : item.live ? '已在来源会话注册。可为新会话配置提供此工具的插件。'
      : item.discovery ? '曾在对局中成功使用。为新会话配置来源后，可重新装备。'
      : item.host ? '此工具由 Profile 提供，当前英雄未暴露该工具。' : '当前英雄缺少可直接装配的工具来源。'
  const legacy = sourceId === profileToolSource.sourceId && profiles.length === 1 ? profiles[0] : undefined
  const selected = sourceId ? options.get(sourceId) ?? legacy : included ? { state: 'included',
    ...(item.conditionalPresets?.has(preset.id) && { conditional: true, reason: '由 DSH 在回合中按条件启用。' }) } : choices[0]
  return {
    ...(selected ?? { state: 'unavailable', sourceSessionId: item.sourceSessionId,
      canConfigureSource: !preset.broken && ecosystem.definitions.has(preset.id), reason: unavailable }),
    ...(choices.length > 1 || (included && choices.length) || (!selected && choices.length)
      ? { sourceChoices: choices } : {}),
  }
}

export function statusForEcosystem(item, preset, ecosystem, sourceId, removed) {
  if (item.kind === 'module') return { state: 'configure', reason: '保存会话配置后，可将它装到英雄身上。' }
  if (item.kind === 'bundle' || item.kind === 'host') {
    return { state: 'profile', reason: item.enabled ? '当前 Profile 已启用。' : '通过 DSH 插件管理启用或安装。' }
  }
  if (item.kind === 'tool') return toolStatus(item, preset, ecosystem, sourceId, removed)

  if (removed?.has(item.id)) return { state: 'unavailable', reason: '可在英雄自带中恢复此装备。' }
  const units = (ecosystem.unitsByPreset.get(preset.id) ?? []).filter(unit => !removed?.has(unit.id))
  if (units.some(unit => unit.id === item.id && unit.active)) return { state: 'included' }
  if (preset.broken || !ecosystem.definitions.has(preset.id)) {
    return { state: 'unavailable', reason: '当前英雄的预设无法组成新配置。' }
  }
  if (item.sessionOnly) {
    return { state: 'unavailable', sourceSessionId: item.sourceSessionId, reason: '此会话插件的配置需要原会话环境。' }
  }
  if (!item.active || item.persona) {
    return { state: 'unavailable', reason: item.persona ? '身份指引随原英雄加载。' : '来源预设中的插件未启用。' }
  }
  const kept = new Set(units.filter(unit => unit.active).map(unit => unit.id))
  const required = requiredUnits([item.id], ecosystem)
  const dependencies = [...required]
    .filter(id => id !== item.id && !kept.has(id))
    .map(id => ecosystem.equipment.get(id)?.name).filter(Boolean)
  const available = { state: 'available', ...(dependencies.length ? { dependencies } : {}) }
  const replacement = requiredReplacement(preset.id, required, kept, removed, ecosystem)
  if (replacement) return { ...available, ...replacement }
  const executor = ecosystem.executorByPreset.get(preset.id)
  if (ecosystem.executorUnits.has(item.id) && kept.has(executor) && executor !== item.id) {
    return { state: 'unavailable', reason: '请先在英雄自带中卸下 ' + ecosystem.equipment.get(executor).name + '。' }
  }
  if (item.sessionRecipe) return { ...available, reason: '在新会话开局时加载并核验此插件。' }
  const overlaps = units.filter(unit => unit.active && !unit.sessionRecipe && unit.modules.some(name => item.modules.includes(name)))
  const itemTools = item.provides ?? []
  const sameTools = overlaps.filter(unit => ecosystem.equipment.get(unit.id)?.provides?.some(name => itemTools.includes(name)))
  const sameSlot = overlaps.find(unit => unit.row.id && unit.row.id === item.row.id && unit.row.name === item.row.name
    && (!itemTools.length || !ecosystem.equipment.get(unit.id)?.provides?.length || sameTools.includes(unit)))
  const current = sameSlot ?? (sameTools.length === 1 ? sameTools[0] : undefined)
  if (current && current.row.name === item.row.name && Boolean(current.row.group) === Boolean(item.row.group)) {
    return { ...available, replaceId: current.id, reason: '换下当前英雄的 ' + pluginTitle(current.row) + ' 配置。' }
  }
  if (overlaps.length) {
    return { ...available, reason: '当前英雄有同类插件，开局时由 DSH 核验能否同时加载。' }
  }
  return available
}

export function publicEquipment(item) {
  const { row, active, persona, providers, liveProviders, profileProviders, conditionalPresets, conditionalSources,
    sourceSessionId, target, sessionRecipe, sessionOnly,
    boundTool, baseUrl, legacyId, declaration, inventoryRows, collected, nativeIcon, actionModules, transportProviders, ...rest } = item
  return { ...rest, collection: collectionAction(item) }
}

export function equipmentToolLinks(ecosystem, catalog) {
  const provided = new Map()
  const providers = new Map()
  const bundlesByEntry = new Map()

  for (const bundle of ecosystem.bundleRows ?? []) {
    const bundleId = 'bundle:' + bundle.name
    if (!catalog.has(bundleId)) continue
    for (const row of bundle.rows) {
      if (!bundlesByEntry.has(row.entryId)) bundlesByEntry.set(row.entryId, [])
      bundlesByEntry.get(row.entryId).push({ bundleId, module: row.moduleName })
    }
  }

  function add(map, id, key, link) {
    if (!map.has(id)) map.set(id, new Map())
    map.get(id).set(key, link)
  }

  function connect(tool, sourceId, providerId, deferred, memberships = []) {
    if (!catalog.has(providerId)) return
    add(providers, tool.id, sourceId, { id: providerId, sourceId })
    const timing = deferred ? 'turn' : tool.conditionalSources?.has(sourceId) ? 'condition' : undefined
    const link = { id: tool.id, sourceId, providerId, timing }
    const key = tool.id + '/' + sourceId
    for (const gearId of [providerId, ...memberships]) add(provided, gearId, key, link)
  }

  for (const tool of catalog.values()) {
    if (tool.kind !== 'tool') continue
    const sources = new Map(tool.liveProviders)
    for (const id of tool.providers) sources.set(id, false)
    for (const [id, deferred] of sources) {
      const source = toolSource(ecosystem.equipment.get(id))
      if (!source) continue
      const { sourceId } = source
      connect(tool, sourceId, catalog.has(sourceId) ? sourceId : id, deferred)
    }
    for (const [sourceId, deferred] of tool.profileProviders) {
      const entry = ecosystem.profileSources.get(sourceId)?.entry
      if (!entry) continue
      const memberships = (bundlesByEntry.get(entry.id) ?? []).filter(bundle => bundle.module === entry.options.name)
      connect(tool, sourceId, 'host:' + entry.id, deferred, memberships.map(bundle => bundle.bundleId))
    }
  }
  return { provided, providers }
}

export function addPluginUnits(plugins, items, baseUrl, { defaultBase, resolveModule }, sessionRealms) {
  const selected = Array.from(items)
  const pending = selected.filter(item => !item.sessionRecipe)
  const providers = new Map()
  const key = row => unitId(portableRow(row, baseUrl, resolveModule), baseUrl, defaultBase)
  function materialize(item, id) {
    let row = { ...structuredClone(item.declaration ?? item.row), id }
    if (item.baseUrl && item.baseUrl !== baseUrl) {
      if (!isConfiguredEquipment(row.name)) {
        row = { id, name: configuredEquipmentModule, config: { baseUrl: item.baseUrl, sourceUnitId: item.id, plugins: [row] } }
      } else if (!row.config.baseUrl) {
        row.config = { ...row.config, baseUrl: item.baseUrl, sourceUnitId: item.id }
      }
    }
    providers.set(item.id, key(row))
    return row
  }
  for (const item of pending) {
    if (!item.replaceId) continue
    const index = plugins.findIndex(row => key(row) === item.replaceId)
    if (index === -1) throw new Error(item.name + ' 的换装目标发生冲突。')
    plugins.splice(index, 1, materialize(item, plugins[index].id))
  }

  const rowIds = new Set(plugins.map(row => row.id))
  for (const item of pending) {
    if (item.replaceId) continue
    if (plugins.some(row => key(row) === item.id)) continue
    const id = item.row.id && !rowIds.has(item.row.id) ? item.row.id : 'equipment-' + item.id.slice('plugin:'.length)
    const row = materialize(item, id)
    rowIds.add(row.id)
    plugins.push(row)
  }
  const sessionUnits = selected.filter(item => item.sessionRecipe)
  if (sessionUnits.length) {
    let row = plugins.find(row => isAgentPlugin(row.name) && Array.isArray(row.config?.units))
    if (!row) {
      let id = 'loadout-session-plugins'
      while (rowIds.has(id)) id += '-extra'
      row = { id, name: agentPluginModule, config: { units: [] } }
      plugins.push(row)
    }
    const existing = new Set(row.config.units.map(recipe => agentPluginUnit(recipe).id))
    for (const unit of sessionUnits) {
      if (!existing.has(unit.id)) row.config.units.push(structuredClone(unit.sessionRecipe))
    }
    if (sessionRealms.length) {
      const realms = new Map([...(row.config.realms ?? []), ...sessionRealms].map(realm => [JSON.stringify(realm), realm]))
      row.config.realms = [...realms.values()]
    }
  }
  return { plugins, providers }
}
