import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { link, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { englishStrings, englishText, localizeDisplay } from './localization.js'
import { equipment, equipmentRoles, packageRoleReader, presetCopy, presetRoles, roles } from './catalog.js'
import { agentPluginModule, agentPluginUrl } from './agent-plugins.js'
import { appearanceStore, readArtwork } from './appearance.js'
import { openBuildPlans, planTaskPrompt, planTaskSessionId as heroAlternateSessionId, webPilotPlanComparison } from './build-plans.js'
import { decodeBuildShare, decodeLighthouseChallenge, decodeLighthouseEvidenceReport, decodeLighthouseHeroChallenge, decodeLighthouseHeroReport, decodeLighthouseReviewChallenge, decodeLighthouseReviewReport, decodeWebPilotChallenge, decodeWebPilotReport, encodeBuildShare, encodeLighthouseChallenge, encodeLighthouseEvidenceReport, encodeLighthouseHeroChallenge, encodeLighthouseHeroReport, encodeLighthouseReviewChallenge, encodeLighthouseReviewReport, encodeWebPilotChallenge, encodeWebPilotReport, isLighthouseHeroChallenge, isLighthouseReviewChallenge, isWebPilotChallenge, lighthouseChallengeName } from './build-sharing.js'
import { buildShareSources } from './build-share-sources.js'
import { configuredEquipmentModule, configuredEquipmentUrl, isConfiguredEquipment } from './configured-equipment.js'
import { customActionStore } from './custom-actions.js'
import { checkCustomEquipment, customEquipmentPreview, equipmentRecordKey, reviewCustomEquipment } from './custom-equipment.js'
import { composeIsolation, declaredIsolation } from './equipment-isolation.js'
import { marketActions } from './market.js'
import { legacyPresets } from './legacy-presets.js'
import { lighthouseArms, lighthouseComparisonTask, lighthouseComparisonWorkspace, lighthouseDirectory, lighthouseEvidenceChoices, lighthouseEvidenceDecision, lighthouseEvidenceLesson, lighthouseEvidenceReplayDirectory, lighthouseEvidenceReplayWorkspace, lighthouseEvidenceScenarios, lighthouseEvidenceTask, lighthouseHeroArms, lighthouseHeroContents, lighthouseHeroDelivery, lighthouseHeroMaterial, lighthouseHeroNeeds, lighthouseHeroTask, lighthouseHeroTrialFolder, lighthouseHeroWorkspace, lighthousePracticeContains, lighthouseRematchLesson, lighthouseRematchTask, lighthouseReviewDecision, lighthouseTask, lighthouseWorkspace } from './lighthouse.js'
import { compareCapabilities, summarizeCapabilities } from './loadout-comparison.js'
import { actionInput, actionKey, actionPrompt, equipmentActions, equipmentPrompt, equipmentTask, equipmentTaskId, equippedActions, heroActions as builtInHeroActions, questPrompt } from './match-actions.js'
import { matchEvents } from './match-events.js'
import { nativeOperationKey, nativeTrialKey, openMatchGrowth, questToolSource } from './match-growth.js'
import { jsonFingerprint, runtimeModule } from './loader-support.js'
import { comparisonIdValid, digestWorkspaceMaterial, materialProofRecord, openMatchComparisons, planComparisonArms, validPlanComparison, validRematchComparison, validRematchReference, validWorkspaceComparison, workspaceComparisonArms, workspaceComparisonDraft, workspaceComparisonTask, workspaceMaterialState } from './match-comparisons.js'
import { workspaceMaterialPicker } from './workspace-materials.js'
import { observedWebSource, observedWebSourceResult, webPilotTask, webSourceHostVersion, webSourceModule, webSourceOldVersion, webSourceTask, webSourceUrl, webSourceVersion } from './web-source-practice.js'
import { comparisonEvidence, matchReceipts, matchReport, matchToolRecords, noteDeliveredFiles, observedHeroHandoff, observedMaterialDelivery, observedPersonalWebReads, observedTextHandoff, observedWebPilotFollowupRead, panelActivityRecord, toolSourceRecord, webPilotHandoffOutcome, webRecoveryFingerprint } from './match-report.js'
import { isProfileShortcut, matchShortcutStore, shortcutBindings, validShortcut } from './match-shortcuts.js'
import { declaredModules, describePackageActions, loadoutPackage, moduleReference, packageActionRecord, packageActions, publishedToolActions } from './package-actions.js'
import { planReviewActivities } from './plan-reviews.js'
import { compactionActivity, observeCompaction } from './compaction-activities.js'
import { continuationQueue, continueLoadout } from './session-loadout.js'
import { boundToolState, enforceEquippedToolSources, equippedToolBindings } from './tool-bindings.js'
import { openToolDiscoveries } from './tool-discoveries.js'
import { standingToolClaims } from './ecosystem.js'
import { isProfileToolSource, profileProviderActive, profileProviderId, scopeApi } from './tool-origins.js'
import { activeAgentUnits, activePresetUnits, addPluginUnits, checkEquipmentCollection, checkSelectedStandingTools, childModules, collectSessionEquipment, configuredAgentUnits, discoverEcosystem, dispatchedToolDetails, equipmentMetadata, equipmentToolLinks, executorTools, includeDependencies, metadata, moduleLabel, nativeEquipmentIcon, presetEquipment, profileToolSources, publicEquipment, recordToolDiscovery, registeredToolDetails, registeredToolKey, scopedEquipmentProvider, sessionEquipmentSnapshot, statusForEcosystem, stockToolNames, toolKey, unitFingerprint, verifiedToolKeys, waitingScopedToolSources } from './ecosystem.js'

export const name = 'agent-loadout'
export const inject = ['agentPresets', 'connection', 'loader', 'profileContext', 'tools', 'pluginPackages']

const presetPlugin = '@deepseek-ai/dsh-agent-preset'
const prefix = 'loadout-'
const route = '/api/agent-loadout'
const englishRequest = request => request.headers.get('X-DSH-Heros-Language') === 'en'
const validOpeningId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)
const teamworkRecord = 'plugin:dsh-agent-loadout/teamwork'
const planTaskRecord = 'plugin:dsh-agent-loadout/plan-task'
const planTaskSessionPrefix = 'session-a076'
const webPilotPersonalRecord = 'plugin:dsh-agent-loadout/web-pilot-personal'
const webPilotPersonalPrefix = 'session-a077'
const webPilotPersonalSessionId = /^session-a077[a-f0-9]{28}$/
const webSourceUnavailable = '本机暂时无法装配原生网页读取。'
const webSourceDirectory = 'web-source-practice'
const webSourceChanged = '试玩出装已变化，请重新核对。'
const webPilotReplayChanged = '无法核对原局的题目或网页来源，请返回原局。'
const webPilotReplayUnavailable = '这局复赛已变化，请重新核对。'
const webPilotPersonalUnavailable = '请从已核对的两局对照里选择一套出装。'
const webPilotPersonalPairUnavailable = '还没有核对通过的同题个人对局。'
const webPilotPersonalReplayUnavailable = '目前无法用另一套出装复赛本题。'
const receivedWebPilotPersonalUnavailable = '请从本局已核对的好友战报对照使用本机出装。'
const lighthouseLesson = 'lighthouse-rematch'
const evidenceLesson = 'lighthouse-evidence'
const heroTrialDigest = createHash('sha256').update(lighthouseHeroContents).digest('hex')
const reviewChallengeUnavailable = '请先完成并核验一局灯塔交付。'
const reviewRoutesUnavailable = '本机暂时无法装配灯塔交接的出装。'
const handoffPairChanged = '这两局的实测出装暂不可用，请返回交接对照重新核对。'
const validReviewReplaySource = (source, next) => comparisonIdValid(source?.comparisonId) &&
  (next === 'review' ? source.kind === 'workspace' && source.arm === 'direct'
    : next === 'direct' && ((source.kind === 'workspace' && source.arm === 'review') ||
      (source.kind === 'rematch' && source.arm === 'rematch')))
const heroTrialUnavailable = '本机的标准模式与极简模式暂时无法进行这场试玩。'
const heroDeliveryUnavailable = '请先用极简模式完成一局需要原件的试玩，并核对它留下的文字交接。'
const heroDeliveryChanged = '样例或交付工具已变化，请重新核对。'
const isEvidenceLessonSource = ({ kind, arm }) => kind === 'workspace' && arm === 'evidence'
const isPublicEvidenceReplaySource = ({ kind, arm, publicEvidenceReplay }) =>
  kind === 'rematch' && arm === 'rematch' && publicEvidenceReplay === true
const isHeroDeliveryTrialSource = ({ kind, arm }) => kind === 'hero-trial' && arm === lighthouseHeroDelivery
const isStandardTrialSource = ({ kind, arm }) => kind === 'hero-trial' && arm === 'standard'
const isMinimalTrialSource = ({ kind, arm }) => kind === 'hero-trial' && arm === 'minimal'
const isStockTrialSource = source => isStandardTrialSource(source) || isMinimalTrialSource(source)
const isHeroTrialTaskSource = source => isHeroDeliveryTrialSource(source) || isStockTrialSource(source)
const standardTrialTools = { read: '@deepseek-ai/dsh-tool-fs', present: '@deepseek-ai/dsh-tool-present' }
const stockTrialTools = { standard: standardTrialTools, minimal: { bash: '@deepseek-ai/dsh-tool-bash-persistent' } }
const stockTransferChanged = '原装英雄的工具或来源已变化，请重新核对。'
const workflowPlugin = 'dsh-agent-loadout/workflow'
const teamToolsModule = '@deepseek-ai/dsh-tool-agent-team'
const equipmentById = new Map(equipment.map(item => [item.id, item]))
const webPilotTools = [
  ['web_fetch', webSourceModule],
  ['ask_user_question', equipmentById.get('evidence').requires],
  ['present', equipmentById.get('present').module],
]
const presetLabels = new Map(Object.entries(presetCopy))

function flatten(rows) {
  return rows.flatMap(row => row.group === true && Array.isArray(row.config)
    ? [row, ...flatten(row.config)]
    : [row])
}

function validEvidenceOpeningChoice(lesson, scenario, choice) {
  return choice === undefined || (lesson === evidenceLesson && scenario === 'gap' && lighthouseEvidenceChoices.includes(choice))
}

function validLessonTaskReference(source) {
  if (isEvidenceLessonSource(source) || isHeroTrialTaskSource(source)) return comparisonIdValid(source.comparisonId)
  return (source.kind === 'workspace' || source.kind === 'rematch') && validRematchReference(source)
}

function statusFor(item, preset, plugins, moduleName) {
  if (preset.broken) return { state: 'unavailable', reason: '基础预设加载失败。' }
  if (item.module && preset.rows.some(row => row.enabled === true && moduleName(row.moduleName) === item.module)) {
    return { state: 'included' }
  }
  if (!plugins) return { state: 'unavailable', reason: '当前预设的组成无法读取。' }
  if (item.workflow && flatten(plugins).some(row =>
    moduleName(row.name) === '@deepseek-ai/dsh-persona' && row.disabled !== true && row.config?.complete === true)) {
    return { state: 'unavailable', reason: '此预设使用独立的完整提示词。' }
  }
  const requiredModule = item.module ?? item.requires
  if (preset.rows.some(row => row.enabled === 'conditional' && moduleName(row.moduleName) === requiredModule)) {
    return { state: 'unavailable', reason: '此预设已条件加载同一工具。' }
  }
  return { state: 'available' }
}

function presetAfterRemoval(preset, base, units, removed) {
  if (!removed.size) return { preset, base }
  const omitted = units.filter(unit => removed.has(unit.id))
  const declarations = new Set(omitted.map(unit => unit.declaration))
  const rows = new Set(omitted.flatMap(unit => unit.inventoryRows))
  return { preset: { ...preset, rows: preset.rows.filter(row => !rows.has(row)) },
    base: base?.filter(row => !declarations.has(row)) }
}

function featuredStatus(item, preset, ecosystem, moduleName, removed = new Set()) {
  const base = ecosystem.definitions.get(preset.id)
  const units = ecosystem.unitsByPreset.get(preset.id) ?? []
  const current = presetAfterRemoval(preset, base, units, removed)
  const status = statusFor(item, current.preset, current.base, moduleName)
  if (status.state !== 'included') return status
  const providers = units.filter(unit => !removed.has(unit.id) && unit.inventoryRows.some(row =>
    row.enabled === true && moduleName(row.moduleName) === item.module))
  if (!providers.length) return status
  const builtIn = presetEquipment(ecosystem, preset.id)
  if (providers.some(({ id }) => !builtIn[id] || builtIn[id].locked)) {
    return { ...status, reason: '提供此能力的自带装备需要保留。' }
  }
  const remove = providers.map(unit => unit.id)
  const after = presetAfterRemoval(preset, base, units, new Set([...removed,
    ...remove.flatMap(id => [id, ...builtIn[id].linked])]))
  if (statusFor(item, after.preset, after.base, moduleName).state !== 'available') return status
  return { state: 'available', replacement: { tools: stockToolNames(item.module), remove }, availableAfterRemoving: remove,
    reason: '换下自带装备后，使用这件精选装备的配置与操作。' }
}

function equipmentRows(base, inventory, equipmentIds, declaringBase, defaultBase, moduleName) {
  const rows = structuredClone(base)
  const enabled = new Set(inventory.rows.filter(row => row.enabled === true).map(row => moduleName(row.moduleName)))
  const ids = new Set(rows.map(row => row.id))
  function add(id, moduleName, config) {
    while (ids.has(id)) id += '-extra'
    ids.add(id)
    rows.push({ id, name: moduleName, ...(config ? { config } : {}) })
    enabled.add(moduleName)
  }
  for (const id of equipmentIds) {
    const item = equipmentById.get(id)
    const moduleName = item.module ?? item.requires
    if (!enabled.has(moduleName)) add('loadout-' + id + '-tool', moduleName, item.config)
    if (item.workflow) add('loadout-' + id, workflowPlugin, { id })
  }
  if (rows.length > base.length && declaringBase !== defaultBase) {
    let id = 'loadout-featured'
    while (ids.has(id)) id += '-extra'
    const plugins = rows.splice(base.length)
    rows.push({ id, name: configuredEquipmentModule, config: { baseUrl: defaultBase, plugins } })
  }
  return rows
}

function compositionId(baseId, equipmentIds, plugins, liveTools = [], baseUrl, realms, equipmentSources, removedEquipmentIds) {
  const parts = [baseId, equipmentIds, plugins]
  if (liveTools.length) parts.push(liveTools.map(tool => {
    if (tool.deferred) return [tool.id, tool.equipId ?? null, 'deferred']
    return tool.equipId ? [tool.id, tool.equipId] : tool.id
  }))
  if (baseUrl) parts.push({ baseUrl })
  if (realms?.length) parts.push({ realms })
  if (equipmentSources && Object.keys(equipmentSources).length) parts.push({ equipmentSources })
  if (removedEquipmentIds?.length) parts.push({ removedEquipmentIds })
  return prefix + createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

function preparedPreset(id, record) {
  const verifyLive = Boolean(record && (equippedToolBindings(record).length || configuredAgentUnits(record.definition.plugins).length))
  return { presetId: id, verifyLive }
}

function unavailableProfileGear(ctx, record, sources) {
  const tools = equippedToolBindings(record).filter(tool => tool.profileSourceId)
  if (!tools.length) return
  const providers = sources ?? profileToolSources(ctx)
  const missing = tools.filter(tool => !providers.get(tool.profileSourceId)?.active)
  if (missing.length) return '所选 Profile 插件当前未启用或已变更，无法提供 ' + missing.map(tool => tool.name).join('、') + '。'
}

function actionModules(unit) {
  if (unit?.module) return [{ moduleName: unit.module, baseUrl: unit.baseUrl }]
  return unit?.actionModules ?? declaredModules(unit?.declaration ?? unit?.row, unit?.sessionRecipe?.baseUrl ?? unit?.baseUrl)
}

function catalogActions(reader, item) {
  if (item?.kind === 'bundle') return reader.bundle(item.bundle)
  if (item?.kind === 'module') return []
  return reader.equipment(actionModules(item))
}

function moduleEquipmentLinks(ctx, catalog) {
  const modules = [...catalog.values()].filter(item => item.kind === 'module')
  const configurations = new Map()
  const installedByGear = new Map()
  if (!modules.length) return { configurations, installedByGear }
  const resolved = new Map()
  function manifestFor({ moduleName, baseUrl = ctx.baseUrl }) {
    const key = JSON.stringify([moduleName, baseUrl])
    if (!resolved.has(key)) {
      let path
      try {
        const pkg = loadoutPackage(ctx, moduleName, baseUrl)
        if (pkg) path = realpathSync(pkg.manifestPath)
      } catch {
        // A declaration can point to a package that is no longer installed.
      }
      resolved.set(key, path)
    }
    return resolved.get(key)
  }
  const installed = new Map()
  for (const item of modules) {
    const path = manifestFor({ moduleName: item.module })
    if (!path) continue
    if (!installed.has(path)) installed.set(path, [])
    installed.get(path).push(item.id)
  }
  for (const item of catalog.values()) {
    if (item.kind !== 'plugin' && item.kind !== 'host') continue
    const ids = [...new Set(actionModules(item).flatMap(ref => installed.get(manifestFor(ref)) ?? []))]
    if (!ids.length) continue
    installedByGear.set(item.id, ids)
    for (const id of ids) {
      if (!configurations.has(id)) configurations.set(id, [])
      configurations.get(id).push(item.id)
    }
  }
  return { configurations, installedByGear }
}

function sourceToolActions(reader, ecosystem, { id: toolId, name, timing }, id, equipId = id, deferred = timing === 'turn') {
  const exact = ecosystem.toolModules.get(toolId + '/' + id)
  if (exact) {
    const modules = [...exact.values()]
    return deferred ? publishedToolActions(reader, name, modules.map(module => ({ module }))).flatMap(source => source.moves)
      : reader.tool(name, modules)
  }
  const profile = ecosystem.profileSources.get(id)
  return reader.tool(name, profile ? [moduleReference(profile.entry)] : actionModules(ecosystem.equipment.get(equipId)))
}

function catalogRoles(ctx, ecosystem, catalog, { provided, providers }) {
  const reader = packageRoleReader(ctx)
  const sourceRoles = new Map()
  const byId = new Map()
  const bundleRows = new Map((ecosystem.bundleRows ?? []).map(bundle => [bundle.name, bundle.rows]))
  function tool(item, sourceId) {
    if (!sourceId) return byId.get(item.id) ?? equipmentRoles(item)
    const key = item.id + '/' + sourceId
    if (!sourceRoles.has(key)) {
      const provider = providers.get(item.id)?.get(sourceId)?.id ?? sourceId
      const profile = ecosystem.profileSources.get(sourceId)
      const exact = ecosystem.toolModules.get(key)
      const modules = exact ? [...exact.values()]
        : profile ? [moduleReference(profile.entry)] : actionModules(ecosystem.equipment.get(provider))
      const transport = item.transportProviders?.has(sourceId) || item.transportProviders?.has(provider) ||
        (!item.transportProviders?.size && item.transport)
      sourceRoles.set(key, equipmentRoles({ ...item, transport }, [], reader.tool(item.name, modules)))
    }
    return sourceRoles.get(key)
  }
  for (const item of catalog.values()) {
    if (item.kind !== 'tool') continue
    const sources = [...(providers.get(item.id)?.keys() ?? [])].map(id => tool(item, id))
    byId.set(item.id, equipmentRoles(item, [], sources.flat()))
  }
  for (const item of [...equipment, ...catalog.values()]) {
    if (item.kind === 'tool') continue
    const modules = item.kind === 'bundle' ? [{ moduleName: item.bundle }] : actionModules(item)
    const linked = [...(provided.get(item.id)?.values() ?? [])].map(link => ({ roles: tool(catalog.get(link.id), link.sourceId) }))
    const declared = reader.gear(modules, item.kind === 'bundle' ? 'bundle' : 'equipment')
    if (item.kind === 'bundle') declared.push(...reader.gear((bundleRows.get(item.bundle) ?? []).map(row => ({ moduleName: row.moduleName }))))
    byId.set(item.id, equipmentRoles(item, linked, declared))
  }
  return { byId, tool, hero: reader.hero }
}

function publicPreset(preset, ecosystem, art, reader, legacy, classes, published) {
  const [name, description] = presetLabels.get(preset.id) ?? []
  const units = ecosystem.unitsByPreset.get(preset.id) ?? []
  const builtIn = presetEquipment(ecosystem, preset.id)
  const standing = ecosystem.standingByPreset.get(preset.id)
  return {
    id: preset.id,
    name: preset.name ?? name ?? preset.id,
    description: preset.description ?? description,
    roles: presetRoles(preset.id, [...Object.keys(builtIn).map(id => classes.byId.get(id) ?? []),
      ...[...(standing ?? [])].flatMap(([id, source]) => source && Object.hasOwn(builtIn, source)
        ? [classes.tool(ecosystem.equipment.get(id), source)] : [])], classes.hero(preset.id, ecosystem.compositions.get(preset.id))),
    isDefault: preset.isDefault,
    broken: preset.broken,
    art: art('hero', preset.id),
    legacySkipped: legacy.skipped(preset.id),
    legacyManaged: legacy.managed(preset.id),
    gearCompatibility: units.filter(unit => unit.compatibility?.length).map(unit => ({
      id: unit.id, name: ecosystem.equipment.get(unit.id).name, art: art('gear', unit.id), compatibility: unit.compatibility,
    })),
    packageMoves: describePackageActions(published),
    builtIn,
    tools: Object.fromEntries([
      ...equipment.map(item => [item.id, featuredStatus(item, preset, ecosystem, legacy.moduleName)]),
      ...Array.from(ecosystem.equipment.values(), item => {
        const status = statusForEcosystem(item, preset, ecosystem)
        const includedBy = status.state === 'included' && standing?.get(item.id)
        if (item.kind !== 'tool') return [item.id, status]
        const decorate = choice => {
          const moves = sourceToolActions(reader, ecosystem, item, choice.sourceId ?? includedBy ?? choice.equipId, choice.equipId, choice.deferred)
          const source = choice.sourceId ?? (includedBy || undefined)
          return { ...choice, roles: classes.tool(item, source), art: art('gear', item.id, source),
            ...(moves.length ? { packageMoves: describePackageActions(moves) } : {}) }
        }
        return [item.id, { ...status, ...(includedBy ? { includedBy } : {}),
          includedSourceName: ecosystem.profileSources.get(includedBy)?.sourceName,
          ...decorate(status),
          ...(status.sourceChoices ? { sourceChoices: status.sourceChoices.map(decorate) } : {}) }]
      }),
    ]),
  }
}

function validEquipmentIds(ids) {
  return Array.isArray(ids)
    && ids.every(id => typeof id === 'string' && (equipmentById.has(id) || /^(?:plugin:[a-f0-9]{24}|tool:[a-f0-9]{12})$/.test(id)))
    && new Set(ids).size === ids.length
}

function validRemovedEquipment(ids) {
  return Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id =>
    typeof id === 'string' && /^plugin:[a-f0-9]{24}$/.test(id))
}

function validEquipmentSources(sources, ids) {
  return sources === undefined || (sources !== null && Object.getPrototypeOf(sources) === Object.prototype
    && Object.entries(sources).every(([id, source]) => id.startsWith('tool:') && ids.includes(id)
      && typeof source === 'string' && (source === 'profile' || isProfileToolSource(source) || /^plugin:[a-f0-9]{24}$/.test(source))))
}

function checkRecord(record, id, defaultBase) {
  if (record?.definition?.id !== id || !Array.isArray(record.definition.plugins)
    || typeof record.definition.name !== 'string' || typeof record.baseId !== 'string'
    || typeof record.baseName !== 'string' || !validEquipmentIds(record.equipmentIds)
    || (record.removedEquipmentIds !== undefined && !validRemovedEquipment(record.removedEquipmentIds))
    || (record.removedEquipmentLabels !== undefined && (!record.removedEquipmentLabels ||
      Object.getPrototypeOf(record.removedEquipmentLabels) !== Object.prototype ||
      !validRemovedEquipment(Object.keys(record.removedEquipmentLabels)) ||
      Object.values(record.removedEquipmentLabels).some(label => typeof label !== 'string')))
    || !validEquipmentSources(record.equipmentSources, record.equipmentIds)
    || (record.sessionGear !== undefined && !Array.isArray(record.sessionGear))
    || (record.standingTools !== undefined && (!Array.isArray(record.standingTools) ||
      !record.standingTools.every(tool => typeof tool?.name === 'string' && record.equipmentIds.includes(tool.id)
        && /^plugin:[a-f0-9]{24}$/.test(tool.equipId) && (tool.summary === undefined || typeof tool.summary === 'string')
        && (tool.transport === undefined || tool.transport === true))))
    || (record.baseUrl !== undefined && (typeof record.baseUrl !== 'string' || !record.baseUrl))
    || (record.realms !== undefined && (!Array.isArray(record.realms) ||
      !record.realms.every(realm => Array.isArray(realm) && realm.length === 2 &&
        realm.every(value => typeof value === 'string' && value))))
    || (record.liveTools !== undefined && (!Array.isArray(record.liveTools) ||
      !record.liveTools.every(tool => typeof tool?.name === 'string' && record.equipmentIds.includes(tool.id) &&
        (tool.equipId === undefined || /^plugin:[a-f0-9]{24}$/.test(tool.equipId)) &&
        (tool.profile === undefined || (tool.profile === true && tool.equipId === undefined)) &&
        (tool.transport === undefined || (tool.transport === true && (tool.equipId !== undefined || tool.profile === true))) &&
        (tool.deferred === undefined || tool.deferred === true) &&
        (tool.summary === undefined || typeof tool.summary === 'string'))))
    || Object.entries(record.equipmentSources ?? {}).some(([id, source]) => isProfileToolSource(source) &&
      !record.liveTools?.some(tool => tool.id === id && tool.profile === true))
    || compositionId(record.baseId, record.equipmentIds, record.definition.plugins, record.liveTools,
      record.baseUrl, record.realms, record.equipmentSources, record.removedEquipmentIds) !== id) {
    throw new Error('Invalid loadout record: ' + id)
  }
  for (const snapshot of record.sessionGear ?? []) checkEquipmentCollection(snapshot, snapshot.id, defaultBase)
}

function savedToolSources(record, ecosystem) {
  if (record.equipmentSources) {
    return Object.fromEntries(Object.entries(record.equipmentSources).map(([id, source]) => {
      if (source !== 'profile') return [id, source]
      const options = [...(ecosystem.equipment.get(id)?.profileProviders.keys() ?? [])]
        .filter(key => key === 'profile' || ecosystem.profileSources.get(key)?.active)
      return [id, options.length === 1 ? options[0] : source]
    }))
  }
  const sources = new Map()
  const standing = ecosystem.standingByPreset.get(record.definition.id)
  for (const id of record.equipmentIds) {
    if (!id.startsWith('tool:')) continue
    const tool = record.liveTools?.find(item => item.id === id)
    const provider = tool ? tool.equipId ?? 'profile' : standing?.get(id)
    if (provider) sources.set(id, ecosystem.equipment.get(provider)?.row?.config?.sourceUnitId ?? provider)
  }
  return Object.fromEntries(sources)
}

async function saveEntry(directory, id, record, { exclusive = false } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const filename = join(directory, id + '.json')
  const temp = filename + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temp, JSON.stringify(record), { mode: 0o600, flag: 'wx' })
    if (exclusive) await link(temp, filename)
    else await rename(temp, filename)
  } finally {
    await rm(temp, { force: true })
  }
}

async function realDirectory(baseUrl) {
  try {
    return await realpath(fileURLToPath(baseUrl))
  } catch {
    return undefined
  }
}

async function readSelection(request) {
  if (request.headers.get('content-type') !== 'application/json' || !request.body) {
    throw new Error('预设或插件选择无效。')
  }
  const reader = request.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      bytes += value.byteLength
      if (bytes > 262144) {
        await reader.cancel()
        throw new Error('预设或插件选择无效。')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}

export async function apply(ctx) {
  const lifetime = new AbortController()
  const market = marketActions(ctx, lifetime.signal)
  const planReviews = planReviewActivities(ctx)
  const compactionProofs = observeCompaction()
  const directory = join(ctx.profileContext.dir, 'agent-loadouts')
  const planTaskOwner = createHash('sha256').update(directory).digest('hex')
  const equipmentDirectory = join(directory, 'equipment')
  const collectionDirectory = join(directory, 'collection')
  const artRoute = route + '/art'
  const appearance = appearanceStore(ctx, join(directory, 'art'), artRoute)
  const records = new Map()
  const actionOrigins = new WeakMap()
  const toolRuntime = scopeApi(ctx)
  const { appendPluginRecord } = await runtimeModule(ctx, '@deepseek-ai/dsh-session')
  const teamToolExecution = new AsyncLocalStorage()
  const custom = new Map()
  const collection = new Map()
  const equipmentWrites = new Map()
  const registrations = new Map()
  const savedIdsByCurrentBase = new Map()
  const pending = new Map()
  const openingMatches = new Map()
  const openingLighthouseLessons = new Map()
  const openingRematches = new Map()
  const teammateLaunches = new Map()
  const teamLaunchAdmissions = new Map()
  const warnings = []
  const legacy = legacyPresets(ctx, directory, saveEntry, key => {
    if (!warnings.includes(key)) warnings.push(key)
  })
  const actions = await customActionStore(join(directory, 'actions'), saveEntry, warnings)
  const buildPlans = await openBuildPlans(join(directory, 'plans'), saveEntry, warnings)
  const lighthouseComparisons = await openMatchComparisons(directory, 'lighthouse-comparison', lighthouseArms, saveEntry,
    () => warnings.push('lighthouse-comparisons'))
  const heroTrials = await openMatchComparisons(directory, lighthouseHeroTrialFolder, [...lighthouseHeroArms, lighthouseHeroDelivery], saveEntry,
    () => warnings.push('lighthouse-hero-trials'), record => lighthouseHeroNeeds.includes(record.need) &&
      [lighthouseHeroTask(false), lighthouseHeroTask(true)].includes(record.task))
  const workspaceComparisons = await openMatchComparisons(directory, 'workspace-comparison', [...workspaceComparisonArms, 'evidence'], saveEntry,
    () => warnings.push('workspace-comparisons'),
    record => validWorkspaceComparison(record) && validEvidenceOpeningChoice(record.lesson, record.scenario, record.openingChoice) &&
      (record.reviewChallengeArm === undefined || (record.lesson === lighthouseLesson &&
        workspaceComparisonArms.includes(record.reviewChallengeArm) && lighthouseReviewLanguage(record))) &&
      (record.reviewReplaySource === undefined || validReviewReplaySource(record.reviewReplaySource, record.reviewChallengeArm)) &&
      (record.lesson === undefined || record.lesson === lighthouseLesson ||
        (record.lesson === evidenceLesson && lighthouseEvidenceScenarios.includes(record.scenario))),
    record => {
      if (record.lesson === evidenceLesson) return ['evidence']
      if (record.lesson === lighthouseLesson) return [record.reviewChallengeArm ?? 'direct']
      return workspaceComparisonArms
    })
  const planComparisons = await openMatchComparisons(directory, 'plan-comparison', planComparisonArms, saveEntry,
    () => warnings.push('plan-comparisons'), validPlanComparison)
  const rematchComparisons = await openMatchComparisons(directory, 'rematch-comparison', ['rematch'], saveEntry,
    () => warnings.push('rematch-comparisons'), validRematchComparison)
  const comparisonStores = { lighthouse: lighthouseComparisons, workspace: workspaceComparisons, plans: planComparisons, rematch: rematchComparisons }
  const materialComparisonStores = [workspaceComparisons, planComparisons, rematchComparisons]
  const workspaceMaterials = workspaceMaterialPicker(() => ctx.get('workspaceRegistry'))
  const personalTaskMaterials = workspaceMaterialPicker(() => ctx.get('workspaceRegistry'), personalTaskPathFilter)
  // Native session history is shared by profiles under the same DSH home.
  const receipts = matchReceipts(join(ctx.profileContext.home, 'agent-loadout', 'match-actions'))
  const pins = matchShortcutStore(join(directory, 'shortcuts'), saveEntry, key => {
    if (!warnings.includes(key)) warnings.push(key)
  })
  const shortcuts = shortcutBindings(ctx, receipts)
  const updates = matchEvents()
  const toolRecords = matchToolRecords(appendPluginRecord, updates.notify)
  const growth = await openMatchGrowth(directory, saveEntry, updates.notify, () => {
    if (!warnings.includes('progress.json')) warnings.push('progress.json')
  }, { confirmedActions: receipts.confirmedActions, profileGear: profileGrowthGear })
  const queue = continuationQueue(ctx, verifyContinuation, updates.notify, lifetime.signal, join(directory, 'continuations'), saveEntry)
  function checkDiscoverySnapshot(snapshot, sourceId, toolId) {
    checkEquipmentCollection(snapshot, sourceId, ctx.baseUrl)
    if (!snapshot.tools.some(tool => tool.id === toolId && tool.provider === sourceId)) {
      throw new Error('装备记录没有这个工具的原来源。')
    }
  }
  const discoveries = await openToolDiscoveries(join(directory, 'discovered-tools'), saveEntry, key => {
    if (!warnings.includes(key)) warnings.push(key)
  }, checkDiscoverySnapshot)
  let closed = false
  if (toolRuntime) enforceEquippedToolSources(ctx, toolRuntime, records, toolRecords.capture, shortcuts, creditMatchTool, observeTeamTool)
  ctx.on('system-prompt/assemble', async (_assembly, { agent }, next) => {
    const assembly = await next()
    // Older presets reference the directory as a prompt variable. The current
    // host exposes it in session context and may already have recovered it.
    if (agent && !Object.hasOwn(assembly.variables, 'cwd') && [...assembly.sections, ...assembly.contexts]
      .some(section => section.interpolate !== false && /\{\{\s*cwd\s*\}\}/u.test(section.text))) {
      const directory = agent.ctx.get('workingDirectory')?.get(agent.session)
      if (directory) assembly.variables.cwd = directory
    }
    return assembly
  })
  ctx.on('agent-loadout/tool-discovered', (origin, definition, scope) => {
    if (!closed) recordToolDiscovery(ctx, discoveries, origin, definition, scope, Boolean(toolRuntime?.scopeParentOf(scope)))
  }, { global: true })

  function register(record, rows = record.definition.plugins) {
    const declaring = record.baseUrl ? ctx.extend({ baseUrl: record.baseUrl }) : ctx
    // Resolve our helpers from this installation when mounting. Keep their
    // package names in saved builds so a later package update can reopen them.
    let plugins = composeIsolation(rows, record.realms, record.definition.id)
    if (record.baseUrl) plugins = plugins.map(row => {
      if (row.name === configuredEquipmentModule) return { ...row, name: configuredEquipmentUrl }
      if (row.name === agentPluginModule) return { ...row, name: agentPluginUrl }
      return row
    })
    return declaring.agentPresets.register({ ...record.definition, plugins })
  }

  ctx.effect(() => async () => {
    closed = true
    lifetime.abort()
    updates.close()
    await queue.settle()
    await Promise.allSettled(openingMatches.values())
    await Promise.allSettled(teammateLaunches.values())
    await Promise.allSettled(pending.values())
    await Promise.allSettled(equipmentWrites.values())
    await actions.settle()
    await buildPlans.settle()
    await growth.settle()
    await pins.settle()
    await receipts.settle()
    await discoveries.settle()
    await Promise.allSettled(Array.from(registrations.values(), dispose => dispose()))
    await legacy.close()
  })

  let files = []
  try {
    files = await readdir(directory)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const profileDirectory = await realDirectory(ctx.baseUrl)
  const equipmentDirectories = new Map([[ctx.baseUrl, profileDirectory]])
  for (const filename of files.filter(file => /^loadout-[a-f0-9]{24}\.json$/.test(file))) {
    if (closed) return
    try {
      const record = JSON.parse(await readFile(join(directory, filename), 'utf8'))
      const id = filename.slice(0, -5)
      checkRecord(record, id, ctx.baseUrl)
      const rows = [...record.definition.plugins]
      for (const [index, row] of rows.entries()) {
        const base = row.config?.baseUrl
        if (!profileDirectory || !isConfiguredEquipment(row.name) || typeof base !== 'string' || base === ctx.baseUrl) continue
        if (!equipmentDirectories.has(base)) equipmentDirectories.set(base, await realDirectory(base))
        if (equipmentDirectories.get(base) !== profileDirectory) continue
        // DSH resolves installed plugins against the current profile URL. A
        // saved URL may refer to the same directory through a different path.
        rows[index] = { ...row, config: { ...row.config, baseUrl: ctx.baseUrl } }
      }
      const dispose = await register(record, rows)
      if (closed) {
        await dispose()
        return
      }
      registrations.set(id, dispose)
      records.set(id, record)
      if (rows.some((row, index) => row !== record.definition.plugins[index])) {
        const currentId = compositionId(record.baseId, record.equipmentIds, rows, record.liveTools,
          record.baseUrl, record.realms, record.equipmentSources, record.removedEquipmentIds)
        savedIdsByCurrentBase.set(currentId, id)
      }
    } catch {
      warnings.push(filename.slice(0, -5))
    }
  }

  let equipmentFiles = []
  try {
    equipmentFiles = await readdir(equipmentDirectory)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const filename of equipmentFiles.filter(file => /^(?:[a-f0-9]{24}|tool-[a-f0-9]{12})\.json$/.test(file))) {
    if (closed) return
    const stem = filename.slice(0, -5)
    const key = stem.startsWith('tool-') ? 'tool:' + stem.slice(5) : 'plugin:' + stem
    try {
      const record = JSON.parse(await readFile(join(equipmentDirectory, filename), 'utf8'))
      checkCustomEquipment(record, key)
      custom.set(key, record)
    } catch {
      warnings.push(stem)
    }
  }

  const collectedFiles = await readdir(collectionDirectory).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return []
  })
  for (const filename of collectedFiles.filter(file => /^[a-f0-9]{24}\.json$/.test(file))) {
    if (closed) return
    const id = 'plugin:' + filename.slice(0, -5)
    try {
      const record = JSON.parse(await readFile(join(collectionDirectory, filename), 'utf8'))
      checkEquipmentCollection(record, id, ctx.baseUrl)
      collection.set(id, record)
    } catch {
      warnings.push(filename)
    }
  }
  if (closed) return
  await queue.restore(file => warnings.push(file))

  async function reviewEquipment(selection) {
    if (selection.toolId === undefined) return reviewCustomEquipment(ctx, selection)
    const { equipment } = await discover()
    const tool = equipment.get(selection.toolId)
    if (tool?.kind !== 'tool') throw new Error('装备库中找不到这件工具，请刷新装备。')
    return reviewCustomEquipment(ctx, selection, {
      id: tool.id, name: tool.name,
      ...(typeof tool.summary === 'string' ? { summary: tool.summary } : {}),
      ...(selection.deferred === true ? { deferred: true } : {}),
    })
  }

  async function addCustomEquipment(selection) {
    const reviewed = await reviewEquipment(selection)
    if (reviewed.id !== selection.reviewedId) throw new Error('装备配置已变化，请重新核对。')
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const key = equipmentRecordKey(reviewed)
    if (equipmentWrites.has(key)) throw new Error('这件装备正在保存。')
    const filename = key.startsWith('tool:') ? 'tool-' + key.slice(5) : key.slice('plugin:'.length)
    const saving = saveEntry(equipmentDirectory, filename, reviewed)
      .finally(() => equipmentWrites.delete(key))
    equipmentWrites.set(key, saving)
    await saving
    custom.set(key, reviewed)
    return customEquipmentPreview(reviewed)
  }

  const discover = async (additional = []) => {
    await legacy.ready
    await legacy.settle()
    return discoverEcosystem(ctx, records, [...custom.values()], discoveries, [...collection.values(), ...additional])
  }

  function checkCollectionCompatibility(record) {
    for (const existing of collection.values()) {
      const saved = new Map(existing.units.map(unit => [unit.id, unit]))
      for (const unit of record.units) {
        const previous = saved.get(unit.id)
        if (previous && (!isDeepStrictEqual(previous.requires, unit.requires) || !isDeepStrictEqual(previous.realms, unit.realms))) {
          throw new Error('这件装备和现有收藏使用了不同的随装依赖。请先移除冲突的收藏。')
        }
      }
    }
  }

  async function updateCollection({ itemId, sessionId, toolId, remove }) {
    if (typeof itemId !== 'string' || !/^plugin:[a-f0-9]{24}$/.test(itemId) || typeof remove !== 'boolean') {
      throw new Error('找不到可收藏的装备。')
    }
    const recorded = typeof toolId === 'string' && discoveries.sourcesOf(toolId)?.get(itemId)
    if (!remove && toolId !== undefined && (!recorded?.snapshot || recorded.sessionId !== sessionId)) {
      throw new Error('找不到这条实战发现的原装备配置。')
    }
    const key = 'collection'
    if (closed || equipmentWrites.has(key)) throw new Error('装备库正在更新，请重试。')
    if (collection.has(itemId) === !remove) return { saved: !remove }
    const filename = itemId.slice('plugin:'.length)
    const saving = (async () => {
      if (remove) {
        await rm(join(collectionDirectory, filename + '.json'), { force: true })
        collection.delete(itemId)
      } else {
        const record = recorded?.snapshot ?? collectSessionEquipment(ctx, discoveries, itemId, sessionId)
        checkEquipmentCollection(record, itemId, ctx.baseUrl)
        checkCollectionCompatibility(record)
        await saveEntry(collectionDirectory, filename, record)
        collection.set(itemId, record)
      }
      return { saved: !remove }
    })().finally(() => equipmentWrites.delete(key))
    equipmentWrites.set(key, saving)
    return saving
  }

  function currentEquipmentId(id, ecosystem) {
    return ecosystem.equipment.has(id) ? id : ecosystem.aliases.get(id) ?? id
  }

  function packageArt(uploaded, ecosystem, active, loadedPlugins, profileArtwork) {
    const icons = new Map()
    const sourceIcons = new Map()
    const gearArtwork = new Map()
    const heroes = new Map()
    const artwork = appearance.packageArtwork()
    const catalogItem = id => ecosystem?.equipment.get(id) ?? ecosystem?.equipment.get(ecosystem.aliases.get(id))
    function modulesFor(id) {
      if (profileArtwork?.has(id)) return profileArtwork.get(id).modules
      const profile = ecosystem?.profileSources.get(id)
      if (profile?.entry) return [moduleReference(profile.entry)]
      const item = catalogItem(id) ?? loadedPlugins?.get(id)
      if (item?.kind === 'bundle') return [{ moduleName: item.bundle }]
      if (!item && id?.startsWith('bundle:')) return [{ moduleName: id.slice('bundle:'.length) }]
      return actionModules(item)
    }
    function iconFor(id) {
      if (!sourceIcons.has(id)) sourceIcons.set(id, catalogItem(id)?.nativeIcon ?? ecosystem?.profileSources.get(id)?.nativeIcon
        ?? profileArtwork?.get(id)?.icon ?? nativeEquipmentIcon(ctx, loadedPlugins?.get(id)))
      return sourceIcons.get(id)
    }
    return (kind, id, sourceId, toolName, nativeIcon, artModule) => {
      const override = uploaded(kind, id)
      if (override) return override
      if (kind === 'hero') {
        if (!heroes.has(id)) {
          const modules = ecosystem?.compositions.get(id)
            ?? (active ? ctx.agentPresets.inspectCompositions(active.agent.ctx)[0]?.modules : undefined)
          heroes.set(id, artwork.portrait(id, modules))
        }
        return heroes.get(id)
      }
      if (sourceId) {
        const sourceOverride = uploaded('gear', sourceId)
        if (sourceOverride) return sourceOverride
      }
      function packageGear(source, name, module) {
        const key = JSON.stringify([id, source, name, module])
        if (!gearArtwork.has(key)) {
          const modules = modulesFor(source)
          const observed = ecosystem?.toolModules.get(id + '/' + source)
          const specific = name && artwork.tool(name, module ? [module] : observed ? [...observed.values()] : modules)
          const providerArt = specific ? undefined : artwork.gear(modules)
          gearArtwork.set(key, providerArt && name ? providerArt + '&provider=1' : specific ?? providerArt)
        }
        return gearArtwork.get(key)
      }
      function iconUrl(icon) {
        if (!icon) return
        if (!icons.has(icon)) icons.set(icon, appearance.icon(icon))
        return icons.get(icon)
      }
      const item = catalogItem(id)
      const name = toolName ?? (item?.kind === 'tool' ? item.name : undefined)
      const source = sourceId ?? id
      const direct = packageGear(source, name, artModule) ?? iconUrl(nativeIcon ?? iconFor(source))
      if (direct || sourceId || item?.kind !== 'tool') return direct
      const providers = new Set([...item.providers, ...item.liveProviders.keys(), ...item.profileProviders.keys()])
      if (item.host || !providers.size) return
      const possible = new Set([...providers].map(provider => packageGear(provider, name) ?? iconUrl(iconFor(provider))))
      if (possible.size === 1) return possible.values().next().value
    }
  }

  function planAvailability(ecosystem) {
    const meta = new Map(ecosystem.inventory.map(item => [item.id, item]))
    return presetId => meta.has(presetId)
      ? meta.get(presetId).broken ?? unavailableProfileGear(ctx, records.get(presetId), ecosystem.profileSources)
      : '方案的英雄或阵容当前不可用。'
  }

  function publicBuildPlan({ evidenceOrigin, handoffOrigin, webPilotOrigin, webPilotSaveRequest, ...plan }) {
    return { ...plan, ...(evidenceOrigin && { hasEvidenceOrigin: true }), ...(handoffOrigin && { hasHandoffOrigin: true }),
      ...(webPilotOrigin && { hasWebPilotOrigin: true }),
      ...(webPilotOrigin?.received && { hasReceivedWebPilotOrigin: true }) }
  }

  function planCard(plan, art, unavailable) {
    const build = plan.evidenceOrigin && records.get(plan.presetId)
    return { ...publicBuildPlan(plan), heroArt: art('hero', plan.heroId), broken: unavailable(plan.presetId),
      ...(build && { evidenceEquipped: build.equipmentIds.includes('evidence') }) }
  }

  async function list() {
    const [ecosystem, uploaded, sampleWorkspace] = await Promise.all([
      discover(), appearance.index(),
      ctx.get('workspaceRegistry')?.resolveByPath?.(lighthouseDirectory(directory)).catch(() => undefined),
    ])
    const profile = await profileGrowthGear(undefined, ecosystem.bundleRows ?? [])
    const panelActivities = profilePanelActivities(profile)
    const compactionActivities = equipmentCompactionActivities(profile)
    const art = packageArt(uploaded, ecosystem)
    const reader = packageActions(ctx)
    const unavailable = planAvailability(ecosystem)
    const withRank = (item, rank) => rank.xp ? { ...item, rank } : item
    const catalog = visibleEquipment(ecosystem)
    const { provided, providers } = equipmentToolLinks(ecosystem, catalog)
    const { configurations, installedByGear } = moduleEquipmentLinks(ctx, catalog)
    const classes = catalogRoles(ctx, ecosystem, catalog, { provided, providers })
    const standingClaims = Object.fromEntries(Array.from(ecosystem.equipment.values())
      .filter(item => item.kind === 'plugin' && item.active && !item.sessionRecipe)
      .flatMap(item => {
        const claims = standingToolClaims(item.id, ecosystem)
        return claims.length ? [[item.id, claims]] : []
      }))
    function discoverySources(item) {
      const seen = discoveries.sourcesOf(item.id)
      if (!seen?.size) return
      const sources = [...seen].map(([sourceId, { sourceName, sessionId, heroId, time, snapshot }]) => {
        const provider = ecosystem.equipment.get(sourceId)
        const link = providers.get(item.id)?.get(sourceId)
        const fit = link && !ecosystem.equipment.get(link.id)?.sessionOnly && ecosystem.profileSources.get(sourceId)?.active !== false
        const saved = collection.has(sourceId)
        return { sourceId, sourceName: sourceName ?? provider?.name ?? sourceId.slice(-6), sessionId, heroId, time,
          art: art('gear', item.id, sourceId),
          ...(fit && { providerId: link.id }),
          ...(saved || snapshot ? { collection: saved ? { id: sourceId, saved: true }
            : { id: sourceId, sessionId, toolId: item.id } } : {}) }
      }).sort((a, b) => a.time - b.time || a.sourceId.localeCompare(b.sourceId))
      const labels = new Map()
      for (const { sourceName } of sources) labels.set(sourceName, (labels.get(sourceName) ?? 0) + 1)
      return sources.map(item => labels.get(item.sourceName) === 1
        ? item : { ...item, sourceName: item.sourceName + ' · ' + item.sourceId.slice(-6) })
    }
    const lastHeroTrial = heroTrials.latest()
    const hasLighthouseHandoffs = Boolean(workspaceComparisons.latest(lighthouseReviewLanguage) ||
      rematchComparisons.latest(lighthouseReviewLanguage))
    const [heroTrialReady, webPractice] = await Promise.all([heroTrialAvailable(ecosystem), webPracticeAvailability(ecosystem)])
    return {
      roles,
      standingClaims,
      lighthouseWorkspaceId: sampleWorkspace?.id,
      heroTrialAvailable: heroTrialReady,
      webPractice,
      ...(lastHeroTrial && { lastHeroTrial: { id: lastHeroTrial.id, need: lastHeroTrial.need } }),
      ...(hasLighthouseHandoffs && { hasLighthouseHandoffs }),
      ...((lastHeroTrial || workspaceComparisons.latest(record => record.lesson === evidenceLesson || record.reviewChallengeArm)) &&
        { hasLighthouseRuns: true }),
      equipment: [
        ...equipment.map(item => withRank({ ...publicEquipment(item), kind: 'featured', roles: classes.byId.get(item.id),
          art: art('gear', item.id) }, growth.gearRank(item.id))),
        ...Array.from(catalog.values(), item => {
          const moves = catalogActions(reader, item)
          const task = equipmentTask(item)
          const supplied = provided.get(item.id)
          const origins = providers.get(item.id)
          return withRank({ ...publicEquipment(item), roles: classes.byId.get(item.id), art: art('gear', item.id), panelActivities: panelActivities.get(item.id),
            moduleConfigurations: configurations.get(item.id),
            installedModules: installedByGear.get(item.id),
            ...(supplied && { providedTools: [...supplied.values()] }),
            ...(origins && { providerGear: [...origins.values()] }),
            ...(item.kind === 'tool' && { sourceRanks: growth.toolSourceRanks(item.id), discoverySources: discoverySources(item) }),
            compactionActivities: item.compaction ? [compactionActivity] : compactionActivities.get(item.id),
            ...(task ? { taskMove: [task.name, task.detail] } : {}),
            ...(moves.length ? { packageMoves: describePackageActions(moves) } : {}) }, growth.gearRank(item.id))
        }),
      ],
      presets: ecosystem.presets.map(item => {
        const published = reader.hero(item.id, ecosystem.compositions.get(item.id))
        const preset = withRank(publicPreset(item, ecosystem, art, reader, legacy, classes, published), growth.heroRank(item.id))
        const moves = [...builtInHeroActions(item.id), ...actions.read('hero', item.id).actions]
        return { ...preset, flag: displayFlagFor(item.id, art), signature: displaySignatureFor(item.id, art),
          heroMoves: describePackageActions(moves),
          heroActionKeys: actionChoices(item.id, [...moves, ...published]).map(move => move.key) }
      }),
      saved: Array.from(records, ([id, record]) => {
        const equipmentSources = savedToolSources(record, ecosystem)
        return {
          id,
          name: record.definition.name,
          baseName: record.baseName,
          baseId: record.baseId,
          heroArt: art('hero', record.baseId),
          heroRank: growth.heroRank(record.baseId),
          heroSignature: displaySignatureFor(record.baseId, art),
          equipmentIds: record.equipmentIds.map(id => currentEquipmentId(id, ecosystem)),
          removedEquipmentIds: record.removedEquipmentIds,
          removedEquipmentLabels: record.removedEquipmentLabels,
          equipmentSources,
          equipmentSourceLabels: record.equipmentSourceLabels,
          equipmentRoles: Object.fromEntries(record.equipmentIds.flatMap(id => {
            const current = currentEquipmentId(id, ecosystem)
            const item = catalog.get(current)
            const roles = item?.kind === 'tool' ? classes.tool(item, equipmentSources[id]) : classes.byId.get(current)
            return roles ? [[current, roles]] : []
          })),
          equipmentArt: Object.fromEntries(record.equipmentIds.map(id => {
            const current = currentEquipmentId(id, ecosystem)
            return [current, art('gear', current, equipmentSources[id]) ?? uploaded('gear', id)]
          }).filter(([, image]) => image)),
          equipmentLabels: Object.fromEntries(Object.entries(record.equipmentLabels ?? {}).map(([id, label]) => [
            currentEquipmentId(id, ecosystem), label,
          ])),
          broken: unavailable(id),
        }
      }).reverse(),
      plans: buildPlans.list().map(plan => planCard(plan, art, unavailable)),
      signatureRules: growth.signatureRules,
      profileError: ecosystem.profileError,
      warnings: warnings.length,
    }
  }

  function visibleEquipment(ecosystem) {
    return new Map([...ecosystem.equipment].filter(([, item]) => !item.boundTool &&
      !(isConfiguredEquipment(item.row?.name) && ecosystem.equipment.get(item.row.config?.sourceUnitId)?.active)))
  }

  async function catalogTitle(kind, id) {
    if (!id || typeof id !== 'string' || id.length > 512) throw new Error('找不到对应的英雄或装备。')
    if (kind === 'hero') {
      const preset = (await ctx.agentPresets.list()).find(preset => preset.id === id && !records.has(id))
      if (preset) return preset.name ?? presetLabels.get(id)?.[0] ?? id
      const saved = Array.from(records.values()).find(record => record.baseId === id)
      if (saved) return saved.baseName
    }
    if (kind === 'gear') {
      const item = equipmentById.get(id) ?? (await discover()).equipment.get(id)
      if (item) return item.name
      const saved = Array.from(records.values()).find(record => record.equipmentIds.includes(id))
      if (saved) return saved.equipmentLabels?.[id] ?? id
    }
    throw new Error('找不到对应的英雄或装备。')
  }

  async function plan({ presetId, equipmentIds, equipmentSources, removedEquipmentIds = [] } = {}, ecosystem) {
    if (typeof presetId !== 'string' || !validEquipmentIds(equipmentIds) || !validEquipmentSources(equipmentSources, equipmentIds)
      || !validRemovedEquipment(removedEquipmentIds)) {
      throw new Error('预设或插件选择无效。')
    }
    await legacy.ready
    await legacy.settle()
    const existing = await ctx.agentPresets.resolve(presetId)
    if (existing.broken) throw new Error(existing.broken)
    if (!equipmentIds.length && !removedEquipmentIds.length) {
      const record = records.get(presetId)
      const missing = unavailableProfileGear(ctx, record, ecosystem?.profileSources)
      if (missing) throw new Error(missing)
      return { id: presetId, record }
    }
    if (records.has(presetId)) throw new Error('请从基础预设开始搭配。')

    ecosystem ??= await discover()
    let inventory = ecosystem.presets.find(row => row.id === presetId)
    let base = ecosystem.definitions.get(presetId)
    if (!inventory || !base) throw new Error('当前英雄的预设无法组成新配置。')
    const removed = new Set()
    const removedEquipmentLabels = {}
    if (removedEquipmentIds.length) {
      const builtIn = presetEquipment(ecosystem, presetId)
      removedEquipmentIds = removedEquipmentIds.map(id => currentEquipmentId(id, ecosystem)).sort()
      if (!validRemovedEquipment(removedEquipmentIds)) throw new Error('有重复的自带装备，请重新选择。')
      for (const id of removedEquipmentIds) {
        const item = builtIn[id]
        if (!item) throw new Error('英雄的自带装备已变化，请刷新装备。')
        if (item.locked) throw new Error(item.name + ' · ' + item.locked)
        for (const key of [id, ...item.linked]) removed.add(key)
      }
      const projected = presetAfterRemoval(inventory, base, ecosystem.unitsByPreset.get(presetId), removed)
      base = projected.base
      inventory = projected.preset
      for (const id of removed) removedEquipmentLabels[id] = builtIn[id].name
    }
    equipmentIds = equipmentIds.map(id => currentEquipmentId(id, ecosystem))
    if (!validEquipmentIds(equipmentIds)) throw new Error('有重复装备，请重新选择。')
    const featured = equipment.filter(item => equipmentIds.includes(item.id))
    const selectedItems = equipmentIds.filter(id => !equipmentById.has(id)).sort()
      .map(id => ecosystem.equipment.get(id))
    if (selectedItems.some(item => !item)) throw new Error('装备来源已变化，请刷新装备库。')
    const picked = [...featured, ...selectedItems]
    const units = new Map()
    const liveTools = []
    const standingTools = []
    const chosenSources = {}
    const sourceLabels = {}
    for (const item of picked) {
      const status = item.kind
        ? statusForEcosystem(item, inventory, ecosystem, equipmentSources?.[item.id], removed)
        : statusFor(item, inventory, base, legacy.moduleName)
      if (status.state !== 'available') throw new Error(item.name + ' · ' + (status.reason ?? '该能力已包含在预设中。'))
      if (status.replacement?.remove.length) {
        const builtIn = presetEquipment(ecosystem, presetId)
        const names = status.replacement.remove.map(id => builtIn[id].name)
        throw new Error(status.replacement.tools.join('、') + ' 与 ' + names.join('、') + ' 冲突。请先换下这些自带装备。')
      }
      if (item.kind === 'tool') {
        chosenSources[item.id] = status.sourceId
        sourceLabels[item.id] = status.sourceName
        const requirement = { id: item.id, name: item.name,
          ...(typeof item.summary === 'string' ? { summary: item.summary } : {}),
          ...(status.transport ? { transport: true } : {}),
          ...(status.equipId ? { equipId: status.equipId } : { profile: true }) }
        if (status.live) liveTools.push({ ...requirement,
          ...(status.deferred ? { deferred: true } : {}) })
        else standingTools.push(requirement)
      }
      if (item.kind && !status.providerIncluded) {
        const unit = ecosystem.equipment.get(status.equipId ?? item.id)
        units.set(unit.id, { ...unit, replaceId: status.replaceId })
      }
    }

    const orderedIds = picked.map(item => item.id)
    const sessionGear = [...units.values()].filter(unit => unit.sessionRecipe)
      .map(unit => sessionEquipmentSnapshot(ecosystem, unit.id))
    const { realms, sessionRealms } = includeDependencies(units, presetId, ecosystem, removed)
    checkSelectedStandingTools(units, ecosystem)
    if (liveTools.some(tool => tool.transport && tool.profile) && [...units.keys()].some(id => ecosystem.executorUnits.has(id))) {
      throw new Error('这套出装同时选择了 Profile 执行器和会话执行器。请保留其中一个。')
    }
    const declaringBase = ecosystem.presetBases.get(presetId)
    const baseUrl = declaringBase === ctx.baseUrl ? undefined : declaringBase
    const rows = equipmentRows(base, inventory, featured.map(item => item.id), declaringBase, ctx.baseUrl, legacy.moduleName)
    const { plugins, providers } = addPluginUnits(rows, units.values(), declaringBase, ecosystem, sessionRealms)
    for (const tool of [...standingTools, ...liveTools]) {
      if (providers.has(tool.equipId)) tool.equipId = providers.get(tool.equipId)
    }
    const persistedPlugins = JSON.parse(JSON.stringify(plugins))
    if (!isDeepStrictEqual(plugins, persistedPlugins)) {
      throw new Error('此预设包含无法持久保存的插件配置。')
    }
    const composition = compositionId(presetId, orderedIds, persistedPlugins, liveTools, baseUrl, realms, chosenSources, removedEquipmentIds)
    const id = records.has(composition) ? composition : savedIdsByCurrentBase.get(composition) ?? composition
    const baseName = inventory.name ?? presetLabels.get(presetId)?.[0] ?? presetId
    const record = {
      baseId: presetId,
      baseName,
      ...(baseUrl ? { baseUrl } : {}),
      ...(realms.length ? { realms } : {}),
      equipmentIds: orderedIds,
      ...(removed.size ? { removedEquipmentIds, removedEquipmentLabels } : {}),
      ...(sessionGear.length ? { sessionGear } : {}),
      ...(Object.keys(chosenSources).length ? { equipmentSources: chosenSources, equipmentSourceLabels: sourceLabels } : {}),
      equipmentLabels: Object.fromEntries(picked.map(item => [item.id, item.name])),
      ...(liveTools.length ? { liveTools } : {}),
      ...(standingTools.length ? { standingTools } : {}),
      definition: {
        id,
        name: baseName + ' · ' + [picked.map(item => item.name).join(' + '),
          removed.size ? '卸下 ' + Object.values(removedEquipmentLabels).join('、') : ''].filter(Boolean).join(' · '),
        description: picked.map(item => item.summary).join(' '),
        plugins: persistedPlugins,
      },
    }
    return { id, record, units, removed, standingTools }
  }

  async function prepare(selection, candidate) {
    const { id, record, standingTools } = candidate ?? await plan(selection)
    if (!standingTools) return preparedPreset(id, record)
    if (records.has(id)) {
      const preset = await ctx.agentPresets.resolve(id)
      if (preset.broken) throw new Error(preset.broken)
      return preparedPreset(id, records.get(id))
    }
    if (pending.has(id)) return pending.get(id)
    if (closed) throw new Error('配装服务正在关闭，请重试。')

    const commit = async () => {
      const dispose = await register(record)
      try {
        const preset = await ctx.agentPresets.resolve(id)
        if (preset.broken) throw new Error(preset.broken)
        if (standingTools.length) {
          const scope = await ctx.agentPresets.acquireScope(id)
          try {
            const available = new Set(verifiedToolKeys(ctx, scope.key, standingTools, record.definition.plugins))
            const missing = standingTools.find(tool => !available.has(tool.id))
            if (missing) throw new Error('装备来源未向当前英雄提供工具 ' + missing.name + '。')
          } finally {
            await scope[Symbol.asyncDispose]()
          }
        }
        if (closed) throw new Error('配装服务正在关闭，请重试。')
        await saveEntry(directory, id, record)
      } catch (error) {
        await dispose()
        throw error
      }
      records.set(id, record)
      registrations.set(id, dispose)
      return preparedPreset(id, record)
    }
    const saving = commit().finally(() => pending.delete(id))
    pending.set(id, saving)
    return saving
  }

  function saveBuildPlan(selection) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const draftId = selection.draft?.presetId
    return buildPlans.write(selection, records.get(draftId)?.baseId ?? draftId, async () => {
      const { presetId } = await prepare(selection.draft)
      const record = records.get(presetId)
      const heroId = record?.baseId ?? presetId
      const heroName = record?.baseName ?? ctx.agentPresets.definitions?.get(heroId)?.config.name
        ?? presetLabels.get(heroId)?.[0] ?? heroId
      return { presetId, heroId, heroName }
    })
  }

  function recordedLoadoutDraft(original, heroId, ecosystem) {
    const sources = original ? savedToolSources(original, ecosystem) : {}
    return { presetId: heroId, equipmentIds: (original?.equipmentIds ?? []).map(id => currentEquipmentId(id, ecosystem)),
      equipmentSources: Object.fromEntries(Object.entries(sources).map(([id, source]) =>
        [currentEquipmentId(id, ecosystem), currentEquipmentId(source, ecosystem)])),
      removedEquipmentIds: (original?.removedEquipmentIds ?? []).map(id => currentEquipmentId(id, ecosystem)) }
  }

  async function retainedPreviewRecipe(presetId, candidate, ecosystem) {
    const original = records.get(presetId)
    const current = candidate.record
    if (original?.baseId !== 'standard' || !current || !ecosystem.standingByPreset.has(presetId)) return
    const plugins = current.definition.plugins.filter(row => !isDeepStrictEqual(row,
      { id: 'tool-cordis', name: '@deepseek-ai/dsh-tool-cordis' }))
    if (plugins.length !== current.definition.plugins.length - 1 ||
      !isDeepStrictEqual(original, { ...current, definition: { ...current.definition, id: presetId, plugins } })) return
    const { getDshRuntimeVersion } = await runtimeModule(ctx, '@deepseek-ai/dsh-app-boot')
    if (getDshRuntimeVersion() !== '0.2.3-alpha.2') return
    // The preview adds one tool to Standard. Run the original registered recipe
    // so a saved plan does not gain a tool that was never part of the plan.
    return { id: presetId, record: original, inventoryPresetId: presetId }
  }

  async function verifyRecordedLoadout(presetId, draft, ecosystem, retainPreview = false) {
    const preset = await ctx.agentPresets.resolve(presetId)
    const candidate = await plan(draft, ecosystem)
    if (!preset.broken) {
      if (candidate.id === presetId) return candidate
      if (retainPreview) {
        const retained = await retainedPreviewRecipe(presetId, candidate, ecosystem)
        if (retained) return retained
      }
    }
    throw new Error('本机配置已变化，无法核对这局的原出装。')
  }

  function loadoutIdentity(draft, candidate, ecosystem) {
    const sources = equippedToolBindings(candidate.record).filter(item => item.profileSourceId).map(item => {
      const entry = ecosystem.profileSources.get(item.profileSourceId)?.entry
      return [item.profileSourceId, entry?.options?.config ?? null]
    })
    const identity = jsonFingerprint([draft, candidate.record?.definition.plugins ?? ecosystem.definitions.get(draft.presetId), sources])
    if (!identity) throw new Error('无法核对当前出装的配置。')
    return identity
  }

  async function verifySavedPlan(saved, ecosystem) {
    const original = records.get(saved.presetId)
    if (!original && saved.presetId !== saved.heroId) throw new Error('方案的英雄或阵容当前不可用。')
    const draft = recordedLoadoutDraft(original, saved.heroId, ecosystem)
    const candidate = await verifyRecordedLoadout(saved.presetId, draft, ecosystem, true)
    const identity = loadoutIdentity(draft, candidate, ecosystem)
    return { draft, candidate, identity }
  }

  async function readWorkspaceMaterial(workspaceId, material, signal) {
    const workspace = ctx.get('workspaceRegistry')?.get(workspaceId)
    if (!workspace) throw new Error('请选择一个现有的工作区。')
    const digest = await digestWorkspaceMaterial(workspace.path, material, signal).catch(() => {
      signal?.throwIfAborted()
      throw new Error('无法读取所选材料，请核对工作区内的文件路径。')
    })
    return { workspace, digest }
  }

  function requestedPlanTask(selection, english) {
    const { id, revision, workspaceId } = selection
    if (![id, revision, workspaceId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 512)) {
      throw new Error('请选择出装方案和工作区。')
    }
    const fields = { id, revision, workspaceId, ...planTaskPrompt(selection, english) }
    const hash = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
    return { ...fields, hash }
  }

  async function checkPlanTask(input, signal) {
    const { id, revision, workspaceId, material, task, hash } = input
    const saved = buildPlans.read(id, revision)
    const { workspace, digest } = await readWorkspaceMaterial(workspaceId, material, signal)
    const view = { id, revision, workspaceId, workspaceTitle: workspace.title, material,
      planName: saved.name, planNote: saved.note, task }
    const cwd = workspace.path
    try {
      const ecosystem = await discover()
      const { draft, candidate, identity } = await verifySavedPlan(saved, ecosystem)
      const token = createHash('sha256').update(JSON.stringify([hash, cwd, digest, saved.presetId, identity])).digest('hex')
      signal?.throwIfAborted()
      return { view, cwd, draft, candidate, ecosystem, token }
    } catch (error) {
      signal?.throwIfAborted()
      return { view, reason: error instanceof Error ? error.message : '无法核对当前出装的配置。' }
    }
  }

  function requestedArmoryTask(selection, english) {
    const { workspaceId } = selection
    const { presetId, equipmentIds, equipmentSources = {}, removedEquipmentIds = [] } = selection.draft ?? {}
    if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 512) {
      throw new Error('请选择一个现有的工作区。')
    }
    if (typeof presetId !== 'string' || !presetId || presetId.length > 512 || !validEquipmentIds(equipmentIds)
      || !validEquipmentSources(equipmentSources, equipmentIds) || !validRemovedEquipment(removedEquipmentIds)) {
      throw new Error('预设或插件选择无效。')
    }
    const draft = { presetId, equipmentIds, equipmentSources, removedEquipmentIds }
    const fields = { draft, workspaceId, ...planTaskPrompt(selection, english) }
    const hash = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
    return { ...fields, hash }
  }

  async function checkArmoryTask({ draft, workspaceId, material, task, hash }, signal) {
    const { workspace, digest } = await readPersonalTaskMaterial(workspaceId, material, signal)
    const ecosystem = await discover()
    const hero = ecosystem.presets.find(preset => preset.id === draft.presetId)
    if (!hero) throw new Error('请从基础预设开始搭配。')
    const cwd = workspace.path
    const view = { workspaceId, workspaceTitle: workspace.title, material,
      planName: hero.name ?? presetLabels.get(hero.id)?.[0] ?? hero.id, task }
    try {
      const candidate = await plan(draft, ecosystem)
      const canonical = recordedLoadoutDraft(candidate.record, draft.presetId, ecosystem)
      const identity = comparisonLoadoutIdentity(canonical, candidate, ecosystem)
      if (!identity) throw new Error('无法核对当前出装的配置。')
      const token = createHash('sha256').update(JSON.stringify([hash, cwd, digest, candidate.id, identity])).digest('hex')
      signal?.throwIfAborted()
      return { view, cwd, digest, draft, candidate, ecosystem, token, identity }
    } catch (error) {
      signal?.throwIfAborted()
      return { view, reason: error instanceof Error ? error.message : '无法核对当前出装的配置。' }
    }
  }

  async function previewReviewedTask(checked, signal) {
    const { view, reason, draft, candidate, ecosystem, token, against } = checked
    if (!token) return { ...view, reason }
    try {
      const selection = against ? { ...draft, againstDraft: against.draft } : draft
      const comparison = await compare(selection, ecosystem, candidate, against?.candidate)
      signal?.throwIfAborted()
      const removed = historicalRemovals(candidate, presetEquipment(ecosystem, draft.presetId), ecosystem)
      return { ...view, comparison, gear: comparison.after.outfit, removed, token }
    } catch (error) {
      signal?.throwIfAborted()
      return { ...view, reason: error instanceof Error ? error.message : '无法核对当前出装的配置。' }
    }
  }

  function planTaskDetails({ header, inheritedEventCount, events }) {
    const firstTurn = events.findIndex(event => event.type === 'turn/start' || event.type === 'user/message' && event.data.source.kind === 'user')
    const launch = !header.isSeeded && inheritedEventCount === 0 && events.slice(0, firstTurn < 0 ? undefined : firstTurn)
      .find(event => event.type === planTaskRecord && event.ignorable === true && event.data.owner === planTaskOwner)?.data
    const preset = events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset ?? header.agentPreset
    const presetChanged = Boolean(header.agentPreset && preset !== header.agentPreset)
    return { header, inheritedEventCount, started: firstTurn >= 0, launch, presetChanged }
  }

  function observeNativeSession(sessionId, signal, projectionMode) {
    const query = ctx.get('sessionQuery')
    if (!query) return
    return query.observeSession(sessionId, { projectionMode, signal }).catch(error => {
      if (error.code !== 'SESSION_QUERY_SESSION_NOT_FOUND') throw error
    })
  }

  function observePlanTask(sessionId, signal, projectionMode) {
    if (typeof sessionId === 'string' && sessionId.startsWith(planTaskSessionPrefix)) {
      return observeNativeSession(sessionId, signal, projectionMode)
    }
  }

  async function planTaskSession(sessionId, signal) {
    const source = await observePlanTask(sessionId, signal, 'none')
    if (!source) return
    try {
      return planTaskDetails(source)
    } finally {
      source[Symbol.dispose]()
    }
  }

  async function restorePlanTaskDraft(sessionId, signal) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const saved = await planTaskSession(sessionId, signal)
    const presetId = saved?.header.agentPreset
    if (!saved?.launch || saved.started || !presetId) throw new Error('只能在未发送的出装任务里恢复出装。')
    const controller = ctx.get('sessionController')
    if (!controller?.resolveAgent || typeof ctx.agentPresets.select !== 'function') throw new Error('当前 DSH 无法恢复原出装。')
    const result = await controller.resolveAgent(sessionId)
    if (!result.agent) throw new Error(result.error?.message ?? '无法打开新对局。')
    signal?.throwIfAborted()
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    await ctx.agentPresets.select(result.agent, presetId)
    updates.notify(sessionId)
    return { presetId }
  }

  const reviewedTaskKinds = {
    plan: { input: requestedPlanTask, check: checkPlanTask, unavailable: '当前 DSH 无法从出装方案开启新任务。' },
    lesson: { input: requestedLessonTask, check: checkLessonTask, unavailable: '当前 DSH 无法使用练习出装开启任务。' },
    armory: { input: requestedArmoryTask, check: checkArmoryTask, unavailable: '当前 DSH 无法用当前出装开启任务。' },
    alternate: { input: requestedHeroAlternateTask, check: checkHeroAlternateTask, unavailable: '当前 DSH 无法使用练习出装开启任务。' },
    'web-source': { input: requestedWebSourcePractice, check: checkWebSourcePractice, unavailable: webSourceUnavailable },
    'web-pilot': { input: requestedWebPilot, check: checkWebSourcePractice, unavailable: webSourceUnavailable },
    'web-pilot-challenge': { input: requestedWebPilotChallenge, check: checkWebSourcePractice, unavailable: webSourceUnavailable },
  }

  async function openReviewedTask(selection, english, signal, kind = 'plan') {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const { launchId, token } = selection
    if (!validOpeningId(launchId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error('请先核对新任务的材料和出装。')
    }
    const webPilot = kind === 'web-pilot' || kind === 'web-pilot-challenge'
    const webPractice = kind === 'web-source' || webPilot
    const { input: readInput, check, unavailable } = reviewedTaskKinds[kind]
    const input = await readInput(selection, english, signal)
    const { sourcePlan, decisionReplayOf } = input
    const controller = ctx.get('sessionController')
    const registry = ctx.get('workspaceRegistry')
    if (!controller?.create || !ctx.get('sessionQuery') || !registry) {
      throw new Error(unavailable)
    }
    const sessionId = planTaskSessionPrefix + createHash('sha256').update(JSON.stringify([planTaskOwner, launchId, token, input.hash])).digest('hex').slice(0, 28)
    if (openingMatches.has(sessionId)) return openingMatches.get(sessionId)
    const reply = { sessionId, task: input.task, workspaceId: input.workspaceId }

    const open = async () => {
      const existing = await planTaskSession(sessionId, signal)
      if (sourcePlan) buildPlans.read(sourcePlan.id, sourcePlan.revision)
      if (existing?.launch?.token === token && existing.launch.request === input.hash) {
        if ((sourcePlan || decisionReplayOf) && !existing.started) {
          const checked = await check(input, signal)
          if (checked.token !== token) throw new Error('材料、任务或出装已变化，请重新核对。')
          if (sourcePlan) buildPlans.read(sourcePlan.id, sourcePlan.revision)
        }
        return (kind === 'alternate' || webPilot) && existing.started
          ? { sessionId, workspaceId: input.workspaceId } : reply
      }
      const checked = await check(input, signal)
      if (checked.token !== token) throw new Error('材料、任务或出装已变化，请重新核对。')
      const { presetId, verifyLive: verify } = await prepare(checked.draft, checked.candidate)
      if (kind === 'plan') buildPlans.read(input.id, input.revision)
      else if (!webPractice) {
        const target = await readPersonalTaskMaterial(input.workspaceId, input.material, signal)
        if (target.digest !== checked.digest || target.workspace.path !== checked.cwd) {
          throw new Error('材料、任务或出装已变化，请重新核对。')
        }
      }
      if (decisionReplayOf && (await readInput(selection, english, signal)).hash !== input.hash) throw new Error(webPilotReplayChanged)
      if (webPractice) await mkdir(directory, { recursive: true, mode: 0o700 })
      const cwd = webPractice ? join(await realpath(directory), webSourceDirectory, sessionId) : checked.cwd
      if (webPractice) {
        await mkdir(cwd, { recursive: true, mode: 0o700 })
        if (await realpath(cwd) !== cwd) throw new Error(webSourceUnavailable)
      }
      if (sourcePlan) buildPlans.read(sourcePlan.id, sourcePlan.revision)
      const workspace = webPractice ? await registry.create(cwd, 'Web Research Practice · 网页检索试玩') : registry.get(input.workspaceId)
      if (workspace?.path !== cwd) throw new Error('请选择一个现有的工作区。')
      signal?.throwIfAborted()
      if (closed) throw new Error('配装服务正在关闭，请重试。')
      if (sourcePlan) buildPlans.read(sourcePlan.id, sourcePlan.revision)
      if (existing) {
        if (existing.launch || existing.started || existing.header.isSeeded || existing.inheritedEventCount !== 0 ||
          existing.header.cwd !== cwd || existing.header.agentPreset !== presetId) {
          throw new Error('已有会话与核对过的出装任务不一致。')
        }
        if (!workspace.sessionIds.includes(sessionId)) await workspace.attachSession(sessionId)
      } else {
        const opened = await controller.create({ sessionId, workspaceId: workspace.id, agentPreset: presetId })
        if (opened.sessionId !== sessionId) throw new Error('新对局的会话标识已变化，请重新开局。')
      }
      let agent = ctx.get('agents')?.get(sessionId)
      if (!agent) {
        const result = await controller.resolveAgent(sessionId)
        if (!result.agent) throw new Error(result.error?.message ?? '无法打开新对局。')
        agent = result.agent
      }
      if (verify) verifyLive({ presetId, sessionId })
      const { planName, material, task, source } = checked.view
      if (source?.heroDeliveryTrial && !heroTrialLive(lighthouseHeroDelivery, presetId, agent)) throw new Error(heroDeliveryChanged)
      if (checked.stockBindings && !stockTrialLive(source.arm, presetId, agent, checked.stockBindings)) throw new Error(stockTransferChanged)
      const webSourcePractice = webPractice && liveWebSourceBinding(agent, presetId, workspace.id, checked.webToolId,
        input.arm, checked.webToolSource)
      const armory = kind === 'armory'
      const target = (source || armory) && { workspaceId: workspace.id, digest: checked.digest, presetId, identity: checked.identity,
        ...(source && isMinimalTrialSource(source) && { textBinding: checked.stockBindings[0] }) }
      if (sourcePlan) buildPlans.read(sourcePlan.id, sourcePlan.revision)
      appendPluginRecord(agent.session, planTaskRecord, { owner: planTaskOwner, request: input.hash, token, planName, task,
        ...(material !== undefined && { material }), ...(target && { target }), ...(source && { source }), ...(armory && { armory }), ...(webSourcePractice && { webSourcePractice }),
        ...(kind === 'web-pilot' && input.replayOf && { webPilotReplayOf: input.replayOf }),
        ...(decisionReplayOf && { webPilotDecisionReplayOf: decisionReplayOf }),
        ...(kind === 'web-pilot' && input.openingChoice && { webPilotOpeningChoice: input.openingChoice }),
        ...(kind === 'web-pilot-challenge' && input.reportCode && { webPilotReceivedReport: input.reportCode }),
        ...(checked.handoffAlternateOf && { handoffAlternateOf: checked.handoffAlternateOf }),
        ...(kind === 'alternate' && { alternateOf: input.alternateOf }) })
      updates.notify(sessionId)
      return reply
    }
    const work = open().finally(() => openingMatches.delete(sessionId))
    openingMatches.set(sessionId, work)
    return work
  }

  async function shareEnvironment(currentEcosystem) {
    const [ecosystem, boot] = await Promise.all([
      currentEcosystem ?? discover(), runtimeModule(ctx, '@deepseek-ai/dsh-app-boot'),
    ])
    return { ecosystem, sources: buildShareSources(ctx, ecosystem, boot), runtime: boot.getDshRuntimeVersion() }
  }

  function requestedWebSourcePractice({ sampleLanguage }, english) {
    if (sampleLanguage !== undefined && sampleLanguage !== 'en' && sampleLanguage !== 'zh') {
      throw new Error(webSourceChanged)
    }
    const task = webSourceTask(sampleLanguage === undefined ? english : sampleLanguage === 'en')
    const hash = createHash('sha256').update(task).digest('hex')
    return { task, hash }
  }

  function webPilotOpeningHash(arm, task, openingChoice) {
    const request = openingChoice ? [arm, task, openingChoice] : [arm, task]
    return createHash('sha256').update(JSON.stringify(request)).digest('hex')
  }

  async function requestedWebPilot({ arm, sampleLanguage, parentSessionId, sourcePlan, openingChoice, decisionReplayOf }, english, signal) {
    if (!['standard', 'evidence'].includes(arm) || ![undefined, 'en', 'zh'].includes(sampleLanguage)) throw new Error(webSourceChanged)
    if (decisionReplayOf !== undefined) {
      if (arm !== 'evidence' || parentSessionId !== undefined || sourcePlan !== undefined || openingChoice !== undefined) {
        throw new Error(webPilotReplayChanged)
      }
      const { original } = await webPilotReplayParent(decisionReplayOf, signal)
      if (!canReplayWebPilotDecision(original) ||
        (sampleLanguage !== undefined && sampleLanguage !== original.view.sampleLanguage)) throw new Error(webPilotReplayChanged)
      return { arm, task: original.task, hash: webPilotDecisionReplayHash(original), decisionReplayOf,
        replayBinding: original.binding, sampleLanguage: original.view.sampleLanguage,
        previousDecision: original.view.practiceDecision.actual }
    }
    if (openingChoice !== undefined && (parentSessionId !== undefined || sourcePlan !== undefined ||
      !lighthouseEvidenceChoices.includes(openingChoice))) throw new Error(webSourceChanged)
    if (sourcePlan !== undefined) {
      if (!sourcePlan || typeof sourcePlan.id !== 'string' || typeof sourcePlan.revision !== 'string') {
        throw new Error(webPilotReplayChanged)
      }
      const { plan, run } = await readTestedWebPilotPlan(sourcePlan, signal)
      if (!completedCanonicalWebPilot(run) || run.binding.arm === arm ||
        (parentSessionId !== undefined && parentSessionId !== run.sessionId) ||
        (sampleLanguage !== undefined && sampleLanguage !== run.view.sampleLanguage)) throw new Error(webPilotReplayChanged)
      const { sessionId, task, binding } = run
      const planRef = { id: plan.id, revision: plan.revision }
      const hash = createHash('sha256').update(JSON.stringify([
        'plan-web-pilot-replay', planRef.id, planRef.revision, arm, task, sessionId, binding.id, binding.sourceId,
      ])).digest('hex')
      return { arm, task, hash, replayOf: sessionId, replayBinding: binding, sourcePlan: planRef,
        sampleLanguage: run.view.sampleLanguage }
    }
    if (parentSessionId === undefined) {
      const task = webPilotTask(sampleLanguage === undefined ? english : sampleLanguage === 'en')
      const hash = webPilotOpeningHash(arm, task, openingChoice)
      return { arm, task, hash, openingChoice }
    }
    const parent = await inspectWebSourcePractice({ sessionId: parentSessionId }, signal)
    if (!completedWebPilot(parent) || parent.binding.arm === arm) throw new Error(webPilotReplayChanged)
    const { task, binding } = parent
    const hash = createHash('sha256').update(JSON.stringify([arm, task, parentSessionId, binding.id, binding.sourceId])).digest('hex')
    return { arm, task, hash, replayOf: parentSessionId, replayBinding: binding }
  }

  function webPilotChallengeContext({ code, reportCode }) {
    const invitation = decodeWebPilotChallenge(code)
    if (reportCode === undefined) return { invitation }
    const report = decodeWebPilotReport(reportCode)
    if (report.sampleLanguage !== invitation.sampleLanguage || report.played !== invitation.played) {
      throw new Error(webSourceChanged)
    }
    return { invitation, reportCode: encodeWebPilotReport(report) }
  }

  function webPilotChallengeInput({ invitation, reportCode }, arm) {
    if (!['standard', 'evidence'].includes(arm)) throw new Error(webSourceChanged)
    const { sampleLanguage, played } = invitation
    const task = webPilotTask(sampleLanguage === 'en')
    const code = encodeWebPilotChallenge(sampleLanguage, played)
    const parts = ['web-pilot-challenge', code, arm, task]
    if (reportCode) parts.push(reportCode)
    const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex')
    return { arm, task, hash, reportCode }
  }

  function requestedWebPilotChallenge(selection) {
    return webPilotChallengeInput(webPilotChallengeContext(selection), selection.arm)
  }

  async function previewWebPilotChallenge(selection, signal) {
    const context = webPilotChallengeContext(selection)
    const { invitation } = context
    const { arm } = selection
    if (arm !== undefined && !['standard', 'evidence'].includes(arm)) throw new Error(webSourceChanged)
    const environment = canOpenWebPractice() && await shareEnvironment().catch(() => null)
    const available = environment ? (await Promise.all(['standard', 'evidence'].map(async option => {
      const input = webPilotChallengeInput(context, option)
      try {
        const { token } = await checkWebSourcePractice(input, signal, environment)
        return { arm: option, token }
      } catch {
        signal?.throwIfAborted()
      }
    }))).filter(Boolean) : []
    signal?.throwIfAborted()
    const selected = available.find(option => option.arm === arm)
    const view = { kind: 'web-pilot', ...invitation, task: webPilotTask(invitation.sampleLanguage === 'en'),
      arms: available.map(option => option.arm) }
    if (selected) return { ...view, ...selected }
    if (!available.length || arm !== undefined) return { ...view, reason: webSourceUnavailable }
    return view
  }

  async function previewWebPilotReportTrial({ code }, signal) {
    const { sampleLanguage, played } = decodeWebPilotReport(code)
    const invitation = encodeWebPilotChallenge(sampleLanguage, played)
    return { code: invitation, preview: await previewWebPilotChallenge({ code: invitation }, signal) }
  }

  function pilotWebTool(scope) {
    const origins = ctx.get('agentLoadoutToolOrigins')
    if (webPilotTools.every(([name, module]) => {
      const tool = ctx.tools.get(name, scope)
      return tool && origins?.get(tool, scope)?.moduleName === module
    })) return ctx.tools.get('web_fetch', scope)
  }

  function canOpenWebPractice() {
    const controller = ctx.get('sessionController')
    return toolRuntime && controller?.create && controller.resolveAgent && ctx.get('sessionQuery') &&
      ctx.get('workspaceRegistry')?.create
  }

  async function webPracticeAvailability(ecosystem) {
    if (!canOpenWebPractice()) return { source: false, pilot: false }
    const environment = await shareEnvironment(ecosystem).catch(() => null)
    if (!environment) return { source: false, pilot: false }
    const [source, standard, evidence] = await Promise.all([undefined, 'standard', 'evidence']
      .map(arm => plannedWebSourceLoadout(undefined, arm, environment).catch(() => null)))
    return { source: Boolean(source), pilot: Boolean(standard && evidence &&
      standard.webToolId === evidence.webToolId && standard.webToolSource === evidence.webToolSource) }
  }

  async function plannedWebSourceLoadout(signal, arm, environment) {
    if (!canOpenWebPractice()) {
      throw new Error(webSourceUnavailable)
    }
    const { ecosystem, sources } = environment ?? await shareEnvironment()
    const presetId = arm ? 'standard' : 'minimal'
    const preset = ecosystem.presets.find(item => item.id === presetId)
    if (!preset || preset.broken || sources.hero(presetId)?.owner.package !== '@deepseek-ai/dsh-web-app') {
      throw new Error(webSourceUnavailable)
    }
    const equipmentIds = arm === 'evidence' ? ['evidence'] : arm ? [] : ['web']
    const draft = { presetId, equipmentIds, equipmentSources: {}, removedEquipmentIds: [] }
    const baseline = [...summarizeCapabilities(ecosystem, presetId, {}).values()]
      .filter(item => item.kind === 'tool')
    const standing = item => !item.timing || (arm && item.timing === 'condition')
    const hasTool = name => baseline.some(item => item.name === name)
    const units = ecosystem.unitsByPreset.get(presetId) ?? []
    const nativeSource = (source, module) => units.some(unit => unit.active && unit.id === source && unit.modules.includes(module))
    const hasNativeTool = ([name, module]) => baseline.some(item =>
      item.name === name && standing(item) && nativeSource(item.sourceId, module))
    if (arm ? !webPilotTools.every(hasNativeTool) : !hasTool('bash') || hasTool('web_fetch')) {
      throw new Error(webSourceUnavailable)
    }
    const candidate = await plan(draft, ecosystem)
    const choices = [...plannedGear(ecosystem, presetId, candidate, []).values()]
    const fetches = choices.filter(item => item.kind === 'tool' && item.name === 'web_fetch' && standing(item))
    if (fetches.length !== 1) throw new Error(webSourceUnavailable)
    const [{ id: webToolId, sourceId }] = fetches
    if (arm && (!nativeSource(sourceId, webSourceModule) || !baseline.some(item => item.id === webToolId && item.sourceId === sourceId))) {
      throw new Error(webSourceUnavailable)
    }
    signal?.throwIfAborted()
    return { draft, candidate, webToolId, webToolSource: arm ? sourceId : undefined }
  }

  async function checkWebSourcePractice({ task, hash, arm, replayBinding, decisionReplayOf }, signal, environment) {
    const { draft, candidate, webToolId, webToolSource } = await plannedWebSourceLoadout(signal, arm, environment)
    if (replayBinding && (replayBinding.id !== webToolId || replayBinding.sourceId !== webToolSource ||
      (decisionReplayOf && replayBinding.presetId !== candidate.id))) {
      throw new Error(webPilotReplayChanged)
    }
    const token = createHash('sha256').update(JSON.stringify([planTaskOwner, hash, candidate.id, webToolId, ...(arm ? [webToolSource] : [])])).digest('hex')
    const planName = arm === 'evidence' ? '标准模式 + 证据核验' : arm ? '标准模式' : '网页检索'
    return { token, draft, candidate, webToolId, webToolSource, view: { planName, task } }
  }

  async function previewWebSourcePractice(selection, english, signal) {
    const checked = await checkWebSourcePractice(requestedWebSourcePractice(selection, english), signal)
    return { token: checked.token, oldVersion: webSourceOldVersion, version: webSourceVersion,
      hostVersion: webSourceHostVersion }
  }

  async function previewWebPilot(selection, english, signal) {
    const input = await requestedWebPilot(selection, english, signal)
    const { token } = await checkWebSourcePractice(input, signal)
    return { token, arm: input.arm, version: webSourceVersion, hostVersion: webSourceHostVersion,
      ...(input.openingChoice && { openingChoice: input.openingChoice }),
      ...((input.sourcePlan || input.decisionReplayOf) && { task: input.task, sampleLanguage: input.sampleLanguage }),
      ...(input.decisionReplayOf && { previousDecision: input.previousDecision }) }
  }

  function liveWebSourceBinding(agent, presetId, workspaceId, expectedToolId, arm, expectedSource) {
    const scope = agent && toolRuntime?.scopeOf(agent.ctx)
    const definition = scope && ctx.tools.get('web_fetch', scope)
    const origins = ctx.get('agentLoadoutToolOrigins')
    const origin = definition && origins?.get(definition, scope)
    if (origin?.moduleName !== webSourceModule) throw new Error(webSourceChanged)
    const { id, sourceId } = dispatchedToolDetails(ctx, scope, definition, agent.ctx, records.get(presetId)?.definition.plugins)
    if (id !== expectedToolId || !sourceId) throw new Error(webSourceChanged)
    if (arm && (sourceId !== expectedSource || pilotWebTool(scope) !== definition ||
      ctx.agentPresets.composedPreset(agent.ctx) !== presetId)) throw new Error(webSourceChanged)
    return { id, sourceId, workspaceId, presetId, ...(arm && { arm }) }
  }

  function webPilotResult(outcome, binding, task, receipt) {
    const { status, entries = [], deliverables = [] } = outcome
    const decision = receipt && entries.findLast(entry => entry.name === 'ask_user_question' && !entry.nested &&
      entry.state === 'completed' && entry.seq > receipt.seq && entry.choices?.length)
    return { status, arm: binding.arm, sampleLanguage: task.startsWith('[') ? 'en' : 'zh', verified: Boolean(receipt),
      ...(receipt && { url: webSourceUrl, version: webSourceVersion, hostVersion: webSourceHostVersion }),
      ...(decision && { choice: decision.choices.join(' / ') }),
      ...(status === 'complete' && { deliverables: completedPresentDelivery(outcome) ? deliverables.map(file => file.name) : [] }) }
  }

  function observedWebPilotReport(launch, arm) {
    if (launch.webPilotReceivedReport === undefined) return
    try {
      const invitation = decodeWebPilotReport(launch.webPilotReceivedReport)
      const reportCode = encodeWebPilotReport(invitation)
      const { hash, task } = webPilotChallengeInput({ invitation, reportCode }, arm)
      if (task === launch.task && hash === launch.request) return invitation
    } catch {
      // Ignore a malformed optional report in an archived round.
    }
  }

  async function inspectWebSourcePractice({ sessionId }, signal, { handoff = false, handoffTask, practiceDecision = false } = {}) {
    if (typeof sessionId !== 'string' || !heroAlternateSessionId.test(sessionId)) return null
    const source = await observePlanTask(sessionId, signal, 'all')
    if (!source) return null
    try {
      const { header, launch, started } = planTaskDetails(source)
      const binding = launch?.webSourcePractice
      const workspace = binding && ctx.get('workspaceRegistry')?.get(binding.workspaceId)
      if (!workspace || header.cwd !== workspace.path || !workspace.sessionIds.includes(sessionId) ||
        header.agentPreset !== binding.presetId || (handoffTask && launch.task !== handoffTask)) return null
      const pilot = Boolean(binding.arm)
      if (!started) return { view: { status: 'waiting', ...(pilot && { arm: binding.arm, verified: false }) }, binding }
      const outcome = await comparisonEvidence(source, {
        cwd: header.cwd, task: launch.task, presetId: binding.presetId, exactMessages: true,
        ...(pilot && { includeQuestions: true, includeToolCoordinates: true, linkedChoicesOnly: true, verifyMaterialProof: false,
          includeWindows: handoff || practiceDecision }),
      }, receipts)
      if (pilot) {
        const receipt = observedWebSourceResult(source.events, outcome.turn, binding)
        const result = { view: webPilotResult(outcome, binding, launch.task, receipt), binding,
          task: launch.task, replayOf: launch.webPilotReplayOf, decisionReplayOf: launch.webPilotDecisionReplayOf,
          ...(launch.webPilotDecisionReplayOf && { decisionReplayRequest: launch.request }) }
        if (completedCanonicalWebPilot(result)) {
          result.receivedReport = observedWebPilotReport(launch, binding.arm)
          if (handoff || practiceDecision) {
            const showConsequence = practiceDecision && binding.arm === 'evidence'
            const { choices, custom, delivered, answerSeq } = webPilotHandoffOutcome(source.events, outcome.windows, receipt.seq,
              { includeAnswerSeq: showConsequence })
            const decision = choices ? (!custom && lighthouseEvidenceDecision(choices)) || 'answered' : 'none'
            if (handoff) {
              result.handoff = { sampleLanguage: result.view.sampleLanguage, played: binding.arm, decision, delivered }
              result.openedAt = header.createdAt
            }
            if (practiceDecision) {
              const initial = launch.webPilotOpeningChoice
              const hasInitial = lighthouseEvidenceChoices.includes(initial) &&
                launch.request === webPilotOpeningHash(binding.arm, launch.task, initial)
              const practice = { ...(hasInitial && { initial }), actual: decision }
              if (showConsequence && lighthouseEvidenceChoices.includes(decision)) {
                const consequence = practice.consequence = { kind: decision }
                if (decision === 'gather') {
                  const read = observedWebPilotFollowupRead(source.events, outcome.windows, answerSeq, binding)
                  if (read) consequence.read = read
                } else if (decision === 'qualify') consequence.delivered = delivered
              }
              result.view.practiceDecision = practice
            }
          }
        }
        return result
      }
      const { status, turn } = outcome
      if (status !== 'complete') return { view: { status } }
      const verified = observedWebSource(source.events, turn, binding)
      const sampleLanguage = launch.task === webSourceTask(true) ? 'en' : launch.task === webSourceTask(false) ? 'zh' : undefined
      const decisionDirectory = join(directory, 'web-source-decisions')
      const decision = await readFile(join(decisionDirectory, sessionId + '.json'), 'utf8').then(JSON.parse).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })
      const view = { status, verified, sampleLanguage,
        ...(verified && { url: webSourceUrl, version: webSourceVersion, hostVersion: webSourceHostVersion }),
        ...(decision?.sessionId === sessionId && (decision.choice === 'pending' || verified && decision.choice === 'use-current') &&
          { choice: decision.choice }) }
      return { view, binding }
    } finally {
      source[Symbol.dispose]()
    }
  }

  async function readWebSourcePractice(selection, signal) {
    const result = await inspectWebSourcePractice(selection, signal)
    return result && !result.binding?.arm ? result.view : null
  }

  function completedWebPilot(result) {
    return ['standard', 'evidence'].includes(result?.binding?.arm) && result.view.status === 'complete' && result.view.verified
  }

  function completedCanonicalWebPilot(result) {
    return completedWebPilot(result) && result.task === webPilotTask(result.view.sampleLanguage === 'en')
  }

  async function shareWebPilotChallenge({ sessionId }, signal) {
    const result = await inspectWebSourcePractice({ sessionId }, signal)
    if (!completedCanonicalWebPilot(result)) {
      throw new Error('请先完成并核验一局公开网页试玩。')
    }
    const { sampleLanguage } = result.view
    const played = result.binding.arm
    return { code: encodeWebPilotChallenge(sampleLanguage, played), sampleLanguage, played }
  }

  async function shareWebPilotReport({ sessionId }, signal) {
    const result = await inspectWebSourcePractice({ sessionId }, signal, { handoff: true })
    if (!result?.handoff) throw new Error('请先完成并核验一局公开网页试玩。')
    return { code: encodeWebPilotReport(result.handoff), local: result.handoff }
  }

  async function compareWebPilotReport({ sessionId, code }, signal) {
    const friend = decodeWebPilotReport(code)
    const report = await shareWebPilotReport({ sessionId }, signal)
    if (friend.sampleLanguage !== report.local.sampleLanguage) throw new Error('这份试玩战报的原题语言和本局不同。')
    return { ...report, friend }
  }

  async function compareReceivedWebPilotReport({ sessionId }, signal) {
    const result = await inspectWebSourcePractice({ sessionId }, signal, { handoff: true })
    if (!result?.handoff || !result.receivedReport) throw new Error('这局没有可对照的好友战报。')
    return { code: encodeWebPilotReport(result.handoff), local: result.handoff, friend: result.receivedReport }
  }

  function matchesWebPilotNativeTask(original, task, binding) {
    return original.task === task && original.binding.workspaceId !== binding.workspaceId &&
      original.binding.id === binding.id && original.binding.sourceId === binding.sourceId
  }

  function matchesWebPilotReplay(original, task, binding) {
    return ['standard', 'evidence'].includes(binding?.arm) && original.binding.arm !== binding.arm &&
      matchesWebPilotNativeTask(original, task, binding)
  }

  function canReplayWebPilotDecision(run) {
    return completedCanonicalWebPilot(run) && run.binding.arm === 'evidence' &&
      lighthouseEvidenceChoices.includes(run.view.practiceDecision?.actual)
  }

  function webPilotDecisionReplayHash(original) {
    const { sessionId, task, binding, view } = original
    return createHash('sha256').update(JSON.stringify(['web-pilot-decision-replay', sessionId, task,
      binding.arm, binding.presetId, binding.id, binding.sourceId, view.practiceDecision.actual])).digest('hex')
  }

  function matchesWebPilotDecisionReplay(original, task, binding, request) {
    return binding?.arm === 'evidence' && canReplayWebPilotDecision(original) &&
      original.binding.presetId === binding.presetId && matchesWebPilotNativeTask(original, task, binding) &&
      request === webPilotDecisionReplayHash(original)
  }

  async function verifiedWebPilotPair(sessionId, result, signal, parent) {
    if (!completedWebPilot(result)) return
    const { binding, view, replayOf } = result
    if (!replayOf || replayOf === sessionId) return
    if (parent && parent.sessionId !== replayOf) return
    const original = parent ?? await inspectWebSourcePractice({ sessionId: replayOf }, signal).catch(() => {
      signal?.throwIfAborted()
      return null
    })
    if (!completedWebPilot(original) || original.view.url !== view.url ||
      !matchesWebPilotReplay(original, result.task, binding)) return
    return [{ ...original, sessionId: replayOf }, { ...result, sessionId }]
  }

  function webPilotComparison(pair) {
    const runs = pair.map(({ sessionId, view: { arm, choice, deliverables } }) =>
      ({ sessionId, arm, ...(choice && { choice }), deliverables }))
    return { url: pair[1].view.url, runs }
  }

  function webPilotDecisionComparison(sessionId, result, reference) {
    const { original, registry, root } = reference
    if (!completedCanonicalWebPilot(result) || result.replayOf || result.decisionReplayOf !== original.sessionId ||
      original.sessionId === sessionId || result.view.url !== original.view.url ||
      !matchesWebPilotDecisionReplay(original, result.task, result.binding, result.decisionReplayRequest) ||
      !webPilotWorkspace(registry.get(result.binding.workspaceId), root, sessionId)) return
    const runs = [original, { ...result, sessionId }].map(({ sessionId, view: { arm, choice, deliverables, practiceDecision } }) =>
      ({ sessionId, arm, ...(choice && { choice }), deliverables, practiceDecision }))
    return { url: result.view.url, runs }
  }

  function webPilotWorkspace(workspace, root, sessionId) {
    return heroAlternateSessionId.test(sessionId) && workspace?.path === join(root, sessionId) &&
      workspace.sessionIds.includes(sessionId)
  }

  async function webPilotReplayParent(sessionId, signal) {
    const original = await inspectWebSourcePractice({ sessionId }, signal, { practiceDecision: true })
    if (!completedWebPilot(original)) throw new Error(webPilotReplayUnavailable)
    const registry = ctx.get('workspaceRegistry')
    const root = join(await realpath(directory), webSourceDirectory)
    if (!webPilotWorkspace(registry?.get(original.binding.workspaceId), root, sessionId)) {
      throw new Error(webPilotReplayUnavailable)
    }
    return { original: { ...original, sessionId }, registry, root }
  }

  function waitingWebPilotChoice(result, binding) {
    return binding.arm === 'evidence' && result?.view.status === 'waiting-choice' && result.view.verified &&
      isDeepStrictEqual(result.binding, binding)
  }

  async function readWebPilotReplay(sessionId, reference, signal, { details = false, includeWaitingChoices = false } = {}) {
    const { original, registry, root } = reference
    if (typeof sessionId !== 'string' || !heroAlternateSessionId.test(sessionId) || sessionId === original.sessionId) return
    const saved = await planTaskSession(sessionId, signal)
    const { launch, header } = saved ?? {}
    const binding = launch?.webSourcePractice
    const workspace = binding && registry.get(binding.workspaceId)
    if (!webPilotWorkspace(workspace, root, sessionId) || header.cwd !== workspace.path ||
      header.agentPreset !== binding.presetId || header.parentSession) return
    const decisionReplay = launch.webPilotDecisionReplayOf === original.sessionId
    const matches = decisionReplay
      ? !launch.webPilotReplayOf && matchesWebPilotDecisionReplay(original, launch.task, binding, launch.request)
      : launch.webPilotReplayOf === original.sessionId && !launch.webPilotDecisionReplayOf &&
        matchesWebPilotReplay(original, launch.task, binding)
    if (!matches) return
    const run = { sessionId, arm: binding.arm, openedAt: header.createdAt, ...(decisionReplay && { decisionReplay: true }) }
    if (!saved.started) {
      if (saved.presetChanged || await realpath(workspace.path).catch(() => null) !== workspace.path) return
      if (decisionReplay && details) {
        const { candidate, webToolId, webToolSource } = await plannedWebSourceLoadout(signal, binding.arm)
        if (candidate.id !== binding.presetId || webToolId !== binding.id || webToolSource !== binding.sourceId) {
          throw new Error(webPilotReplayChanged)
        }
      }
      return { run: { ...run, status: 'waiting' } }
    }
    const result = await inspectWebSourcePractice({ sessionId }, signal, { practiceDecision: details || decisionReplay })
    if (includeWaitingChoices && !saved.presetChanged && waitingWebPilotChoice(result, binding)) {
      return { run: { ...run, status: 'waiting-choice' } }
    }
    const decisionComparison = decisionReplay ? webPilotDecisionComparison(sessionId, result, reference) : undefined
    const pair = decisionReplay ? undefined : await verifiedWebPilotPair(sessionId, result, signal, original)
    if (pair || decisionComparison) {
      const { choice, deliverables } = result.view
      return { run: { ...run, status: 'complete', ...(choice && { choice }), deliverables }, result, pair, decisionComparison }
    }
  }

  function webPilotPageBoundary(before, unavailable) {
    if (before === undefined) return
    const fields = typeof before === 'string' && /^(\d{1,16}):(session-a076[a-f0-9]{28})$/.exec(before)
    if (!fields || !Number.isSafeInteger(Number(fields[1]))) throw new Error(unavailable)
    return { createdAt: Number(fields[1]), id: fields[2] }
  }

  async function webPilotRunPage({ registry, root, previous, exclude }, signal, readRun) {
    const order = (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
    const candidates = registry.list().flatMap(workspace => {
      const id = basename(workspace.path)
      if (id !== exclude && webPilotWorkspace(workspace, root, id)) {
        const candidate = { id, createdAt: Date.parse(workspace.createdAt) || 0 }
        if (!previous || order(candidate, previous) > 0) return [candidate]
      }
      return []
    }).sort(order)
    const runs = []
    const limit = Math.min(candidates.length, 48)
    let inspected = 0
    while (inspected < limit && runs.length < 12) {
      signal?.throwIfAborted()
      const batch = candidates.slice(inspected, inspected + Math.min(6, 12 - runs.length, limit - inspected))
      const results = await Promise.all(batch.map(({ id }) => readRun(id).catch(() => {
        signal?.throwIfAborted()
      })))
      runs.push(...results.filter(Boolean))
      inspected += batch.length
    }
    const last = candidates[inspected - 1]
    return { runs, ...(last && inspected < candidates.length && { nextBefore: `${last.createdAt}:${last.id}` }) }
  }

  async function webPilotReplays({ sessionId, before, includeWaitingChoices }, signal) {
    const previous = webPilotPageBoundary(before, webPilotReplayUnavailable)
    const reference = await webPilotReplayParent(sessionId, signal)
    return webPilotRunPage({ ...reference, previous, exclude: sessionId }, signal,
      async id => (await readWebPilotReplay(id, reference, signal, { includeWaitingChoices: includeWaitingChoices === true }))?.run)
  }

  async function webPilotPracticeRoot() {
    const profileDirectory = await realpath(directory).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
    if (profileDirectory) return join(profileDirectory, webSourceDirectory)
  }

  async function pendingFirstWebPilotDraft(sessionId, registry, root, signal, { includeWaitingChoices = false } = {}) {
    if (typeof sessionId !== 'string' || !heroAlternateSessionId.test(sessionId)) return
    const saved = await planTaskSession(sessionId, signal)
    const { launch, header } = saved ?? {}
    const binding = launch?.webSourcePractice
    if (!binding || !['standard', 'evidence'].includes(binding.arm) || header.parentSession ||
      header.agentPreset !== binding.presetId || (saved.started && (!includeWaitingChoices || saved.presetChanged))) return
    const workspace = registry.get(binding.workspaceId)
    if (header.cwd !== workspace?.path || !webPilotWorkspace(workspace, root, sessionId)) return
    const sampleLanguage = ['en', 'zh'].find(language => launch.task === webPilotTask(language === 'en'))
    const choice = launch.webPilotOpeningChoice
    if (!sampleLanguage || (choice !== undefined && !lighthouseEvidenceChoices.includes(choice)) ||
      launch.request !== webPilotOpeningHash(binding.arm, launch.task, choice)) return
    const run = { sessionId, arm: binding.arm, openedAt: header.createdAt, sampleLanguage,
      ...(saved.presetChanged && { presetChanged: true }) }
    if (saved.started) {
      if (binding.arm !== 'evidence') return
      const result = await inspectWebSourcePractice({ sessionId }, signal)
      if (!waitingWebPilotChoice(result, binding)) return
      run.waitingChoice = true
    }
    return { run, binding }
  }

  async function webPilotPending({ before, includeWaitingChoices }, signal) {
    const previous = webPilotPageBoundary(before, '找不到这页试玩草稿。')
    const registry = ctx.get('workspaceRegistry')
    const root = await webPilotPracticeRoot()
    if (!registry || !root) return { runs: [] }
    return webPilotRunPage({ registry, root, previous }, signal,
      async id => (await pendingFirstWebPilotDraft(id, registry, root, signal, { includeWaitingChoices: includeWaitingChoices === true }))?.run)
  }

  async function resumeFirstWebPilotDraft({ sessionId, presetChanged, waitingChoice }, signal) {
    const unavailable = waitingChoice === true ? '这局已不在等待选择，请重新核对。' : '这份试玩草稿已变化，请重新核对。'
    if (![undefined, true].includes(presetChanged) || ![undefined, true].includes(waitingChoice) ||
      (presetChanged && waitingChoice)) throw new Error(unavailable)
    const registry = ctx.get('workspaceRegistry')
    const root = await webPilotPracticeRoot()
    const options = { includeWaitingChoices: waitingChoice === true }
    const pending = registry && root && await pendingFirstWebPilotDraft(sessionId, registry, root, signal, options)
    if (!pending || pending.run.presetChanged !== presetChanged || pending.run.waitingChoice !== waitingChoice) throw new Error(unavailable)
    await verifiedWebPilotBinding(pending.binding, signal)
    if (!isDeepStrictEqual(await pendingFirstWebPilotDraft(sessionId, registry, root, signal, options), pending)) {
      throw new Error(unavailable)
    }
    signal?.throwIfAborted()
    return { sessionId }
  }

  async function findWebPilotReports({ code, before }, signal) {
    const friend = decodeWebPilotReport(code)
    const previous = webPilotPageBoundary(before, '找不到这页网页试玩战报。')
    const registry = ctx.get('workspaceRegistry')
    const root = await webPilotPracticeRoot()
    if (!registry || !root) return { friend, runs: [] }
    const handoffTask = webPilotTask(friend.sampleLanguage === 'en')
    const page = await webPilotRunPage({ registry, root, previous }, signal, async sessionId => {
      const result = await inspectWebSourcePractice({ sessionId }, signal, { handoff: true, handoffTask })
      if (result?.handoff && webPilotWorkspace(registry.get(result.binding.workspaceId), root, sessionId)) {
        return { sessionId, openedAt: result.openedAt, ...result.handoff }
      }
    })
    return { friend, ...page }
  }

  async function readWebPilot({ sessionId, originalSessionId, includeWaitingChoices }, signal) {
    if (originalSessionId !== undefined) {
      const reference = await webPilotReplayParent(originalSessionId, signal)
      const replay = await readWebPilotReplay(sessionId, reference, signal,
        { details: true, includeWaitingChoices: includeWaitingChoices === true })
      if (!replay) throw new Error(webPilotReplayUnavailable)
      if (replay.decisionComparison) return { ...replay.result.view, sessionId, decisionReplay: true,
        decisionComparison: replay.decisionComparison }
      return replay.pair
        ? { ...replay.pair[1].view, sessionId, comparison: webPilotComparison(replay.pair) }
        : replay.run
    }
    const result = await inspectWebSourcePractice({ sessionId }, signal, { practiceDecision: true })
    if (!result?.binding?.arm) return null
    const pair = await verifiedWebPilotPair(sessionId, result, signal)
    const decisionParent = completedCanonicalWebPilot(result) && result.decisionReplayOf &&
      await webPilotReplayParent(result.decisionReplayOf, signal).catch(() => {
        signal?.throwIfAborted()
        return null
      })
    const decisionComparison = decisionParent && webPilotDecisionComparison(sessionId, result, decisionParent)
    return { ...result.view, ...(completedWebPilot(result) && { canReviewReplays: true }),
      ...(canReplayWebPilotDecision(result) && { canReplayDecision: true }),
      ...(result.receivedReport && { hasReceivedReport: true }),
      ...(pair && { comparison: webPilotComparison(pair) }),
      ...(decisionComparison && { decisionComparison }) }
  }

  async function verifiedWebSourceLoadout(sessionId, signal) {
    const original = await inspectWebSourcePractice({ sessionId }, signal)
    if (original?.view.status !== 'complete' || original.binding.arm || !original.view.verified || original.view.choice !== 'use-current') {
      throw new Error('请先核验试玩原文并选择采用新版清单。')
    }
    const { binding } = original
    const planned = await plannedWebSourceLoadout(signal)
    if (planned.candidate.id !== binding.presetId || planned.webToolId !== binding.id) throw new Error(webSourceChanged)
    return { ...planned, binding }
  }

  async function webSourcePersonalOptions({ sessionId }, signal) {
    await verifiedWebSourceLoadout(sessionId, signal)
    return { workspaceIds: await personalWorkspaceIds(signal) }
  }

  async function verifiedWebPilotDecisionBinding({ sessionId, decisionOriginSessionId, arm, received }, signal) {
    if (arm !== undefined || received !== undefined) throw new Error(webPilotPersonalUnavailable)
    const reference = await webPilotReplayParent(decisionOriginSessionId, signal)
    const replay = await readWebPilotReplay(sessionId, reference, signal)
    if (!replay?.decisionComparison) throw new Error(webPilotPersonalUnavailable)
    return replay.result.binding
  }

  async function verifiedWebPilotOppositeLoadout(sessionId, arm, signal) {
    if (!['standard', 'evidence'].includes(arm)) throw new Error(webPilotPersonalUnavailable)
    const result = await inspectWebSourcePractice({ sessionId }, signal)
    const pair = await verifiedWebPilotPair(sessionId, result, signal)
    const selected = pair?.find(run => run.binding.arm === arm)
    if (!selected) throw new Error(webPilotPersonalUnavailable)
    return { binding: selected.binding,
      personalOrigin: { originSessionId: pair[0].sessionId, replaySessionId: pair[1].sessionId, opposite: true } }
  }

  async function verifiedWebPilotLoadout({ sessionId, arm, received, decisionOriginSessionId }, signal) {
    if (decisionOriginSessionId !== undefined) {
      const binding = await verifiedWebPilotDecisionBinding({ sessionId, arm, received, decisionOriginSessionId }, signal)
      return verifiedWebPilotBinding(binding, signal)
    }
    if (received === true) {
      if (arm !== undefined) throw new Error(receivedWebPilotPersonalUnavailable)
      const result = await inspectWebSourcePractice({ sessionId }, signal)
      if (!result?.receivedReport) throw new Error(receivedWebPilotPersonalUnavailable)
      return verifiedWebPilotBinding(result.binding, signal)
    }
    const { binding } = await verifiedWebPilotOppositeLoadout(sessionId, arm, signal)
    return verifiedWebPilotBinding(binding, signal)
  }

  async function verifiedWebPilotBinding(binding, signal) {
    if (!binding) throw new Error(webPilotPersonalUnavailable)
    const planned = await plannedWebSourceLoadout(signal, binding.arm)
    if (planned.candidate.id !== binding.presetId || planned.webToolId !== binding.id || planned.webToolSource !== binding.sourceId) {
      throw new Error(webSourceChanged)
    }
    return { ...planned, binding }
  }

  async function webPilotPersonalOptions(selection, signal) {
    const { binding } = await verifiedWebPilotLoadout(selection, signal)
    return { workspaceIds: await personalWorkspaceIds(signal), arm: binding.arm }
  }

  function saveWebPilotPlan({ sessionId, arm, received, personal, comparison, name, note, saveId }, signal) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    if (!validOpeningId(saveId)) throw new Error('保存请求无效，请重试。')
    const fromReceived = received === true
    if (fromReceived && arm !== undefined) throw new Error(receivedWebPilotPersonalUnavailable)
    const fromPersonal = personal === true
    if (personal !== undefined && (!fromPersonal || received !== undefined || arm !== undefined)) throw new Error(webPilotPersonalUnavailable)
    const savedComparison = webPilotPlanComparison(comparison, sessionId)
    if (comparison !== undefined && (!fromPersonal || !savedComparison)) throw new Error(webPilotPersonalPairUnavailable)
    const hash = values => createHash('sha256').update(JSON.stringify(values)).digest('hex')
    const key = hash([planTaskOwner, saveId])
    return buildPlans.write({ name, note }, 'standard', async () => {
      const reviewedPair = savedComparison && await verifiedSavedWebPilotPersonalPair(savedComparison, signal)
      if (savedComparison && !reviewedPair) throw new Error(webPilotPersonalPairUnavailable)
      const personalTask = fromPersonal && (reviewedPair
        ? webPilotPersonalPlanSource(reviewedPair.find(run => run.sessionId === sessionId).observed)
        : await readWebPilotPersonalPlanSource(sessionId, signal))
      const { draft, candidate, binding } = fromPersonal
        ? await verifiedWebPilotBinding(personalTask?.binding, signal)
        : await verifiedWebPilotLoadout({ sessionId, arm, received: fromReceived }, signal)
      const { presetId } = await prepare(draft, candidate)
      if (presetId !== binding.presetId) throw new Error(webSourceChanged)
      if (reviewedPair ? !isDeepStrictEqual(await verifiedSavedWebPilotPersonalPair(savedComparison, signal), reviewedPair)
        : fromPersonal && !isDeepStrictEqual(await readWebPilotPersonalPlanSource(sessionId, signal), personalTask)) {
        throw new Error(webSourceChanged)
      }
      signal?.throwIfAborted()
      const heroId = draft.presetId
      const heroName = ctx.agentPresets.definitions?.get(heroId)?.config.name ?? presetLabels.get(heroId)?.[0] ?? heroId
      return { presetId, heroId, heroName,
        webPilotOrigin: { sessionId, arm: binding.arm, ...(fromReceived && { received: true }), ...(fromPersonal && { personal: true }),
          ...(savedComparison && { comparison: savedComparison }) } }
    }, fields => ({ key, digest: hash([sessionId, fromPersonal ? 'personal' : fromReceived ? 'received' : arm, fields.name, fields.note,
      ...(savedComparison ? [savedComparison.standardSessionId, savedComparison.evidenceSessionId] : [])]) }))
  }

  function matchedPersonalWebPilotPlan({ webPilotOrigin, presetId }, task) {
    if (task?.binding.arm === webPilotOrigin.arm && task.binding.presetId === presetId) {
      return { binding: task.binding, personalOrigin: webPilotPersonalLineage(task) }
    }
  }

  function observedPersonalWebPilotPlanRun(plan, pair) {
    const run = pair?.find(item => item.sessionId === plan.webPilotOrigin.sessionId)
    const matched = matchedPersonalWebPilotPlan(plan, webPilotPersonalPlanSource(run?.observed))
    if (matched) return { ...matched, view: run.observed.view }
  }

  async function observedWebPilotPlan(plan, signal) {
    const { webPilotOrigin, presetId } = plan
    if (!webPilotOrigin) return
    const { sessionId, arm, received, personal } = webPilotOrigin
    if (personal) return matchedPersonalWebPilotPlan(plan, await readWebPilotPersonalPlanSource(sessionId, signal))
    const result = await inspectWebSourcePractice({ sessionId }, signal)
    const matches = run => run.binding.arm === arm && run.binding.presetId === presetId
    if (received) {
      if (result?.receivedReport && matches(result)) return { binding: result.binding, run: { ...result, sessionId } }
      return
    }
    const pair = await verifiedWebPilotPair(sessionId, result, signal)
    const matched = pair?.find(matches)
    if (matched) return { binding: matched.binding, pair, run: matched }
  }

  async function readPlanWebPilotOrigin({ id, revision }, signal) {
    const plan = buildPlans.read(id, revision)
    const observed = await observedWebPilotPlan(plan, signal)
    buildPlans.read(id, revision)
    signal?.throwIfAborted()
    if (!observed) return { status: 'unavailable' }
    const { sessionId, arm, received, personal, comparison } = plan.webPilotOrigin
    if (personal) return { status: 'ready', personal: true, sessionId, arm, ...(comparison && { hasComparison: true }) }
    return received ? { status: 'ready', received: true, sessionId, arm }
      : { status: 'ready', arm, comparison: webPilotComparison(observed.pair) }
  }

  async function readPlanWebPilotComparison({ id, revision }, signal) {
    const plan = buildPlans.read(id, revision)
    const origin = plan.webPilotOrigin
    const unavailable = '这份方案的实测来源已不可查看。'
    if (!origin?.personal || !origin.comparison) throw new Error(unavailable)
    const pair = await verifiedSavedWebPilotPersonalPair(origin.comparison, signal)
    if (!observedPersonalWebPilotPlanRun(plan, pair)) throw new Error(unavailable)
    const comparison = await webPilotPersonalPairResult(pair, signal, { allowSave: false })
    buildPlans.read(id, revision)
    signal?.throwIfAborted()
    return { ...comparison, selectedSessionId: origin.sessionId }
  }

  function testedWebPilotPlanCard({ id, revision, name, note }, { sessionId, binding }) {
    return { id, revision, name, note, arm: binding.arm, sessionId }
  }

  function compatibleTestedWebPilotRuns(source, other) {
    return completedCanonicalWebPilot(source) && completedCanonicalWebPilot(other) && source.sessionId !== other.sessionId &&
      source.view.url === other.view.url && matchesWebPilotReplay(source, other.task, other.binding)
  }

  async function readTestedWebPilotPlan(selection, signal) {
    const { id, revision } = selection
    const plan = buildPlans.read(id, revision)
    if (!plan.webPilotOrigin?.received) throw new Error('这份方案的实测来源已不可查看。')
    const observed = await observedWebPilotPlan(plan, signal)
    if (!observed?.run) throw new Error('这份方案的实测来源已不可查看。')
    return { plan, run: observed.run }
  }

  async function webPilotTestedPlanOptions(selection, signal) {
    const { plan, run } = await readTestedWebPilotPlan(selection, signal)
    const candidates = buildPlans.list().filter(other => other.id !== plan.id &&
      other.webPilotOrigin && !other.webPilotOrigin.personal && other.webPilotOrigin.arm !== run.binding.arm)
    const alternatives = []
    for (let index = 0; index < candidates.length; index += 4) {
      signal?.throwIfAborted()
      const batch = candidates.slice(index, index + 4)
      const cards = await Promise.all(batch.map(async candidate => {
        try {
          const other = await observedWebPilotPlan(candidate, signal)
          if (!compatibleTestedWebPilotRuns(run, other?.run)) return
          buildPlans.read(candidate.id, candidate.revision)
          return testedWebPilotPlanCard(candidate, other.run)
        } catch {
          signal?.throwIfAborted()
        }
      }))
      alternatives.push(...cards.filter(Boolean))
    }
    buildPlans.read(plan.id, plan.revision)
    signal?.throwIfAborted()
    return { source: testedWebPilotPlanCard(plan, run), alternatives }
  }

  async function compareTestedWebPilotPlans({ id, revision, otherId, otherRevision }, signal) {
    const unavailable = '这两套方案已无法按同题实测对照。'
    const other = buildPlans.read(otherId, otherRevision)
    const [{ plan, run }, compared] = await Promise.all([
      readTestedWebPilotPlan({ id, revision }, signal), observedWebPilotPlan(other, signal),
    ])
    if (!compatibleTestedWebPilotRuns(run, compared?.run)) throw new Error(unavailable)
    const saved = [[plan, run], [other, compared.run]]
    const actual = await Promise.all(saved.map(async ([selected, original]) => {
      const result = await inspectWebSourcePractice({ sessionId: original.sessionId }, signal, { handoff: true })
      if (!result?.handoff || (selected.webPilotOrigin.received && !result.receivedReport) ||
        result.task !== original.task || result.binding.presetId !== selected.presetId ||
        result.binding.workspaceId !== original.binding.workspaceId || result.binding.id !== original.binding.id ||
        result.binding.sourceId !== original.binding.sourceId || result.handoff.played !== original.binding.arm) {
        throw new Error(unavailable)
      }
      return { ...testedWebPilotPlanCard(selected, original), decision: result.handoff.decision, delivered: result.handoff.delivered }
    }))
    buildPlans.read(id, revision)
    buildPlans.read(otherId, otherRevision)
    signal?.throwIfAborted()
    return { runs: actual, url: run.view.url }
  }

  function oppositeWebPilotPlan(source, candidate) {
    const origin = source.webPilotOrigin
    const alternative = candidate.webPilotOrigin
    if (!origin || !alternative || origin.received || alternative.received || origin.arm === alternative.arm) return false
    if (origin.personal || alternative.personal) {
      const pair = origin.comparison
      const other = alternative.comparison
      return Boolean(pair && other && pair.standardSessionId === other.standardSessionId &&
        pair.evidenceSessionId === other.evidenceSessionId)
    }
    return alternative.sessionId === origin.sessionId
  }

  function webPilotPlanRunSummary({ reads, choice, choiceRecorded, questionAsked, deliverables }) {
    return { reads: reads.map(({ status }) => ({ status })), ...(choice && { choice }),
      ...(choiceRecorded && { choiceRecorded: true }), ...(questionAsked && { questionAsked: true }),
      deliverablesCount: deliverables.length }
  }

  async function webPilotPlanOptions({ id, revision }, signal) {
    const source = buildPlans.read(id, revision)
    const observed = await observedWebPilotPlan(source, signal)
    await verifiedWebPilotBinding(observed?.binding, signal)
    const candidates = buildPlans.list().filter(plan => oppositeWebPilotPlan(source, plan))
    const { personal, comparison, received } = source.webPilotOrigin
    const personalPair = personal && candidates.length ? await verifiedSavedWebPilotPersonalPair(comparison, signal) : undefined
    const personalSource = personalPair && observedPersonalWebPilotPlanRun(source, personalPair)
    const personalOpposite = personalPair?.find(run => run.observed.personal.binding.arm !== observed.binding.arm)
    const opposite = personal
      ? personalSource && webPilotPersonalPlanSource(personalOpposite?.observed)?.binding
      : observed.pair?.find(run => run.binding.arm !== observed.binding.arm)?.binding
    const isPeer = plan => opposite && plan.presetId === opposite.presetId && oppositeWebPilotPlan(source, plan) &&
      (!personal || observedPersonalWebPilotPlanRun(plan, personalPair))
    const workspaceIds = await personalWorkspaceIds(signal)
    const checkedPeer = candidates.some(isPeer) && await verifiedWebPilotBinding(opposite, signal).catch(() => {
      signal?.throwIfAborted()
      return null
    })
    buildPlans.read(id, revision)
    const peers = checkedPeer ? buildPlans.list().filter(isPeer) : []
    const plans = [source, ...peers].map(plan => {
      const { id, revision, name, note, webPilotOrigin } = plan
      const run = peers.length && personalPair && observedPersonalWebPilotPlanRun(plan, personalPair)
      return { id, revision, planName: name, note, arm: webPilotOrigin.arm, ...(run && { observed: webPilotPlanRunSummary(run.view) }) }
    })
    return { selectedId: id, plans, workspaceIds, ...(received && { received: true }) }
  }

  async function openWebPilotPlan({ id, revision, sourceId, sourceRevision, workspaceId, launchId }, signal) {
    const source = buildPlans.read(sourceId, sourceRevision)
    const selected = buildPlans.read(id, revision)
    if (!source.webPilotOrigin || (source !== selected && !oppositeWebPilotPlan(source, selected))) {
      throw new Error(webPilotPersonalUnavailable)
    }
    if (source.webPilotOrigin.personal) {
      const read = async () => {
        let observed
        if (source === selected) {
          observed = await observedWebPilotPlan(selected, signal)
        } else {
          const pair = await verifiedSavedWebPilotPersonalPair(source.webPilotOrigin.comparison, signal)
          const origin = observedPersonalWebPilotPlanRun(source, pair)
          await verifiedWebPilotBinding(origin?.binding, signal)
          observed = observedPersonalWebPilotPlanRun(selected, pair)
        }
        buildPlans.read(sourceId, sourceRevision)
        buildPlans.read(id, revision)
        if (!observed?.personalOrigin) throw new Error(webPilotPersonalUnavailable)
        return observed
      }
      const observed = await read()
      return openPersonalWebDraft({ workspaceId, launchId }, signal, ['plan-web-pilot', sourceId, sourceRevision, id, revision],
        () => verifiedWebPilotBinding(observed.binding, signal), async () => {
          const current = await read()
          if (!isDeepStrictEqual(current.personalOrigin, observed.personalOrigin)) throw new Error(webSourceChanged)
          return current.binding
        }, observed.personalOrigin)
    }
    return openPersonalWebDraft({ workspaceId, launchId }, signal,
      ['plan-web-pilot', sourceId, sourceRevision, id, revision],
      async () => {
        const observed = await observedWebPilotPlan(source, signal)
        if (source === selected) return verifiedWebPilotBinding(observed?.binding, signal)
        const picked = observed?.pair?.find(run => run.binding.arm === selected.webPilotOrigin.arm && run.binding.presetId === selected.presetId)
        return verifiedWebPilotBinding(picked?.binding, signal)
      }, () => {
        buildPlans.read(sourceId, sourceRevision)
        buildPlans.read(id, revision)
      })
  }

  async function openWebSourcePersonal({ sessionId, workspaceId, launchId, arm, received, decisionOriginSessionId }, signal,
    kind = 'web-source-personal') {
    if (typeof sessionId !== 'string' || !heroAlternateSessionId.test(sessionId)) throw new Error('开局请求无效，请重试。')
    const pilot = kind === 'web-pilot-personal'
    if (decisionOriginSessionId !== undefined) {
      if (!pilot || arm !== undefined || received !== undefined) throw new Error(webPilotPersonalUnavailable)
      const readBinding = () => verifiedWebPilotDecisionBinding({ sessionId, decisionOriginSessionId }, signal)
      return openPersonalWebDraft({ workspaceId, launchId }, signal,
        ['web-pilot-decision-personal', decisionOriginSessionId, sessionId],
        async () => verifiedWebPilotBinding(await readBinding(), signal), readBinding,
        { originSessionId: decisionOriginSessionId, replaySessionId: sessionId })
    }
    const fromReceived = pilot && received === true
    if (fromReceived && arm !== undefined) throw new Error(receivedWebPilotPersonalUnavailable)
    const identity = fromReceived ? ['web-pilot-received-personal', sessionId] : [kind, sessionId, ...(pilot ? [arm] : [])]
    if (pilot && !fromReceived) {
      const observed = await verifiedWebPilotOppositeLoadout(sessionId, arm, signal)
      return openPersonalWebDraft({ workspaceId, launchId }, signal, identity,
        () => verifiedWebPilotBinding(observed.binding, signal), async () => {
          const current = await verifiedWebPilotOppositeLoadout(sessionId, arm, signal)
          if (!isDeepStrictEqual(current.personalOrigin, observed.personalOrigin)) throw new Error(webSourceChanged)
          return current.binding
        }, observed.personalOrigin)
    }
    return openPersonalWebDraft({ workspaceId, launchId }, signal, identity,
      () => pilot ? verifiedWebPilotLoadout({ sessionId, received: true }, signal) : verifiedWebSourceLoadout(sessionId, signal))
  }

  async function openPersonalWebDraft({ workspaceId, launchId }, signal, identity, loadout, checkCurrent, personalOrigin) {
    if (!validOpeningId(launchId)) {
      throw new Error('开局请求无效，请重试。')
    }
    if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 512) {
      throw new Error('所选工作区不可用，请重新选择。')
    }
    const controller = ctx.get('sessionController')
    const registry = ctx.get('workspaceRegistry')
    if (!controller?.create || !controller.resolveAgent || !registry || !ctx.get('sessionQuery')) {
      throw new Error(webSourceUnavailable)
    }
    const key = JSON.stringify([planTaskOwner, ...identity, workspaceId, launchId])
    const hash = createHash('sha256').update(key).digest('hex')
    const legacyId = 'session-' + hash.slice(0, 32)
    let next = legacyId
    let tracked = false
    if (personalOrigin) {
      const legacy = await observeNativeSession(legacyId, signal, 'none')
      if (legacy) legacy[Symbol.dispose]()
      else {
        next = webPilotPersonalPrefix + hash.slice(0, 28)
        tracked = true
      }
    }
    if (openingMatches.has(next)) return openingMatches.get(next)

    const open = async () => {
      const { draft, candidate, binding } = await loadout()
      const { presetId, verifyLive: verify } = await prepare(draft, candidate)
      const includesPath = await personalTaskPathFilter()
      const workspace = await checkedPersonalWorkspace(registry.get(workspaceId), includesPath)
      if (!workspace) throw new Error('所选工作区不可用，请重新选择。')
      const existing = await observeNativeSession(next, signal, 'none')
      if (existing) {
        try {
          const { header, inheritedEventCount, presetChanged } = planTaskDetails(existing)
          if (!workspace.sessionIds.includes(next) || header.cwd !== workspace.path || header.agentPreset !== presetId ||
            header.isSeeded || header.parentSession || inheritedEventCount !== 0 || presetChanged) {
            throw new Error('已有会话与核对过的出装任务不一致。')
          }
        } finally {
          existing[Symbol.dispose]()
        }
      }
      signal?.throwIfAborted()
      if (closed) throw new Error('配装服务正在关闭，请重试。')
      const pendingBinding = checkCurrent?.()
      if (pendingBinding) {
        if (!isDeepStrictEqual(await pendingBinding, binding)) throw new Error(webSourceChanged)
        if ((await checkedPersonalWorkspace(registry.get(workspaceId), includesPath))?.path !== workspace.path) {
          throw new Error('所选工作区不可用，请重新选择。')
        }
        signal?.throwIfAborted()
        if (closed) throw new Error('配装服务正在关闭，请重试。')
      }
      if (!existing) {
        const created = await controller.create({ sessionId: next, workspaceId, agentPreset: presetId })
        if (created.sessionId !== next) throw new Error('新对局的会话标识已变化，请重新开局。')
      }
      const { agent, error } = await controller.resolveAgent(next)
      if (!agent) throw new Error(error?.message ?? '无法打开新对局。')
      if (verify) verifyLive({ presetId, sessionId: next })
      const live = liveWebSourceBinding(agent, presetId, workspaceId, binding.id, binding.arm, binding.sourceId)
      if (live.sourceId !== binding.sourceId) throw new Error(webSourceChanged)
      if (tracked) await recordWebPilotPersonal(next, agent, personalOrigin, live, signal)
      return { sessionId: next, workspaceId }
    }
    const work = open().finally(() => openingMatches.delete(next))
    openingMatches.set(next, work)
    return work
  }

  function webPilotPersonalOrigin(source) {
    const { header, inheritedEventCount, events } = source
    if (header.isSeeded || header.parentSession || inheritedEventCount !== 0) return
    for (const event of events) {
      if (event.type === 'turn/start' || (event.type === 'user/message' && event.data.source.kind === 'user')) break
      if (event.type !== webPilotPersonalRecord || event.ignorable !== true || event.data?.owner !== planTaskOwner) continue
      const { originSessionId, replaySessionId, binding, opposite, personalReplayOf } = event.data
      if (typeof originSessionId !== 'string' || !heroAlternateSessionId.test(originSessionId) ||
        typeof replaySessionId !== 'string' || !heroAlternateSessionId.test(replaySessionId) || replaySessionId === originSessionId ||
        (opposite !== undefined && opposite !== true) ||
        (personalReplayOf !== undefined && (!opposite || typeof personalReplayOf !== 'string' ||
          !webPilotPersonalSessionId.test(personalReplayOf) || personalReplayOf === header.id)) ||
        (binding?.arm !== 'evidence' && !(opposite && binding?.arm === 'standard')) || binding.presetId !== header.agentPreset ||
        typeof binding.id !== 'string' || typeof binding.sourceId !== 'string') return
      const workspace = ctx.get('workspaceRegistry')?.get(binding.workspaceId)
      if (!workspace || workspace.path !== header.cwd || !workspace.sessionIds.includes(header.id)) return
      return { originSessionId, replaySessionId, ...(opposite && { opposite: true }), binding,
        ...(personalReplayOf && { personalReplayOf }) }
    }
  }

  async function observeWebPilotPersonal(sessionId, signal, projectionMode) {
    if (typeof sessionId === 'string' && webPilotPersonalSessionId.test(sessionId)) {
      return observeNativeSession(sessionId, signal, projectionMode)
    }
  }

  async function recordWebPilotPersonal(sessionId, agent, origin, binding, signal) {
    const source = await observeWebPilotPersonal(sessionId, signal, 'none')
    if (!source) throw new Error(webPilotPersonalUnavailable)
    try {
      const previous = webPilotPersonalOrigin(source)
      if (previous) {
        // The original deterministic replay ID also belongs to requests made before personal links were recorded.
        const expected = previous.personalReplayOf ? origin : webPilotPersonalLineage(origin)
        if (!isDeepStrictEqual(previous, { ...expected, binding })) throw new Error(webSourceChanged)
        return
      }
      if (planTaskDetails(source).started) throw new Error(webPilotPersonalUnavailable)
      signal?.throwIfAborted()
      if (closed) throw new Error('配装服务正在关闭，请重试。')
      appendPluginRecord(agent.session, webPilotPersonalRecord, { owner: planTaskOwner, ...origin, binding })
      updates.notify(sessionId)
    } finally {
      source[Symbol.dispose]()
    }
  }

  async function webPilotPersonalSession(sessionId, signal) {
    const source = await observeWebPilotPersonal(sessionId, signal, 'none')
    if (!source) return
    try {
      const personal = webPilotPersonalOrigin(source)
      if (personal) {
        const { started, presetChanged } = planTaskDetails(source)
        return { ...personal, createdAt: source.header.createdAt, started, presetChanged }
      }
    } finally {
      source[Symbol.dispose]()
    }
  }

  async function observedWebPilotPersonalTask(sessionId, signal, { includeTaskText = false } = {}) {
    const source = await observeWebPilotPersonal(sessionId, signal, 'all')
    if (!source) return null
    try {
      const personal = webPilotPersonalOrigin(source)
      if (!personal) return null
      const { binding } = personal
      const outcome = await comparisonEvidence(source, {
        cwd: source.header.cwd, presetId: binding.presetId, allowOwnInput: true, exactMessages: true,
        verifyMaterialProof: false, includeQuestions: true, linkedChoicesOnly: true, includeWindows: true,
        includeTaskFingerprint: personal.opposite,
        includeTaskText: includeTaskText && personal.opposite,
      }, receipts)
      if (outcome.presetChanged || outcome.continuationReason === 'changed-loadout') {
        return { personal, view: { status: 'unavailable' } }
      }
      if (outcome.status !== 'complete') return { personal, view: { status: outcome.status } }
      const { choices, custom, files, questionAsked } = webPilotHandoffOutcome(source.events, outcome.windows, -1,
        { includeFiles: true, includeQuestionAsked: true })
      const view = { status: 'complete', ...observedPersonalWebReads(source.events, outcome.windows, binding),
        ...(choices?.length && { choice: choices.join(' / ') }), ...((custom || choices?.length) && { choiceRecorded: true }),
        ...(questionAsked && { questionAsked: true }),
        deliverables: files }
      return { personal, view, taskFingerprint: outcome.taskFingerprint, ...(outcome.taskText && { taskText: outcome.taskText }) }
    } finally {
      source[Symbol.dispose]()
    }
  }

  function webPilotPersonalPlanSource(observed) {
    const view = observed?.view
    if (view?.status === 'complete' && !view.sourceChanged && view.reads.some(read => read.status === 'complete')) {
      return observed.personal
    }
  }

  async function readWebPilotPersonalPlanSource(sessionId, signal) {
    return webPilotPersonalPlanSource(await observedWebPilotPersonalTask(sessionId, signal))
  }

  async function canSaveWebPilotPersonalPlan(observed, signal) {
    const binding = webPilotPersonalPlanSource(observed)?.binding
    const ready = binding && await verifiedWebPilotBinding(binding, signal).catch(() => {
      signal?.throwIfAborted()
      return null
    })
    return Boolean(ready)
  }

  function sameWebPilotPersonalBinding(left, right) {
    return left && right && left.arm === right.arm && left.presetId === right.presetId &&
      left.id === right.id && left.sourceId === right.sourceId
  }

  function webPilotPersonalLineage({ originSessionId, replaySessionId, opposite }) {
    return { originSessionId, replaySessionId, ...(opposite && { opposite: true }) }
  }

  function sameWebPilotPersonalLineage(left, right) {
    return right?.opposite && left.originSessionId === right.originSessionId &&
      left.replaySessionId === right.replaySessionId && left.binding.workspaceId === right.binding.workspaceId
  }

  async function verifiedWebPilotPersonalMatch(observed, signal) {
    const { personal, taskFingerprint, view } = observed ?? {}
    if (!personal?.opposite || !taskFingerprint || view.sourceChanged || !view.reads.some(read => read.status !== 'unknown')) return
    const workspace = await checkedPersonalWorkspace(ctx.get('workspaceRegistry')?.get(personal.binding.workspaceId),
      await personalTaskPathFilter())
    if (!workspace) return
    const otherArm = personal.binding.arm === 'standard' ? 'evidence' : 'standard'
    const { pair } = await verifiedWebPilotPersonalRehearsal(personal, signal)
    return { workspace, binding: pair.find(run => run.binding.arm === otherArm).binding }
  }

  async function webPilotPersonalCandidates(sessionId, personal, { workspace, binding }, signal) {
    const candidates = []
    for (const id of workspace.sessionIds) {
      signal?.throwIfAborted()
      if (id === sessionId || !webPilotPersonalSessionId.test(id)) continue
      const other = await webPilotPersonalSession(id, signal).catch(() => signal?.throwIfAborted())
      if (sameWebPilotPersonalLineage(personal, other) && sameWebPilotPersonalBinding(binding, other.binding)) {
        candidates.push({ id, openedAt: other.createdAt, linked: other.personalReplayOf === sessionId,
          waiting: !other.started && !other.presetChanged })
      }
    }
    return candidates.sort((a, b) => b.openedAt - a.openedAt || b.id.localeCompare(a.id))
  }

  function comparableWebPilotPersonalRun(observed, match, other) {
    return other?.view.status === 'complete' && other.taskFingerprint === observed.taskFingerprint &&
      sameWebPilotPersonalLineage(observed.personal, other.personal) &&
      sameWebPilotPersonalBinding(match.binding, other.personal.binding) &&
      !other.view.sourceChanged && other.view.reads.some(read => read.status !== 'unknown')
  }

  async function findWebPilotPersonalOpponent(observed, match, candidates, signal) {
    for (const { id, waiting } of candidates) {
      signal?.throwIfAborted()
      if (waiting) continue
      const other = await observedWebPilotPersonalTask(id, signal).catch(() => signal?.throwIfAborted())
      if (comparableWebPilotPersonalRun(observed, match, other)) {
        return { sessionId: id, observed: other }
      }
    }
  }

  async function webPilotPersonalResult({ sessionId }, signal) {
    const observed = await observedWebPilotPersonalTask(sessionId, signal)
    if (!observed) return null
    const match = await verifiedWebPilotPersonalMatch(observed, signal).catch(() => signal?.throwIfAborted())
    const [canSavePlan, candidates, replayReady] = await Promise.all([
      canSaveWebPilotPersonalPlan(observed, signal),
      match ? webPilotPersonalCandidates(sessionId, observed.personal, match, signal) : [],
      match && verifiedWebPilotBinding(match.binding, signal).catch(() => signal?.throwIfAborted()),
    ])
    const opponent = match && await findWebPilotPersonalOpponent(observed, match, candidates, signal)
    return { ...observed.view, arm: observed.personal.binding.arm,
      ...(canSavePlan && { canSavePlan: true }), ...(opponent && { comparisonReady: true }), ...(replayReady && { replayReady: true }),
      ...(candidates.some(run => run.linked) && { replaysReady: true }),
      ...(candidates.some(run => run.linked && run.waiting) && { hasPendingReplay: true }) }
  }

  async function webPilotPersonalPair({ sessionId, replaySessionId }, signal) {
    const observed = await observedWebPilotPersonalTask(sessionId, signal)
    const match = await verifiedWebPilotPersonalMatch(observed, signal).catch(() => signal?.throwIfAborted())
    if (!match) throw new Error(webPilotPersonalPairUnavailable)
    let opponent
    if (replaySessionId === undefined) {
      const candidates = await webPilotPersonalCandidates(sessionId, observed.personal, match, signal)
      opponent = await findWebPilotPersonalOpponent(observed, match, candidates, signal)
    } else if (typeof replaySessionId === 'string' && match.workspace.sessionIds.includes(replaySessionId)) {
      const replay = await observedWebPilotPersonalTask(replaySessionId, signal).catch(() => signal?.throwIfAborted())
      if (replay?.personal.personalReplayOf === sessionId && comparableWebPilotPersonalRun(observed, match, replay)) {
        opponent = { sessionId: replaySessionId, observed: replay }
      }
    }
    if (!opponent) throw new Error(webPilotPersonalPairUnavailable)
    const current = { sessionId, observed }
    const pair = observed.personal.binding.arm === 'standard' ? [current, opponent] : [opponent, current]
    return webPilotPersonalPairResult(pair, signal)
  }

  async function verifiedSavedWebPilotPersonalPair({ standardSessionId, evidenceSessionId }, signal) {
    const standard = await observedWebPilotPersonalTask(standardSessionId, signal).catch(() => signal?.throwIfAborted())
    if (standard?.personal.binding.arm !== 'standard') return
    const match = await verifiedWebPilotPersonalMatch(standard, signal).catch(() => signal?.throwIfAborted())
    if (!match?.workspace.sessionIds.includes(evidenceSessionId)) return
    const evidence = await observedWebPilotPersonalTask(evidenceSessionId, signal).catch(() => signal?.throwIfAborted())
    if (!comparableWebPilotPersonalRun(standard, match, evidence)) return
    return [{ sessionId: standardSessionId, observed: standard }, { sessionId: evidenceSessionId, observed: evidence }]
  }

  async function webPilotPersonalPairResult(pair, signal, { allowSave = true } = {}) {
    const runs = await Promise.all(pair.map(async ({ sessionId, observed }) => {
      const { reads, choice, choiceRecorded, questionAsked, deliverables } = observed.view
      const canSavePlan = allowSave && await canSaveWebPilotPersonalPlan(observed, signal)
      return { sessionId, arm: observed.personal.binding.arm, reads, choice, choiceRecorded, questionAsked, deliverables,
        ...(canSavePlan && { canSavePlan: true }) }
    }))
    return { runs }
  }

  async function webPilotPersonalReplays({ sessionId }, signal) {
    const observed = await observedWebPilotPersonalTask(sessionId, signal)
    const match = await verifiedWebPilotPersonalMatch(observed, signal)
    if (!match) throw new Error(webPilotPersonalReplayUnavailable)
    const candidates = await webPilotPersonalCandidates(sessionId, observed.personal, match, signal)
    const runs = []
    for (const { id, openedAt, linked } of candidates) {
      if (!linked) continue
      const target = await observedWebPilotPersonalTask(id, signal).catch(() => signal?.throwIfAborted())
      if (target?.personal.personalReplayOf === sessionId && sameWebPilotPersonalLineage(observed.personal, target.personal) &&
        sameWebPilotPersonalBinding(match.binding, target.personal.binding)) {
        const { status, reads, choice, choiceRecorded, questionAsked, deliverables } = target.view
        const comparison = comparableWebPilotPersonalRun(observed, match, target) && {
          reads: reads.map(({ status }) => ({ status })), choice, choiceRecorded, questionAsked, deliveries: deliverables.length,
        }
        runs.push({ sessionId: id, arm: target.personal.binding.arm, status, openedAt, ...(comparison && { comparison }) })
      }
    }
    const canReplay = await verifiedWebPilotBinding(match.binding, signal).catch(() => signal?.throwIfAborted())
    return { runs, ...(canReplay && { canReplay: true }) }
  }

  async function resumeWebPilotPersonalReplay({ sessionId, replaySessionId }, signal) {
    const observed = await observedWebPilotPersonalTask(sessionId, signal)
    const match = await verifiedWebPilotPersonalMatch(observed, signal)
    if (!match) throw new Error(webPilotPersonalReplayUnavailable)
    const target = await webPilotPersonalSession(replaySessionId, signal)
    if (!match.workspace.sessionIds.includes(replaySessionId) || target?.personalReplayOf !== sessionId ||
      !sameWebPilotPersonalLineage(observed.personal, target) || !sameWebPilotPersonalBinding(match.binding, target.binding)) {
      throw new Error('这局复赛已变化，请重新核对。')
    }
    return { sessionId: replaySessionId }
  }

  async function checkedWebPilotPersonalReplay(sessionId, signal) {
    const observed = await observedWebPilotPersonalTask(sessionId, signal, { includeTaskText: true })
    const match = await verifiedWebPilotPersonalMatch(observed, signal)
    if (!match || !observed.taskText) throw new Error(webPilotPersonalReplayUnavailable)
    const { workspace, binding } = match
    const originBinding = observed.personal.binding
    const personalOrigin = webPilotPersonalLineage(observed.personal)
    const loadout = await verifiedWebPilotBinding(binding, signal)
    const token = createHash('sha256').update(JSON.stringify([
      'web-pilot-personal-replay', planTaskOwner, sessionId, observed.taskFingerprint, workspace.id, workspace.path,
      personalOrigin, originBinding, binding,
    ])).digest('hex')
    return { loadout, personalOrigin, workspaceId: workspace.id, view: {
      fromArm: originBinding.arm, arm: binding.arm,
      workspaceTitle: workspace.title === 'default-workspace' ? '默认工作区' : workspace.title,
      task: observed.taskText, token,
    } }
  }

  async function previewWebPilotPersonalReplay({ sessionId }, signal) {
    const checked = await checkedWebPilotPersonalReplay(sessionId, signal)
    return checked.view
  }

  async function openWebPilotPersonalReplay({ sessionId, token, launchId }, signal) {
    if (!validOpeningId(launchId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error(webPilotPersonalReplayUnavailable)
    }
    const read = async () => {
      const checked = await checkedWebPilotPersonalReplay(sessionId, signal)
      if (token !== checked.view.token) throw new Error(webPilotReplayChanged)
      return checked
    }
    const checked = await read()
    const opened = await openPersonalWebDraft({ workspaceId: checked.workspaceId, launchId }, signal,
      ['web-pilot-personal-replay', sessionId, token], () => checked.loadout, async () => (await read()).loadout.binding,
      { ...checked.personalOrigin, personalReplayOf: sessionId })
    const source = await observeWebPilotPersonal(opened.sessionId, signal, 'none')
    if (!source) throw new Error(webPilotPersonalReplayUnavailable)
    try {
      if (!webPilotPersonalOrigin(source)) throw new Error(webPilotPersonalReplayUnavailable)
      return { sessionId: opened.sessionId, ...(!planTaskDetails(source).started && { task: checked.view.task }) }
    } finally {
      source[Symbol.dispose]()
    }
  }

  async function verifiedWebPilotPersonalRehearsal(personal, signal) {
    const reference = await webPilotReplayParent(personal.originSessionId, signal)
    const replay = await readWebPilotReplay(personal.replaySessionId, reference, signal)
    const pair = personal.opposite && replay?.pair
    const binding = pair ? pair.find(run => run.binding.arm === personal.binding.arm)?.binding
      : !personal.opposite && replay?.decisionComparison && replay.result.binding
    if (!sameWebPilotPersonalBinding(binding, personal.binding)) throw new Error(webPilotPersonalUnavailable)
    return replay
  }

  async function webPilotPersonalComparison({ sessionId }, signal) {
    const personal = await webPilotPersonalSession(sessionId, signal)
    if (!personal) throw new Error(webPilotPersonalUnavailable)
    const replay = await verifiedWebPilotPersonalRehearsal(personal, signal)
    return personal.opposite ? { ...webPilotComparison(replay.pair), opposite: true } : replay.decisionComparison
  }

  async function chooseWebSourcePractice({ sessionId, choice }, signal) {
    const view = await readWebSourcePractice({ sessionId }, signal)
    if (closed || view?.status !== 'complete' || !['pending', 'use-current'].includes(choice) ||
      choice === 'use-current' && !view.verified) throw new Error('请先核对本次试玩的原文。')
    if (view.choice === choice) return view
    const directoryPath = join(directory, 'web-source-decisions')
    signal?.throwIfAborted()
    try {
      await saveEntry(directoryPath, sessionId, { sessionId, choice }, { exclusive: true })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const existing = await readWebSourcePractice({ sessionId }, signal)
      if (existing?.choice === choice) return existing
      throw new Error('这次试玩已经记录了选择。')
    }
    return { ...view, choice }
  }

  function heroTrialToolFit(arm, names) {
    return arm === 'standard' ? names.has('read') && names.has('present')
      : names.has('bash') && !names.has('read') && names.has('present') === (arm === lighthouseHeroDelivery)
  }

  function heroTrialLive(arm, presetId, agent) {
    const scope = agent && toolRuntime?.scopeOf(agent.ctx)
    return scope && ctx.agentPresets.composedPreset(agent.ctx) === presetId &&
      heroTrialToolFit(arm, new Set(ctx.tools.schemas(scope).map(tool => tool.name)))
  }

  function stockTrialLive(arm, presetId, agent, bindings) {
    if (!heroTrialLive(arm, presetId, agent)) return false
    const scope = toolRuntime.scopeOf(agent.ctx)
    const origins = ctx.get('agentLoadoutToolOrigins')
    return bindings.every(({ tool, id, sourceId }) => {
      const definition = ctx.tools.get(tool, scope)
      const origin = definition && origins?.get(definition, scope)
      if (origin?.moduleName !== stockTrialTools[arm][tool]) return false
      const actual = dispatchedToolDetails(ctx, scope, definition, agent.ctx, records.get(presetId)?.definition.plugins)
      return actual.id === id && actual.sourceId === sourceId
    })
  }

  async function heroTrialAvailable(currentEcosystem, arms = lighthouseHeroArms) {
    if (!toolRuntime || !ctx.get('sessionController')?.resolveAgent || !ctx.get('workspaceRegistry')?.create) return false
    try {
      const { ecosystem, sources } = await shareEnvironment(currentEcosystem)
      return arms.every(arm => {
        const preset = ecosystem.presets.find(item => item.id === arm)
        if (!preset || preset.broken || sources.hero(arm)?.owner.package !== '@deepseek-ai/dsh-web-app') return false
        const tools = [...summarizeCapabilities(ecosystem, arm, {}).values()]
          .filter(item => item.kind === 'tool').map(item => item.name)
        return heroTrialToolFit(arm, new Set(tools))
      })
    } catch {
      return false
    }
  }

  function shareRefLabel(source) {
    const owner = source.kind === 'preset' ? source.hero.owner : source.owner
    return { sourceName: owner.package, version: owner.version }
  }

  function shareRequirements(gear, candidate, sources) {
    const packages = new Map()
    const companions = []
    const add = ref => {
      if (!ref || (packages.has(ref.package) && packages.get(ref.package).version !== ref.version)) {
        throw new Error('无法核对这套出装所需的插件包版本。')
      }
      packages.set(ref.package, ref)
    }
    for (const { source, kind, id } of gear) {
      if (source) add(source.kind === 'preset' ? source.hero.owner : source.owner)
      if (kind === 'featured') {
        const item = equipmentById.get(id)
        add(sources.packageFor(item.module ?? item.requires))
      }
    }
    for (const unit of candidate.units?.values() ?? []) {
      const source = sources.slot(unit.id)
      if (!source) throw new Error('随装依赖包含无法分享的本地配置。')
      if (!gear.some(item => item.operation === 'equip' && isDeepStrictEqual(item.source, source))) companions.push(source)
      add(source.hero.owner)
      for (const ref of sources.moduleOwners(unit)) add(ref)
    }
    return { dependencies: [...packages.values()].sort((a, b) => a.package.localeCompare(b.package)),
      companions: companions.sort((a, b) => a.hero.id.localeCompare(b.hero.id) || a.entry.localeCompare(b.entry)) }
  }

  function shareRequirementRows(recipe, sources, ecosystem) {
    return [
      ...recipe.dependencies.map(ref => ({ name: ref.package, version: ref.version, ...sources.packageStatus(ref) })),
      ...recipe.companions.map(source => {
        const { id, ...status } = sources.resolveSlot(source)
        return { name: ecosystem.equipment.get(id)?.name ?? source.entry, ...shareRefLabel(source), ...status }
      }),
    ]
  }

  async function exportBuildShare({ id, revision }) {
    return describeBuildShare(buildPlans.read(id, revision))
  }

  async function describeBuildShare(saved) {
    const { ecosystem, sources, runtime } = await shareEnvironment()
    const recipe = { name: saved.name, host: runtime, hero: sources.hero(saved.heroId), gear: [] }
    const host = { version: runtime, current: runtime, state: 'ready' }
    const record = records.get(saved.presetId)
    const blockers = []
    const gear = []
    if (!recipe.hero) blockers.push({ name: saved.heroName, reason: '这个预设的来源无法复现，请换用可核对来源的预设。' })
    if (!record && saved.presetId !== saved.heroId) {
      blockers.push({ name: saved.name, reason: '方案的本地出装已不可用，请重新保存方案。' })
    }
    const equipmentIds = (record?.equipmentIds ?? []).map(id => currentEquipmentId(id, ecosystem))
    const removedEquipmentIds = (record?.removedEquipmentIds ?? []).map(id => currentEquipmentId(id, ecosystem))
    const equipmentSources = {}
    const savedSources = record ? savedToolSources(record, ecosystem) : {}
    for (const [index, equipmentId] of equipmentIds.entries()) {
      const oldId = record.equipmentIds[index]
      const item = equipmentById.get(equipmentId) ?? ecosystem.equipment.get(equipmentId)
      const name = item?.name ?? record.equipmentLabels?.[oldId] ?? saved.name
      const operation = 'equip'
      const sourceId = savedSources[oldId] ?? savedSources[equipmentId]
      const source = item?.kind === 'tool' ? sources.tool(item, sourceId) : sources.slot(equipmentId)
      if (equipmentById.has(equipmentId)) {
        const owner = sources.packageFor(item.module ?? item.requires)
        recipe.gear.push({ kind: 'featured', operation, id: equipmentId })
        gear.push({ name, operation, sourceName: owner?.package, version: owner?.version })
      } else if (source) {
        if (item.kind === 'tool') {
          recipe.gear.push({ kind: 'tool', operation, source, tool: item.name, schema: equipmentId })
          equipmentSources[equipmentId] = sourceId
        } else recipe.gear.push({ kind: 'plugin', operation, source })
        gear.push({ name, operation, ...shareRefLabel(source) })
      } else {
        blockers.push({ name, reason: '这件装备依赖本地配置或无法核对唯一来源。' })
      }
    }
    for (const [index, equipmentId] of removedEquipmentIds.entries()) {
      const source = sources.slot(equipmentId, saved.heroId)
      const name = ecosystem.equipment.get(equipmentId)?.name ?? record.removedEquipmentLabels?.[record.removedEquipmentIds[index]] ?? saved.heroName
      if (!source) blockers.push({ name, reason: '无法在来源预设中核对这件卸下的装备。' })
      else {
        const operation = 'remove'
        recipe.gear.push({ kind: 'plugin', operation, source })
        gear.push({ name, operation, ...shareRefLabel(source) })
      }
    }
    const result = { host, gear, blockers, hero: { id: saved.heroId, name: saved.heroName,
      sourceName: recipe.hero?.owner.package, version: recipe.hero?.owner.version } }
    if (blockers.length) return result
    try {
      const candidate = await plan({ presetId: saved.heroId, equipmentIds, equipmentSources, removedEquipmentIds }, ecosystem)
      if (candidate.id !== saved.presetId) throw new Error('方案的来源已变化，请核对后重新保存再分享。')
      const complete = { ...recipe, ...shareRequirements(recipe.gear, candidate, sources) }
      return { ...result, dependencies: shareRequirementRows(complete, sources, ecosystem)
        .map(item => ({ ...item, state: 'ready', reason: undefined })), code: encodeBuildShare(complete) }
    } catch (error) {
      return { ...result, reason: error instanceof Error ? error.message : '无法核对这套出装的来源。' }
    }
  }

  async function inspectBuildShare(code) {
    const recipe = decodeBuildShare(code)
    const { ecosystem, sources, runtime } = await shareEnvironment()
    const { preset, ...heroStatus } = sources.heroStatus(recipe.hero)
    const hero = { id: recipe.hero.id, name: preset?.name ?? presetLabels.get(recipe.hero.id)?.[0] ?? recipe.hero.id,
      sourceName: recipe.hero.owner.package, version: recipe.hero.owner.version, ...heroStatus }
    const host = { version: recipe.host, current: runtime, state: runtime === recipe.host ? 'ready' : 'different' }
    const dependencies = shareRequirementRows(recipe, sources, ecosystem)
    const slots = recipe.gear.map((entry, slot) => {
      const { operation, source } = entry
      if (entry.kind === 'featured') {
        const item = equipmentById.get(entry.id)
        const owner = sources.packageFor(item.module ?? item.requires)
        const declared = recipe.dependencies.find(ref => ref.package === owner?.package || ref.package === (item.module ?? item.requires))
        return { entry, id: owner && entry.id, row: { slot, name: item.name, operation,
          sourceName: declared?.package ?? owner?.package ?? 'DSH-Heros', version: declared?.version ?? owner?.version,
          state: owner ? 'ready' : 'missing', decisions: item.decisions } }
      }
      const { id, sourceId, ...status } = entry.kind === 'tool' ? sources.resolveTool(entry) : sources.resolveSlot(source)
      const name = ecosystem.equipment.get(id)?.name ?? (entry.kind === 'tool' ? entry.tool : source.entry)
      return { entry, id, sourceId, row: { slot, name, operation, ...shareRefLabel(source), ...status } }
    })
    return { recipe, sources, ecosystem, slots, result: { name: recipe.name, hero, host, gear: slots.map(item => item.row), dependencies } }
  }

  function localShareHero({ recipe, sources }) {
    const ref = sources.hero(recipe.hero.id)
    if (!ref || ref.owner.package !== recipe.hero.owner.package) return
    const { preset } = sources.heroStatus(ref)
    if (preset) return { ref, preset }
  }

  function shareAdaptation(inspection) {
    const local = localShareHero(inspection)
    if (!local) return
    const { result, slots } = inspection
    return {
      ...(result.hero.state === 'different' && { hero: { name: local.preset.name ?? result.hero.name,
        sourceName: local.ref.owner.package, version: local.ref.owner.version, previousVersion: result.hero.version } }),
      slots: slots.map(({ row }) => ({ ...row, required: row.state !== 'ready' })),
    }
  }

  function draftFromShare(presetId, slots) {
    const equips = slots.filter(item => item.id && item.entry.operation === 'equip' && !item.included)
    return { presetId, equipmentIds: equips.map(item => item.id),
      equipmentSources: Object.fromEntries(equips.filter(item => item.sourceId).map(item => [item.id, item.sourceId])),
      removedEquipmentIds: slots.filter(item => item.id && item.entry.operation === 'remove').map(item => item.id) }
  }

  async function previewBuildShare({ code }) {
    const inspection = await inspectBuildShare(code)
    const { recipe, sources, ecosystem, result, slots } = inspection
    const blocked = reason => ({ ...result, blocked: true, reason, adaptation: shareAdaptation(inspection) })
    if ([result.hero, ...result.gear].some(item => item.state !== 'ready')) return blocked()
    const draft = draftFromShare(recipe.hero.id, slots)
    try {
      const candidate = await plan(draft, ecosystem)
      const expected = new Map(recipe.dependencies.map(item => [item.package, item.version]))
      const actual = shareRequirements(recipe.gear, candidate, sources)
      if (actual.dependencies.length !== expected.size || actual.dependencies.some(item => expected.get(item.package) !== item.version) ||
        !isDeepStrictEqual(actual.companions, recipe.companions)) {
        throw new Error('接收方实际需要的随装依赖与分享码不同。')
      }
      return { ...result, dependencies: result.dependencies.map(item => ({ ...item, state: 'ready', reason: undefined })),
        draft, comparison: await compare(draft, ecosystem, candidate) }
    } catch (error) {
      return blocked(error instanceof Error ? error.message : '无法核对这套出装的来源。')
    }
  }

  const challengeChanged = '灯塔挑战出装已变化，请重新核对挑战码。'
  const noLocalChallenge = '无法用本机标准出装复现这项灯塔挑战。'

  function completedLighthouseChallenge(record, arm) {
    return record?.lesson === evidenceLesson && record.scenario === 'gap' && arm?.id === 'evidence' &&
      verifiedEvidenceArm(arm) && comparisonChoices(arm).length > 0
  }

  function evidenceReportTaskLanguage(record) {
    if (record.material !== lighthouseHeroMaterial) return
    return [false, true].find(english => record.task === workspaceComparisonTask({
      material: record.material, task: lighthouseEvidenceTask(english, 'gap'),
    }, english).task)
  }

  function observedLighthouseEvidenceReport(record, arm, materialState) {
    if (materialState !== 'verified' || !completedLighthouseChallenge(record, arm) ||
      evidenceReportTaskLanguage(record) === undefined) return
    const choice = lighthouseEvidenceDecision(comparisonChoices(arm))
    if (choice) return { choice, delivered: completedPresentDelivery(arm) }
  }

  async function verifiedLighthouseEvidenceReport(comparisonId, signal) {
    const record = workspaceComparisons.read(comparisonId)
    const unavailable = '请先完成并核验一局缺证取舍。'
    if (record?.lesson !== evidenceLesson || record.scenario !== 'gap' ||
      ctx.get('workspaceRegistry')?.get(record.workspaceId)?.path !== record.cwd) throw new Error(unavailable)
    const [arm, materialState] = await Promise.all([
      readComparisonArm(workspaceComparisons, record, 'evidence', signal, { linkedChoicesOnly: true }),
      workspaceMaterialState(record, signal),
    ])
    const local = observedLighthouseEvidenceReport(record, arm, materialState)
    if (!local) throw new Error(unavailable)
    signal?.throwIfAborted()
    return { record, local }
  }

  async function evidenceHandoffReport({ comparisonId, code }, signal, compare = false) {
    const friend = compare ? decodeLighthouseEvidenceReport(code) : undefined
    const { local } = await verifiedLighthouseEvidenceReport(comparisonId, signal)
    return { local, code: encodeLighthouseEvidenceReport(local.choice, local.delivered), ...(friend && { friend }) }
  }

  async function checkedLighthouseChallengeSource(comparisonId, signal) {
    const { proof, ecosystem } = await verifiedLessonTaskSource({ kind: 'workspace', comparisonId, arm: 'evidence' }, signal)
    const expected = await plan(standardDeliveryDraft(ecosystem, ['present', 'evidence']), ecosystem)
    if (expected.id !== proof.presetId) throw new Error(challengeChanged)
    return proof
  }

  async function repeatLighthouseEvidence({ comparisonId, code, launchId }, signal) {
    if (!validOpeningId(launchId)) throw new Error('开局请求无效，请重试。')
    decodeLighthouseEvidenceReport(code)
    const { record } = await verifiedLighthouseEvidenceReport(comparisonId, signal)
    const proof = await checkedLighthouseChallengeSource(comparisonId, signal)
    const id = createHash('sha256').update(JSON.stringify(['lighthouse-evidence-repeat', comparisonId, launchId])).digest('hex').slice(0, 32)
    return openLighthouseLesson({ launchId: id }, evidenceReportTaskLanguage(record), signal, evidenceLesson, proof.presetId)
  }

  async function shareLighthouseChallenge({ comparisonId }, signal) {
    const record = workspaceComparisons.read(comparisonId)
    const unavailable = '请先完成一局已核验的灯塔缺证挑战。'
    if (record?.lesson !== evidenceLesson || record.scenario !== 'gap') throw new Error(unavailable)
    const observed = await readComparisonArm(workspaceComparisons, record, 'evidence', signal, { linkedChoicesOnly: true })
    if (!completedLighthouseChallenge(record, observed)) throw new Error(unavailable)
    const proof = await checkedLighthouseChallengeSource(comparisonId, signal)
    const share = await describeBuildShare({ name: lighthouseChallengeName, heroId: 'standard',
      heroName: presetLabels.get('standard')?.[0] ?? 'Standard', presetId: proof.presetId })
    signal?.throwIfAborted()
    if (!share.code) throw new Error(share.reason ?? '无法核对这套出装的来源。')
    return { code: encodeLighthouseChallenge(share.code) }
  }

  function challengeSourceIdentities(recipe) {
    const slotIdentity = ref => JSON.stringify([ref.hero.id, ref.hero.owner.package, ref.entry])
    return [
      recipe.hero.owner.package,
      recipe.gear.map(item => item.kind === 'featured' ? item.id : slotIdentity(item.source)).sort(),
      recipe.dependencies.map(item => item.package).sort(),
      recipe.companions.map(slotIdentity).sort(),
    ]
  }

  async function localLighthouseChallenge(original, signal) {
    try {
      const { ecosystem, sources, runtime } = await shareEnvironment()
      const hero = sources.hero('standard')
      if (!hero) return
      const draft = standardDeliveryDraft(ecosystem, ['present', 'evidence'])
      const gear = draft.equipmentIds.map(id => ({ kind: 'featured', operation: 'equip', id }))
      for (const id of draft.removedEquipmentIds) {
        const source = sources.slot(id, 'standard')
        if (!source) return
        gear.push({ kind: 'plugin', operation: 'remove', source })
      }
      const expected = await plan(draft, ecosystem)
      const recipe = { name: lighthouseChallengeName, host: runtime, hero, gear, ...shareRequirements(gear, expected, sources) }
      if (!isDeepStrictEqual(challengeSourceIdentities(original), challengeSourceIdentities(recipe))) return
      const code = encodeBuildShare(recipe)
      const preview = await previewBuildShare({ code })
      signal?.throwIfAborted()
      if (!preview.blocked) return { code, preview, presetId: expected.id }
    } catch {
      signal?.throwIfAborted()
    }
  }

  async function checkLighthouseChallenge(code, signal, useLocal = false) {
    const loadout = decodeLighthouseChallenge(code)
    const preview = await previewBuildShare({ code: loadout })
    signal?.throwIfAborted()
    if (preview.blocked) {
      const original = decodeBuildShare(loadout)
      const local = await localLighthouseChallenge(original, signal)
      if (!useLocal) return { preview: { ...preview, ...(local && { canUseLocalLoadout: true }) } }
      if (!local) return { preview: { ...preview, reason: noLocalChallenge } }
      const { presetId } = local
      const token = createHash('sha256').update(JSON.stringify([code.trim(), local.code, presetId])).digest('hex')
      return { preview: { ...local.preview, localLoadout: true, originalHost: original.host, token }, presetId }
    }
    if (useLocal) return { preview: { ...preview, blocked: true, reason: noLocalChallenge } }
    const ecosystem = await discover()
    const [imported, expected] = await Promise.all([
      plan(preview.draft, ecosystem), plan(standardDeliveryDraft(ecosystem, ['present', 'evidence']), ecosystem),
    ])
    signal?.throwIfAborted()
    if (imported.id !== expected.id) return { preview: { ...preview, blocked: true, reason: challengeChanged } }
    const token = createHash('sha256').update(JSON.stringify([code.trim(), expected.id])).digest('hex')
    return { preview: { ...preview, token }, presetId: expected.id }
  }

  async function openLighthouseChallenge({ code, token, launchId, openingChoice, useLocal }, english, signal) {
    if (!validOpeningId(launchId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error(challengeChanged)
    const { preview, presetId } = await checkLighthouseChallenge(code, signal, useLocal === true)
    if (preview.token !== token) throw new Error(challengeChanged)
    const challengeId = createHash('sha256').update('lighthouse-challenge-v1:' + launchId).digest('hex').slice(0, 32)
    return openLighthouseLesson({ launchId: challengeId, scenario: 'gap', openingChoice }, english, signal, evidenceLesson, presetId)
  }

  function verifiedHeroHandoff(arm) {
    return arm.status === 'complete' && arm.materialState === 'verified' &&
      arm.materialRead === true && Boolean(arm.summary) && typeof arm.originalAttached === 'boolean'
  }

  function heroHandoffLanguage(record) {
    return record?.task === lighthouseHeroTask(true) ? 'en'
      : record?.task === lighthouseHeroTask(false) ? 'zh' : undefined
  }

  async function shareHeroChallenge({ comparisonId }, signal) {
    const record = heroTrials.read(comparisonId)
    const unavailable = '请先完成并核验一局原装英雄试玩。'
    if (!record) throw new Error(unavailable)
    const arms = await Promise.all(lighthouseHeroArms.map(arm => readHeroTrialArm(record, arm, signal)))
    if (!arms.some(verifiedHeroHandoff)) throw new Error(unavailable)
    signal?.throwIfAborted()
    const language = record.task === lighthouseHeroTask(true) ? 'en' : 'zh'
    return { code: encodeLighthouseHeroChallenge(language, record.need) }
  }

  async function heroHandoffReport({ comparisonId, arm, code }, signal, compare = false) {
    const record = heroTrials.read(comparisonId)
    const language = heroHandoffLanguage(record)
    const unavailable = '请先完成这局灯塔交接，再核对战报。'
    if (!language || !heroTrials.arms.includes(arm)) throw new Error(unavailable)
    const { need } = record
    const friend = compare ? decodeLighthouseHeroReport(code) : undefined
    if (friend && (friend.language !== language || friend.need !== need)) {
      throw new Error('这份战报的题目语言或接班需求与本局不同。')
    }
    const local = await readHeroTrialArm(record, arm, signal)
    signal?.throwIfAborted()
    if (!verifiedHeroHandoff(local)) throw new Error(unavailable)
    const result = {
      need,
      local: { arm, originalAttached: local.originalAttached, meetsNeed: local.meetsNeed },
      code: encodeLighthouseHeroReport(language, need, arm, local.originalAttached)
    }
    if (friend) {
      result.local.readingTool = local.readingTool
      result.friend = { arm: friend.arm, originalAttached: friend.originalAttached,
        meetsNeed: need === 'summary' || friend.originalAttached }
    }
    return result
  }

  async function previewHeroChallenge(code, signal) {
    const { sample, need, language: sampleLanguage } = decodeLighthouseHeroChallenge(code)
    const task = lighthouseHeroTask(sampleLanguage === 'en')
    const view = { kind: 'hero-trial', sample, need, sampleLanguage, task }
    const available = await heroTrialAvailable()
    signal?.throwIfAborted()
    if (!available) return { ...view, blocked: true, reason: heroTrialUnavailable }
    const token = createHash('sha256').update(JSON.stringify([planTaskOwner, view])).digest('hex')
    return { ...view, token }
  }

  async function openHeroChallenge({ code, token, launchId, arm }, signal) {
    if (!validOpeningId(launchId) || !lighthouseHeroArms.includes(arm) || typeof token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(token)) throw new Error(challengeChanged)
    const preview = await previewHeroChallenge(code, signal)
    if (preview.blocked) throw new Error(preview.reason)
    if (token !== preview.token) throw new Error(challengeChanged)
    const { need, task, sample } = preview
    const challenge = { sample, arm }
    const record = await heroTrials.create('challenge:' + launchId, () => ({ need, task, challenge }))
    if (record.need !== need || record.task !== task || !isDeepStrictEqual(record.challenge, challenge)) throw new Error(challengeChanged)
    return openComparisonArm(heroTrials, { comparisonId: record.id, arm }, preview.sampleLanguage === 'en', signal)
  }

  function lighthouseReviewTask(language) {
    const english = language === 'en'
    return workspaceComparisonTask({ material: lighthouseHeroMaterial, task: lighthouseRematchTask(english) }, english).task
  }

  function lighthouseReviewLanguage(record) {
    if (record?.lesson !== lighthouseLesson || record.material !== lighthouseHeroMaterial || record.digest !== heroTrialDigest) return
    return ['en', 'zh'].find(language => record.task === lighthouseReviewTask(language))
  }

  function singleReviewAnswer(arm) {
    const answers = arm.entries.filter(entry => entry.name === 'ask_user_question' && entry.state === 'completed' && entry.choices?.length)
    if (answers.length === 1 && answers[0].choices.length === 1) return answers[0].choices[0]
  }

  async function verifiedReviewHandoff(comparisons, record, arm, signal, { observed, includeSide = false } = {}) {
    const language = lighthouseReviewLanguage(record)
    if (!language || ctx.get('workspaceRegistry')?.get(record.workspaceId)?.path !== record.cwd) return
    const played = comparisons === workspaceComparisons && comparisons.armsFor(record).includes(arm) ? arm
      : comparisons === rematchComparisons && arm === 'rematch' && isLighthouseReviewRematch(record, previousComparison(record)) ? 'review' : undefined
    if (!played) return
    let result
    if (comparisons === rematchComparisons) {
      const { arms, publicReviewOutcome } = await readComparisonArms(comparisons, record, signal)
      const side = reviewedChoice(publicReviewOutcome)
      if (side) {
        observed = arms.find(item => item.id === arm)
        const choiceLabel = singleReviewAnswer(observed)
        if (choiceLabel && (side.materialDelivered ? completedPresentDelivery(observed) : side.deliveredCount === 0)) {
          result = { choiceLabel, originalAttached: side.materialDelivered }
        }
      }
    } else {
      observed ??= await readComparisonArm(comparisons, record, arm, signal,
        { verifyPersonalDelivery: true, linkedChoicesOnly: true, includeFileCoordinates: includeSide })
      if (!verifiedEvidenceArm(observed)) return
      const originalAttached = observed.materialDelivered === true && completedPresentDelivery(observed)
      if (played === 'direct') {
        if (originalAttached) result = { originalAttached }
      } else {
        const choiceLabel = singleReviewAnswer(observed)
        if (choiceLabel && (originalAttached || observed.deliverables.length === 0)) {
          result = { choiceLabel, originalAttached }
        }
      }
    }
    if (result && await workspaceMaterialState(record, signal) === 'verified') {
      const { sessionId, deliverables, lessonTaskSource } = observed
      return { language, played, decision: result.choiceLabel ? lighthouseReviewDecision(result.choiceLabel) : 'direct', ...result,
        ...(includeSide && { side: { sessionId, deliverables, ...(lessonTaskSource && { lessonTaskSource }) } }) }
    }
  }

  async function requireReviewHandoff({ kind, comparisonId, arm }, signal) {
    const comparisons = kind === 'workspace' ? workspaceComparisons : kind === 'rematch' ? rematchComparisons : undefined
    const local = await verifiedReviewHandoff(comparisons, comparisons?.read(comparisonId), arm, signal)
    if (!local) throw new Error(reviewChallengeUnavailable)
    return local
  }

  async function shareReviewChallenge(selection, signal) {
    const { language, played } = await requireReviewHandoff(selection, signal)
    return { code: encodeLighthouseReviewChallenge(language, played) }
  }

  async function reviewHandoffReport(selection, signal, compare = false) {
    const friend = compare ? decodeLighthouseReviewReport(selection.code) : undefined
    const { language, ...local } = await requireReviewHandoff(selection, signal)
    if (friend && friend.language !== language) throw new Error('这份交接战报的题目语言和本局不同。')
    const { played, decision, originalAttached } = local
    return { local, code: encodeLighthouseReviewReport(language, played, decision, originalAttached), ...(friend && { friend }) }
  }

  async function replayReviewReport(selection, signal) {
    const { launchId, kind, comparisonId, arm, code, route = 'review' } = selection
    if (!validOpeningId(launchId)) throw new Error('开局请求无效，请重试。')
    const { local, friend } = await reviewHandoffReport(selection, signal, true)
    const tryDirect = route === 'direct'
    if (route !== 'review' && (!tryDirect || local.played !== 'review' || friend.played !== 'direct' || !friend.originalAttached)) {
      throw new Error('请先核对走直接交付路线的好友战报。')
    }
    const tryReview = route === 'review' && local.played === 'direct'
    const reviewReplaySource = tryDirect || tryReview ? { kind, comparisonId, arm } : undefined
    const presetId = reviewReplaySource ? (await checkLighthouseReviewSwap(reviewReplaySource, route, signal)).candidate.id
      : (await reviewChallengeLoadouts({ sampleLanguage: friend.language }, ['replay'], signal)).routePresets?.[route]
    if (!presetId) throw new Error(reviewRoutesUnavailable)
    const namespace = tryDirect ? 'lighthouse-review-report-try-direct'
      : tryReview ? 'lighthouse-review-report-try-review' : 'lighthouse-review-report-replay'
    const id = createHash('sha256').update(JSON.stringify([namespace, kind, comparisonId, arm, code, launchId])).digest('hex').slice(0, 32)
    return openLighthouseLesson({ launchId: id, reviewChallengeArm: route, reviewReplaySource }, friend.language === 'en',
      signal, lighthouseLesson, presetId)
  }

  async function ownReviewPair(record, signal, observed) {
    const { reviewReplaySource: source, reviewChallengeArm: arm } = record
    if (!source || (observed && !verifiedEvidenceArm(observed))) return
    const comparisons = source.kind === 'workspace' ? workspaceComparisons : rematchComparisons
    const prior = comparisons.read(source.comparisonId)
    if (!prior || prior.material !== record.material || prior.task !== record.task || prior.digest !== record.digest ||
      prior.workspaceId === record.workspaceId) return
    const [current, original] = await Promise.all([
      verifiedReviewHandoff(workspaceComparisons, record, arm, signal, { observed, includeSide: true }),
      verifiedReviewHandoff(comparisons, prior, source.arm, signal, { includeSide: true }),
    ])
    if (!current || !original || current.played === original.played || current.side.sessionId === original.side.sessionId) return
    const byRoute = { [current.played]: current, [original.played]: original }
    const arms = ['review', 'direct'].map(style => {
      const { choiceLabel, originalAttached, side: { sessionId, deliverables, lessonTaskSource } } = byRoute[style]
      return { id: style, style, choices: choiceLabel ? [choiceLabel] : [], materialDelivered: originalAttached,
        deliveredCount: deliverables.length, sessionId, deliverables,
        ...(lessonTaskSource && { lessonTaskSource: { ...lessonTaskSource, handoffPairId: record.id } }) }
    })
    return { material: record.material, arms }
  }

  async function readHandoffTaskPair(id, signal) {
    if (!comparisonIdValid(id)) return
    const challenge = workspaceComparisons.read(id)
    const record = challenge?.reviewReplaySource ? challenge : rematchComparisons.read(id)
    if (!record || ctx.get('workspaceRegistry')?.get(record.workspaceId)?.path !== record.cwd) return
    if (record !== challenge) {
      if (record.lesson !== lighthouseLesson || await workspaceMaterialState(record, signal) !== 'verified') return
      return (await readComparisonArms(rematchComparisons, record, signal)).publicReviewOutcome
    }
    return ownReviewPair(record, signal)
  }

  async function matchedHandoffTaskPair({ handoffPairId, kind, comparisonId, arm }, signal) {
    const pair = await readHandoffTaskPair(handoffPairId, signal)
    const selected = pair?.arms.find(side => {
      const source = side.lessonTaskSource
      return source && source.handoffPairId === handoffPairId && source.kind === kind && source.comparisonId === comparisonId && source.arm === arm
    })
    const alternate = selected && pair.arms.find(side => side.id !== selected.id && side.lessonTaskSource?.handoffPairId === handoffPairId)
    if (selected && alternate) return { selected, alternate }
  }

  async function verifyHandoffTaskPair(source, signal) {
    if (source.handoffPairId !== undefined && !await matchedHandoffTaskPair(source, signal)) {
      throw new Error(handoffPairChanged)
    }
  }

  async function reviewChallengeLoadouts(context, tokenScope, signal) {
    const ecosystem = await discover()
    const routePresets = Object.fromEntries(await Promise.all(workspaceComparisonArms.map(async arm => {
      try {
        const draft = deliveryPlaybookDraft(ecosystem, arm)
        const { candidate, choices } = await plannedGrowth(draft, { ecosystem })
        const required = arm === 'review' ? ['read', 'present', 'ask_user_question'] : ['read', 'present']
        if (required.every(name => choices.some(item => item.kind === 'tool' && item.name === name && !item.timing))) {
          return [arm, candidate.id]
        }
      } catch {
        signal?.throwIfAborted()
      }
      return [arm, null]
    })))
    signal?.throwIfAborted()
    const routes = workspaceComparisonArms.filter(arm => routePresets[arm])
    const view = { kind: 'delivery-review', ...context, task: lighthouseReviewTask(context.sampleLanguage), routes }
    if (!routes.length || routePresets.direct === routePresets.review) return { preview: { ...view, blocked: true, reason: reviewRoutesUnavailable } }
    const token = createHash('sha256').update(JSON.stringify([planTaskOwner, tokenScope, routePresets])).digest('hex')
    return { preview: { ...view, token }, routePresets }
  }

  function checkReviewChallenge(code, signal) {
    const { sample, played, language: sampleLanguage } = decodeLighthouseReviewChallenge(code)
    return reviewChallengeLoadouts({ sample, played, sampleLanguage }, code.trim(), signal)
  }

  function checkReviewStart(english, signal) {
    const sampleLanguage = english ? 'en' : 'zh'
    return reviewChallengeLoadouts({ sampleLanguage }, ['start', sampleLanguage], signal)
  }

  async function openCheckedReviewChallenge({ token, launchId, arm }, check, scope, signal) {
    if (!validOpeningId(launchId) || !workspaceComparisonArms.includes(arm) || typeof token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(token)) throw new Error(challengeChanged)
    const { preview, routePresets } = await check()
    if (preview.blocked || preview.token !== token || !routePresets[arm]) throw new Error(preview.reason ?? challengeChanged)
    const id = createHash('sha256').update(JSON.stringify([...scope, launchId])).digest('hex').slice(0, 32)
    return openLighthouseLesson({ launchId: id, reviewChallengeArm: arm }, preview.sampleLanguage === 'en',
      signal, lighthouseLesson, routePresets[arm])
  }

  function openReviewChallenge(selection, signal) {
    return openCheckedReviewChallenge(selection, () => checkReviewChallenge(selection.code, signal),
      ['lighthouse-review-challenge-v1', selection.code.trim()], signal)
  }

  function openReviewStart(selection, english, signal) {
    return openCheckedReviewChallenge(selection, () => checkReviewStart(english, signal),
      ['lighthouse-review-challenge-start-v1', english ? 'en' : 'zh'], signal)
  }

  const invalidShareChoice = '换装选择无效，请重新核对分享码。'

  function currentShareSlot(source, sources) {
    const hero = sources.hero(source.hero.id)
    if (!hero || hero.owner.package !== source.hero.owner.package) return
    const ref = { ...source, hero }
    const { id } = sources.resolveSlot(ref)
    if (id) return { id, ref }
  }

  function shareChoice({ id, sourceId }, expected, inspection, reader) {
    const { ecosystem, sources } = inspection
    const operation = expected.operation
    const item = equipmentById.get(id) ?? ecosystem.equipment.get(id)
    if (!item) return
    let entry
    let owner
    let decisions = item.decisions
    if (operation === 'remove') {
      const current = currentShareSlot(expected.source, sources)
      if (current?.id !== id || sourceId !== undefined) return
      entry = { kind: 'plugin', operation, source: current.ref }
    } else if (equipmentById.has(id) && sourceId === undefined) {
      owner = sources.packageFor(item.module ?? item.requires)
      if (!owner) return
      entry = { kind: 'featured', id, operation }
    } else if (item.kind === 'tool' && sourceId) {
      const source = sources.tool(item, sourceId)
      if (!source) return
      entry = { kind: 'tool', operation, source, tool: item.name, schema: id }
      if (sources.resolveTool(entry).sourceId !== sourceId) return
      decisions = describePackageActions(sourceToolActions(reader, ecosystem, item, sourceId))
    } else if (item.kind === 'plugin' && sourceId === undefined) {
      const source = sources.slot(id)
      if (!source || item.persona) return
      entry = { kind: 'plugin', operation, source }
      decisions = describePackageActions(catalogActions(reader, item))
    } else return
    const row = { id, sourceId, name: item.name, operation, decisions,
      ...(owner ? { sourceName: owner.package, version: owner.version } : shareRefLabel(entry.source)) }
    return { entry, id, sourceId, row, item: { id, sourceId, kind: item.kind, name: item.name } }
  }

  function shareChoiceNote(expected, choice) {
    if (!choice) return expected.operation === 'remove' ? '保留接收方的自带装备。' : '从草稿中略去这项要求，请查看剩余能力。'
    if (expected.kind === 'tool' && choice.entry.kind === 'tool') {
      if (expected.schema === choice.entry.schema) return '工具接口相同，请核对新来源。'
      if (expected.tool === choice.entry.tool) return '工具同名，接口有变化，请重新核对调用方式。'
    }
    if (expected.kind === 'featured' && expected.id === choice.entry.id) return '使用本机版本提供的功能。'
    if (expected.operation === 'remove') return '在本机预设中卸下对应的装备。'
    return '能力可能与原装备不同，请查看换装后的对照。'
  }

  async function shareOptions({ code, slot, query = '' }, english) {
    if (!Number.isInteger(slot) || typeof query !== 'string' || query.length > 96) throw new Error(invalidShareChoice)
    const inspection = await inspectBuildShare(code)
    const expected = inspection.slots[slot]?.entry
    const local = localShareHero(inspection)
    if (!expected || !local) throw new Error(invalidShareChoice)
    const { ecosystem, sources } = inspection
    const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
    const reader = packageActions(ctx)
    const display = text => english ? englishText(text) : text
    const choices = []
    function consider(card, sourceId) {
      if (!card) return
      const choice = shareChoice({ id: card.id, sourceId }, expected, inspection, reader)
      if (!choice) return
      const actions = (choice.row.decisions ?? []).flatMap(([title, detail]) => [title, display(title), detail, display(detail)])
      const searchable = [card.id, card.name, display(card.name), choice.row.sourceName,
        card.row?.id, ...(card.modules ?? []), ...actions].filter(Boolean).join(' ').toLowerCase()
      if (!words.every(word => searchable.includes(word))) return
      choices.push({ ...choice.row, note: display(shareChoiceNote(expected, choice)) })
    }
    const counterpart = expected.source?.kind === 'preset' && currentShareSlot(expected.source, sources)
    if (expected.operation === 'remove') {
      if (counterpart) consider(ecosystem.equipment.get(counterpart.id))
      return { choices, canSkip: true }
    }
    for (const item of equipment) {
      if (words.length || expected.id === item.id) consider(item)
    }
    for (const card of ecosystem.equipment.values()) {
      if (card.kind === 'plugin' && (words.length || counterpart?.id === card.id)) consider(card)
      if (card.kind !== 'tool' || (!words.length && card.name !== expected.tool)) continue
      const status = statusForEcosystem(card, local.preset, ecosystem)
      const included = ecosystem.standingByPreset.get(local.ref.id)?.get(card.id)
      const providers = new Set([included, ...((status.sourceChoices ?? [status]).map(option => option.sourceId))].filter(Boolean))
      for (const sourceId of providers) consider(card, sourceId)
    }
    choices.sort((a, b) => Number(b.id === expected.schema) - Number(a.id === expected.schema) ||
      a.name.localeCompare(b.name) || a.sourceName.localeCompare(b.sourceName))
    return { choices: choices.slice(0, 18), canSkip: true, more: choices.length > 18 }
  }

  function shareChoiceMap(choices, length) {
    if (!Array.isArray(choices) || choices.length > length) throw new Error(invalidShareChoice)
    const map = new Map()
    for (const choice of choices) {
      if (!choice || Object.getPrototypeOf(choice) !== Object.prototype) throw new Error(invalidShareChoice)
      const { slot, id, sourceId, skip } = choice
      const keys = skip === true ? ['slot', 'skip'] : ['slot', 'id', 'sourceId']
      if (!Number.isInteger(slot) || slot < 0 || slot >= length || map.has(slot) ||
        Object.keys(choice).some(key => !keys.includes(key)) ||
        (skip !== true && (typeof id !== 'string' || id.length > 512 ||
          (sourceId !== undefined && (typeof sourceId !== 'string' || sourceId.length > 512))))) throw new Error(invalidShareChoice)
      map.set(slot, choice)
    }
    return map
  }

  function shareDependencyChanges(before, after) {
    const from = new Map(before.map(item => [item.package, item.version]))
    const to = new Map(after.map(item => [item.package, item.version]))
    return [...new Set([...from.keys(), ...to.keys()])].sort().flatMap(name => {
      const previousVersion = from.get(name)
      const version = to.get(name)
      return previousVersion === version ? [] : [{ name, previousVersion, version,
        state: !previousVersion ? 'added' : !version ? 'removed' : 'changed' }]
    })
  }

  async function adaptBuildShare({ code, choices }, english) {
    const inspection = await inspectBuildShare(code)
    const { ecosystem, result, recipe, sources, slots } = inspection
    const selections = shareChoiceMap(choices, slots.length)
    const local = localShareHero(inspection)
    if (!local) throw new Error('没有可以核对来源的本机预设。')
    const { preset, ref } = local
    const reader = packageActions(ctx)
    const changes = []
    const unresolved = []
    const retainedBuiltIns = new Set()
    let unknownRetainedSlot = false
    const resolved = slots.flatMap((slot, index) => {
      const selection = selections.get(index)
      if (!selection) {
        if (slot.row.state === 'ready') return [slot]
        unresolved.push(index)
        return []
      }
      const selected = !selection.skip && shareChoice(selection, slot.entry, inspection, reader)
      if (!selection.skip && !selected) throw new Error(invalidShareChoice)
      if (selection.skip && slot.entry.operation === 'remove') {
        const current = currentShareSlot(slot.entry.source, sources)
        if (current) retainedBuiltIns.add(current.id)
        else unknownRetainedSlot = true
      }
      const note = shareChoiceNote(slot.entry, selected)
      changes.push({ slot: index, before: slot.row, after: selected?.row, note: english ? englishText(note) : note })
      return selected ? [{ ...selected, chosen: true }] : []
    })
    const base = { ...result, adapted: true, changes, dependencyChanges: [],
      hero: { ...result.hero, name: preset.name ?? result.hero.name, version: ref.owner.version, state: 'ready', reason: undefined },
      gear: resolved.map(item => ({ ...item.row, state: 'ready' })) }
    if (unresolved.length) return { ...base, blocked: true, unresolved, reason: '请先处理仍未选择替代的装备。' }
    try {
      const builtIn = presetEquipment(ecosystem, ref.id)
      const roots = resolved.filter(item => item.entry.operation === 'remove').map(item => item.id)
      const requestedRemovals = new Set(roots.flatMap(id => [id, ...(builtIn[id]?.linked ?? [])]))
      const equips = resolved.filter(item => item.entry.operation === 'equip').map(item => item.id)
      if (new Set(roots).size !== roots.length || new Set(equips).size !== equips.length) {
        throw new Error('同一件装备只能选择一次，请调整换装。')
      }
      for (const item of resolved) {
        if (!item.chosen || item.entry.operation === 'remove') continue
        const removed = new Set(roots.flatMap(id => [id, ...(builtIn[id]?.linked ?? [])]))
        const standing = item.sourceId && ecosystem.standingByPreset.get(ref.id)?.get(item.id)
        const standingIncluded = standing && standing === item.sourceId && !isProfileToolSource(standing) && !removed.has(standing)
        const pluginIncluded = !item.sourceId && builtIn[item.id] && !removed.has(item.id)
        if (standingIncluded || pluginIncluded) {
          item.included = true
          continue
        }
        const option = historicalEquipmentOption(item.item, preset, ecosystem, builtIn, roots)
        if (!option.item) throw new Error(option.reason ?? '这个替代装备无法装到当前英雄。')
        roots.splice(0, roots.length, ...new Set(option.remove))
      }
      const draft = { ...draftFromShare(ref.id, resolved), removedEquipmentIds: roots }
      const candidate = await plan(draft, ecosystem)
      const removed = [...historicalRemovalIds(candidate)]
      if (removed.some(id => retainedBuiltIns.has(id))) {
        throw new Error('替代装备需要卸下你选择保留的自带装备。')
      }
      const addedRemovals = removed.filter(id => !requestedRemovals.has(id))
      if (unknownRetainedSlot && addedRemovals.length) {
        throw new Error('无法核对要保留的自带装备，请选择无需额外卸装的替代装备。')
      }
      const profile = await profileGrowthGear(undefined, ecosystem.bundleRows ?? [])
      const capabilities = plannedGear(ecosystem, ref.id, candidate, profile)
      if (resolved.some(item => item.entry.operation === 'equip' &&
        !matchesDraftGear(capabilities.get(item.id), { sourceId: item.sourceId, kind: item.entry.kind }))) {
        throw new Error('这些选择会让另一件已核对的装备失去原来源。')
      }
      const requirements = shareRequirements(resolved.map(item => item.entry), candidate, sources)
      const beforeCompanions = recipe.companions.map(source => ({ ...shareRefLabel(source), name: source.entry }))
      const afterCompanions = requirements.companions.map(source => ({ ...shareRefLabel(source), name: source.entry }))
      return { ...base, draft, comparison: await compare(draft, ecosystem, candidate),
        dependencies: shareRequirementRows(requirements, sources, ecosystem).map(item => ({ ...item, state: 'ready', reason: undefined })),
        dependencyChanges: shareDependencyChanges(recipe.dependencies, requirements.dependencies),
        additionalRemovals: addedRemovals.map(id => ({ name: builtIn[id]?.name ?? ecosystem.equipment.get(id)?.name ?? id })),
        ...(isDeepStrictEqual(recipe.companions, requirements.companions) ? {} : { beforeCompanions, afterCompanions }) }
    } catch (error) {
      return { ...base, blocked: true, reason: error instanceof Error ? error.message : '无法核对这套出装的来源。' }
    }
  }

  async function compare(selection, discovered, planned, plannedReference) {
    const reference = selection.againstDraft
    if (reference !== undefined && (!reference || typeof reference !== 'object' || Array.isArray(reference))) {
      throw new Error('对照阵容无效，请重新选择。')
    }
    const [ecosystem, uploaded] = await Promise.all([discovered ?? discover(), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    const candidate = planned ?? await plan(selection, ecosystem)
    const target = summarizeCapabilities(ecosystem, candidate.inventoryPresetId ?? selection.presetId, {
      record: candidate.record, units: candidate.units, removed: candidate.removed,
    })
    const againstDraft = reference && (plannedReference ?? await plan(reference, ecosystem))
    const live = !againstDraft && !selection.againstPresetId && match(selection.sourceSessionId)
    const hasBaseline = ecosystem.standingByPreset.has(selection.sourcePresetId)
    const baselineId = againstDraft?.id ?? (selection.againstPresetId || live?.presetId
      || (hasBaseline ? selection.sourcePresetId : candidate.record?.baseId ?? candidate.id))
    if (!againstDraft && !ecosystem.standingByPreset.has(baselineId) && !live) {
      throw new Error('对照英雄暂时不可用，请重新选择。')
    }
    let runtime
    if (live) {
      const plugins = activeAgentUnits(ctx, live.scope)
      const presetPlugins = activePresetUnits(ctx, live.agent.ctx, live.record?.definition.plugins)
      const { tools } = matchToolSources(live, ctx.tools.schemas(live.scope), presetPlugins, plugins)
      runtime = { tools, plugins, presetPlugins }
    }
    const baselineRecord = againstDraft?.record ?? records.get(baselineId)
    const baseline = summarizeCapabilities(ecosystem, reference?.presetId ?? baselineId, {
      record: baselineRecord, units: againstDraft?.units, removed: againstDraft?.removed, runtime,
    })
    const catalog = visibleEquipment(ecosystem)
    const classes = catalogRoles(ctx, ecosystem, catalog, equipmentToolLinks(ecosystem, catalog))
    function hero(id, record, cards) {
      const heroId = record?.baseId ?? id
      const name = record?.baseName ?? ecosystem.presets.find(preset => preset.id === heroId)?.name
        ?? presetLabels.get(heroId)?.[0] ?? heroId
      const sources = record && savedToolSources(record, ecosystem)
      const outfit = record?.equipmentIds.map(original => {
        const id = currentEquipmentId(original, ecosystem)
        const gear = catalog.get(id) ?? equipmentById.get(id)
        const card = cards.get(id) ?? cards.get(original)
        const sourceId = sources[original] ?? card?.sourceId
        const sourceName = record.equipmentSourceLabels?.[original] ?? (card?.sourceId === sourceId ? card?.sourceName : undefined)
        return { id, name: record.equipmentLabels?.[original] ?? gear?.name ?? original, sourceId, sourceName,
          roles: gear?.kind === 'tool' ? classes.tool(gear, sourceId) : classes.byId.get(id),
          art: art('gear', id, sourceId) ?? uploaded('gear', original) }
      }) ?? []
      const removedIds = Object.keys(record?.removedEquipmentLabels ?? {}).map(id => currentEquipmentId(id, ecosystem))
      return { id: heroId, name, buildName: record?.definition.name, art: art('hero', heroId), outfit, removedIds }
    }
    const before = hero(baselineId, baselineRecord, baseline)
    const after = hero(candidate.id, candidate.record, target)
    const reader = packageActions(ctx)
    const trialGear = plannedGear(ecosystem, selection.presetId, candidate, [])
    function addTrialActions(card, gear, moves) {
      if (!gear || !moves.some(Boolean)) return
      card.trialGear = { id: gear.id, name: gear.name, kind: gear.kind, sourceId: gear.sourceId, sourceName: gear.sourceName }
      card.decisionTrials = moves.map(move => move ? move.proofKey ?? actionKey(gear.id, move) : null)
    }
    for (const [cards, hero, registered] of [[baseline, before, runtime?.tools], [target, after]]) {
      const heroMoves = [...builtInHeroActions(hero.id).filter(move => move.id === 'hero:specialty'),
        ...reader.hero(hero.id, ecosystem.compositions.get(hero.id))]
      if (heroMoves.length) {
        const id = 'hero-actions:' + hero.id
        cards.set(id, { id, name: hero.name + ' · 英雄操作', kind: 'effect', decisions: describePackageActions(heroMoves),
          ...(cards === target && { deliveryHero: { id: hero.id, name: hero.name, art: hero.art },
            decisionDeliveries: actionChoices(hero.id, heroMoves).map(move => move.key) }) })
      }
      for (const card of cards.values()) {
        const gear = cards === target ? trialGear.get(card.id) : undefined
        if (card.kind === 'tool') {
          const module = registered?.get(card.id)?.artModule
          const moves = module ? reader.tool(card.name, [module]) : sourceToolActions(reader, ecosystem, card, card.sourceId)
          if (moves.length) {
            card.decisions = describePackageActions(moves)
            card.decisionKeys = moves.map(({ name, detail, instruction, requiresInput }) =>
              JSON.stringify([name, detail, instruction, requiresInput]))
            addTrialActions(card, gear, moves)
          }
        } else if (card.kind === 'plugin') {
          const moves = catalogActions(reader, ecosystem.equipment.get(card.id))
          if (moves.length) {
            card.decisions = describePackageActions(moves)
            addTrialActions(card, gear, moves)
          }
        } else if (card.decisions) {
          const moves = equipmentActions(card.id)
          addTrialActions(card, gear, card.decisions.map(([name]) => moves.find(move => move.name === name)))
        }
      }
    }
    for (const record of actions.entries()) {
      const id = 'custom:' + record.kind + ':' + record.id
      const card = { id, name: record.title + ' · 自定义操作', kind: 'effect',
        decisions: record.actions.map(action => [action.name, action.detail]) }
      if (record.kind === 'hero' ? record.id === before.id : baseline.has(record.id)) baseline.set(id, card)
      if (record.kind === 'hero' ? record.id === after.id : target.has(record.id)) {
        const current = { ...card }
        if (record.kind === 'gear') addTrialActions(current, trialGear.get(record.id), record.actions)
        else {
          current.deliveryHero = after
          current.decisionDeliveries = actionChoices(after.id, record.actions).map(move => move.key)
        }
        target.set(id, current)
      }
    }
    return {
      before,
      after,
      live: Boolean(live),
      ...compareCapabilities(baseline, target, art),
    }
  }

  function verifyLive({ presetId, sessionId }) {
    const record = typeof presetId === 'string' && records.get(presetId)
    const agent = typeof sessionId === 'string' && ctx.get('agents')?.get(sessionId)
    const scope = agent && toolRuntime?.scopeOf(agent.ctx)
    if (!record || !scope || ctx.agentPresets.composedPreset(agent.ctx) !== presetId) {
      throw new Error('无法核验所选阵容的会话。')
    }
    const unavailable = unavailableProfileGear(ctx, record)
    if (unavailable) throw new Error(unavailable)
    const plugins = configuredAgentUnits(record.definition.plugins)
    if (plugins.length) {
      const active = new Set(activeAgentUnits(ctx, scope).map(unit => unit.id))
      const missing = plugins.filter(unit => !active.has(unit.id))
      if (missing.length) {
        const names = missing.map(unit => record.equipmentLabels?.[unit.id] ?? unit.row.id ?? moduleLabel(unit.row.name))
        throw new Error('当前会话缺少插件 ' + names.join('、') + '。')
      }
    }
    const standingScope = toolRuntime.scopeParentOf(scope)
    const requirements = equippedToolBindings(record).filter(tool => !tool.deferred)
    const missing = requirements.filter(tool => boundToolState(ctx, scope, standingScope, record, tool) !== 'ready')
    if (missing.length) {
      throw new Error('当前工作区的会话缺少装备 ' + missing.map(tool => tool.name).join('、') + '。')
    }
    return { sessionId }
  }

  async function verifyContinuation(build) {
    if (records.has(build.presetId)) verifyLive(build)
    if (build.blank) await growth.recordBlankContinuation(build.sessionId, build.blank.sourceSessionId, build.blank.length)
    if (build.sourceSessionId && build.sourceSessionId !== build.sessionId) {
      try {
        await pins.stage(build.sessionId, build.sourceSessionId)
        updates.notify(build.sessionId)
      } catch {
        if (!warnings.includes('shortcuts')) warnings.push('shortcuts')
      }
    }
  }

  function match(sessionId) {
    const agent = typeof sessionId === 'string' && ctx.get('agents')?.get(sessionId)
    if (!agent || !toolRuntime) return
    const runtime = toolRuntime
    const scope = runtime.scopeOf(agent.ctx)
    if (!scope) return
    const presetId = ctx.agentPresets.composedPreset(agent.ctx)
    const record = records.get(presetId)
    return { agent, runtime, scope, presetId, record }
  }

  function requireMatch(sessionId) {
    const active = match(sessionId)
    if (!active) throw new Error('请先打开要续战的会话。')
    return active
  }

  function matchHero(presetId, record) {
    return { id: record?.baseId ?? presetId, name: record?.baseName ?? ctx.agentPresets.definitions?.get(presetId)?.config.name
      ?? presetLabels.get(presetId)?.[0] ?? presetId }
  }

  function teammateRuntime(agent) {
    if (agent.session.header.origin === 'subagent') return
    const runtime = ctx.get('subagents')
    const provider = runtime?.getProvider?.('spawn')
    if (typeof runtime?.startActivation === 'function' && provider?.capabilities?.agentPreset &&
      typeof provider.prepareContinuable === 'function' && runtime.resolveMaxDepth() !== 0) return runtime
  }

  async function teammateRoster({ sessionId }) {
    if (!teammateRuntime(requireMatch(sessionId).agent)) throw new Error('当前对局无法派遣队友。')
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const unavailable = planAvailability(ecosystem)
    const art = packageArt(uploaded, ecosystem)
    const named = new Map(buildPlans.list().reverse().map(item => [item.presetId, item.name]))
    const heroes = new Map(ecosystem.presets.map(preset => {
      const name = preset.name ?? presetLabels.get(preset.id)?.[0] ?? preset.id
      return [preset.id, { id: preset.id, name, description: preset.description, art: art('hero', preset.id),
        rank: growth.heroRank(preset.id), builds: [{ id: preset.id, name: '默认出装', broken: unavailable(preset.id) }] }]
    }))
    for (const [id, record] of records) {
      const { baseId, baseName } = record
      if (!heroes.has(baseId)) heroes.set(baseId, { id: baseId, name: baseName, art: art('hero', baseId),
        rank: growth.heroRank(baseId), builds: [] })
      const gear = record.equipmentIds.map(key => {
        const current = currentEquipmentId(key, ecosystem)
        const source = record.equipmentSources?.[key]
        return { id: current, name: record.equipmentLabels?.[key] ?? ecosystem.equipment.get(current)?.name ?? key,
          sourceName: record.equipmentSourceLabels?.[key],
          art: art('gear', current, source) ?? uploaded('gear', key) }
      })
      heroes.get(baseId).builds.push({ id, name: named.get(id) ?? record.definition.name, gear,
        removed: Object.values(record.removedEquipmentLabels ?? {}), broken: unavailable(id) })
    }
    return [...heroes.values()]
  }

  function teammateAddress(parent, childSessionId) {
    const entries = ctx.get('sessionProjections')?.snapshot?.(parent.session, ['subagentCatalog'])?.values?.subagentCatalog
    const child = entries?.find(item => item.id === childSessionId)
    if (child?.mode === 'continuable') return { parentSessionId: parent.id, childSessionId, mode: child.mode }
  }

  function teamDispatchTask(active, id, revision) {
    const board = teamBoard(active)
    if (!board?.enabled) throw new Error('请先在本局开启智能体团队协作。')
    const task = board.tasks.find(item => item.id === id)
    if (task?.revision !== revision) throw new Error('共享任务已变化，请重新选择。')
    if (!dispatchableTeamTask(task)) throw new Error('请选择依赖已完成且尚未分配的共享任务。')
    return task
  }

  async function launchTeammate({ sessionId, presetId, launchId, title, task = '', teamTask }, requestSignal) {
    const active = requireMatch(sessionId)
    const { agent } = active
    if (closed || !teammateRuntime(agent)) throw new Error('当前对局无法派遣队友。')
    const fromBoard = teamTask !== undefined
    if (typeof launchId !== 'string' || !/^[a-f0-9]{32}$/.test(launchId) ||
      typeof task !== 'string' || task.length > 12_000 ||
      (!fromBoard && (typeof title !== 'string' || !title.trim() || title.length > 80 || !task.trim())) ||
      (fromBoard && (typeof teamTask?.id !== 'string' || !/^task-[1-9][0-9]*$/.test(teamTask.id) ||
        !Number.isSafeInteger(teamTask.revision) || teamTask.revision < 1)) ||
      typeof presetId !== 'string' || !presetId || presetId.length > 512) throw new Error('请核对英雄、任务名称和工作要求。')
    const text = task.trim()
    const target = fromBoard ? [teamTask.id, teamTask.revision] : title.trim()
    const childId = 'session-' + createHash('sha256').update(JSON.stringify([sessionId, launchId, presetId, target, text])).digest('hex').slice(0, 32)
    if (teammateLaunches.has(childId)) return teammateLaunches.get(childId)
    const launched = teammateAddress(agent, childId)
    if (launched) {
      if (!fromBoard || agent.session.snapshotEvents().some(event => event.type === 'team/task' &&
        event.data.version === 2 && event.data.teamId === sessionId && event.data.task.id === teamTask.id &&
        event.data.task.revision === teamTask.revision + 1 && event.data.task.ownerId === childId)) return launched
      throw new Error('上次派遣未分配到这项任务。请核对任务板后重新打开派遣面板。')
    }
    if (fromBoard) teamDispatchTask(active, teamTask.id, teamTask.revision)

    const launch = async () => {
      const signal = AbortSignal.any([lifetime.signal, requestSignal])
      await prepare({ presetId, equipmentIds: [] })
      const selected = agent.model?.current?.() ?? ctx.get('sessionController')?.agents?.selectionFor?.(agent)?.current
      if (!selected?.provider || !selected.model) throw new Error('请先在当前对局选择可用模型。')
      const { provider, model, reasoningEffort } = selected
      const agentOptions = { provider, model, ...(reasoningEffort && { reasoningEffort }) }
      await ctx.get('llm')?.resolveCallConfig(agentOptions, signal)
      signal.throwIfAborted()
      const runtime = teammateRuntime(agent)
      const current = match(sessionId)
      if (current?.agent !== agent || !runtime) throw new Error('当前对局已变化，请重新选择队友。')
      const unavailable = unavailableProfileGear(ctx, records.get(presetId))
      if (unavailable) throw new Error(unavailable)
      const boardTask = fromBoard && teamDispatchTask(current, teamTask.id, teamTask.revision)
      const label = boardTask ? boardTask.subject : target
      const prompt = boardTask ? [{ type: 'text', text: 'DSH 共享任务 ' + boardTask.id + '「' + boardTask.subject + '」已分配给你。' +
        '先用 team_task_get 核对当前任务和负责人。按任务说明执行，实际完成后用 team_task_update 和最新版本标记完成。' +
        '若任务受阻，回传已完成工作和阻碍。若无法使用任务板工具，回传成果给队长验收。' },
      { type: 'text', text: boardTask.description }, ...(text ? [{ type: 'text', text }] : [])] : [{ type: 'text', text }]
      const inputs = { parent: agent, agentPreset: presetId, agentOptions, maxDepth: runtime.resolveMaxDepth(),
        prompt }
      const options = { provider: 'spawn', childId, label, delivery: 'parent', signal }
      // DSH accepts the child's inbox before returning its address. Hold its
      // first model step until the native task board confirms the owner.
      const admission = boardTask && Promise.withResolvers()
      if (admission) teamLaunchAdmissions.set(childId, { parentId: sessionId, ready: admission.promise })
      let activation
      try {
        activation = await runtime.startActivation(typeof runtime.rootOf === 'function'
          ? { ...options, ...inputs } : { ...options, request: inputs })
        if (boardTask) {
          teamDispatchTask(match(sessionId), boardTask.id, boardTask.revision)
          await ctx.get('agentTeams').updateTask(agent, { taskId: boardTask.id, expectedRevision: boardTask.revision,
            action: 'reassign', owner: activation.childId }, lifetime.signal)
          admission.resolve(true)
        }
        return { parentSessionId: sessionId, childSessionId: activation.childId, mode: 'continuable' }
      } catch (error) {
        if (admission) admission.resolve(false)
        await activation?.dispose().catch(() => {})
        throw error
      } finally {
        if (admission) teamLaunchAdmissions.delete(childId)
      }
    }
    const work = launch().finally(() => teammateLaunches.delete(childId))
    teammateLaunches.set(childId, work)
    return work
  }

  function delegatedWork(agent) {
    const { session } = agent
    const agents = ctx.get('agents')
    const ancestors = []
    const seen = new Set([session.id])
    let header = session.header
    while (header?.origin === 'subagent' && header.parentSession && !seen.has(header.parentSession)) {
      ancestors.push(header.parentSession)
      seen.add(header.parentSession)
      header = agents?.get(header.parentSession)?.session.header
    }
    if (!ancestors.length) return
    let identity
    try {
      const runtime = ctx.get('subagents')
      const root = runtime?.rootOf?.(agent)
      if (root && !seen.has(root.id)) ancestors.push(root.id)
      const projected = ctx.get('sessionProjections')?.snapshot?.(session, ['subagent'])?.values?.subagent
      if (projected && session.isOwnSeq(projected.seq)) identity = projected
    } catch {
      // The child's durable parent link is available even during teardown.
    }
    return { ancestors, label: identity?.label, mode: identity?.mode ?? 'unknown' }
  }

  function pluginGrowthItem(record, unit) {
    if (!unit || unit.persona || unit.boundTool) return
    const id = unit.row.config?.sourceUnitId ?? unit.id
    return { id, kind: 'plugin', name: record?.equipmentLabels?.[id] ?? unit.row.id ?? moduleLabel(unit.row.name) }
  }

  function pluginGrowthGear({ agent, record, scope }, standing = activePresetUnits(ctx, agent.ctx, record?.definition.plugins),
    session = activeAgentUnits(ctx, scope)) {
    return [...standing, ...session].map(unit => pluginGrowthItem(record, unit)).filter(Boolean)
  }

  function growthLoadout(active) {
    const { record, scope } = active
    const featured = equippedActions(record, ctx.tools.schemas(scope)).filter(item => item.ready)
    return pluginGrowthGear(active).concat(featured.map(({ id, name }) => ({ id, name, kind: 'featured' })))
  }

  function rememberRuntimeUse(sessionId, heroId, { id, name, sourceId, sourceName }, provider) {
    if (closed) return
    const record = { name, heroId, sessionId, time: Date.now() }
    discoveries.recordUse(id, record)
    const canSnapshot = provider?.sessionRecipe && !provider.persona && provider.id === sourceId
    discoveries.recordSourceUse(id, sourceId, { ...record, sourceName },
      canSnapshot ? () => collectSessionEquipment(ctx, discoveries, sourceId, sessionId) : undefined)
  }

  function creditMatchTool(agent, record, name, { id, sourceId, sourceName, provider, profile, runtimeOnly }) {
    const tool = { id, name, kind: 'tool', sourceId, sourceName }
    growth.toolUsed(agent.session, tool)
    if (runtimeOnly) rememberRuntimeUse(agent.id, record?.baseId ?? ctx.agentPresets.composedPreset(agent.ctx), tool, provider)
    const mounted = pluginGrowthItem(record, provider)
    if (mounted) growth.providerUsed(agent.session, mounted, name)
    if (profile) {
      const item = { id: 'host:' + profile.id, name: moduleLabel(profile.module), kind: 'plugin' }
      growth.providerUsed(agent.session, item, name, [profile.id, profile.unitId])
    }
  }

  function observeTeamTool(execution, definition, scope, dispatch) {
    const { agent, name } = execution
    if (name !== 'team_task_update' || !definition || agent.session.header.origin !== 'subagent') return dispatch()
    let work
    try {
      const origin = ctx.get('agentLoadoutToolOrigins')?.get(definition, scope)
      const module = origin && ctx.pluginPackages.packageOf(origin.moduleName, origin.moduleBaseUrl)?.name
      if (module === '@deepseek-ai/dsh-tool-agent-team' || origin?.moduleName === '@deepseek-ai/dsh-tool-agent-team') {
        const root = ctx.get('subagents')?.rootOf?.(agent)
        const delegation = root && root !== agent && delegatedWork(agent)
        const presetId = delegation && ctx.agentPresets.composedPreset(agent.ctx)
        if (presetId) work = { root: root.session, hero: matchHero(presetId, records.get(presetId)),
          address: { childSessionId: agent.id, parentSessionId: delegation.ancestors[0], mode: delegation.mode } }
      }
    } catch {
      // An unavailable provenance record must not change the tool outcome.
    }
    return work ? teamToolExecution.run(work, dispatch) : dispatch()
  }

  function noteTeamCompletion(session, event) {
    const work = teamToolExecution.getStore()
    const { task } = event.data
    if (closed || work?.root !== session || event.data.version !== 2 || task.status !== 'completed' ||
      task.ownerId !== work.address.childSessionId) return
    const previous = session.snapshotEvents(0, event.seq).findLast(item => item.type === 'team/task' &&
      item.data.teamId === session.id && item.data.task?.id === task.id)?.data.task
    if (previous?.status !== 'in_progress' || previous.revision !== task.revision - 1 || previous.ownerId !== task.ownerId) return
    queueMicrotask(() => {
      if (closed) return
      try {
        appendPluginRecord(session, teamworkRecord, { taskId: task.id, revision: task.revision,
          completionSeq: event.seq, hero: work.hero, address: work.address })
        updates.notify(session.id)
      } catch {
        // The ordinary delivery stays valid if the extra record cannot be saved.
      }
    })
  }

  function observeExecutorCall(session, event) {
    if (typeof ctx.tools.selectExecutor !== 'function') return
    const active = match(session.id)
    if (!active || active.agent.session !== session) return
    const { agent, scope, record, runtime } = active
    const { name } = event.data
    if (ctx.tools.get(name, scope)) return
    const transport = executorTools(ctx, scope)
    const schema = transport.schemas.find(tool => tool.name === name)
    if (!schema) return
    const standing = activePresetUnits(ctx, agent.ctx, record?.definition.plugins)
    const plugins = activeAgentUnits(ctx, scope)
    const id = toolKey(schema)
    const details = registeredToolDetails(ctx, scope, [], standing, plugins, { ...transport, schemas: [schema] }).get(id)
    const tool = { id, name, kind: 'tool', sourceId: details.artSourceId, sourceName: details.sourceName }
    // The native session log rejects writes from inside event publication.
    queueMicrotask(() => { if (!closed) toolRecords.record(session, event, tool) })
    const requirement = equippedToolBindings(record).find(item => item.name === name)
    if (requirement && (requirement.id !== id ||
      boundToolState(ctx, scope, runtime.scopeParentOf(scope), record, requirement) !== 'ready')) return
    const profile = transport.origin?.profileEntry
    if (profileProviderActive(profile)) {
      return { tool, provider: profileEquipmentFor(profile),
        profileIds: [profile.id, transport.origin.unitEntry.id] }
    }
    const provider = details.artSourceId && [...standing, ...plugins].find(unit =>
      (unit.row.config?.sourceUnitId ?? unit.id) === details.artSourceId)
    return { tool, provider: pluginGrowthItem(record, provider), sessionProvider: provider,
      runtimeOnly: transport.origin?.scope === scope }
  }

  function profileGrowthEntries() {
    return new Map(Array.from(ctx.loader.entries()).filter(entry => !entry.options.group && profileProviderActive(entry))
      .map(entry => [entry.id, { module: entry.options.name, baseUrl: entry.parent.tree.ctx.baseUrl, shortcutKey: profileProviderId(entry) }]))
  }

  function profileEquipmentFor(entry) {
    const module = entry.options.name
    const meta = equipmentMetadata(ctx, module, entry.parent.tree.ctx.baseUrl)
    return { id: 'host:' + entry.id, kind: 'plugin', name: metadata(meta, 'title') ?? moduleLabel(module) }
  }

  function addNativeTrial(trials, gearId, kind, actionId, sourceId, name, detail) {
    if (!trials || !sourceId) return
    const key = nativeTrialKey(gearId, kind, actionId, sourceId)
    const item = { key, kind, name, detail, operation: nativeOperationKey(kind, actionId, sourceId),
      ...(growth.nativeTrialMastered({ kind, key }) && { mastered: true }) }
    if (!trials.has(gearId)) trials.set(gearId, [])
    trials.get(gearId).push(item)
  }

  function profilePanelActivities(profile, trials) {
    const service = ctx.get('agentLoadoutPanelActivities')
    const result = new Map()
    const byEntry = new Map(Array.from(ctx.loader.entries(), entry => [entry.id, { entry, activities: service?.list(entry) ?? [] }]))
    for (const { entry, activity } of planReviews.sources().values()) {
      const { id, name, detail } = activity
      byEntry.get(entry.id)?.activities.push({ id: 'review:' + id, name, detail })
    }
    for (const item of profile) {
      const activities = item.profileEntries.flatMap(entryId => {
        const row = byEntry.get(entryId)
        if (!row) return []
        const sourceId = trials && profileProviderId(row.entry)
        return row.activities.map(activity => {
          addNativeTrial(trials, item.id, 'panel', activity.id, sourceId, activity.name, activity.detail)
          return { ...activity, id: entryId + ':' + activity.id }
        })
      })
      if (activities.length) result.set(item.id, activities)
    }
    return result
  }

  function compactionOrigin(active) {
    return ctx.get('agentLoadoutToolOrigins')?.service?.('compaction', active?.scope)
  }

  function equipmentCompactionActivities(profile, trials, active) {
    const result = new Map()
    const origin = compactionOrigin(active)
    if (!origin) return result
    const equipment = origin.profileEntry ? profileEquipmentFor(origin.profileEntry) : active && providerEquipment(active, origin)
    if (!equipment || !profileProviderActive(origin.toolEntry)) return result
    const sourceId = providerTrialSource(origin, equipment)
    const targets = origin.profileEntry ? profile.filter(item => item.profileEntries.includes(origin.profileEntry.id)).map(item => item.id)
      : [equipment.id]
    const { id, name, detail } = compactionActivity
    for (const gearId of targets) {
      addNativeTrial(trials, gearId, 'compaction', id, sourceId, name, detail)
      result.set(gearId, [compactionActivity])
    }
    return result
  }

  function recordCompaction(session, event) {
    const active = match(session.id)
    if (active?.agent.session !== session) return
    const origin = event.type !== 'compaction/summary' && compactionOrigin(active)
    const equipment = origin && providerEquipment(active, origin)
    const sourceId = equipment && providerTrialSource(origin, equipment)
    const proof = compactionProofs(session, event, sourceId && { sourceId, equipment, profile: origin.profileEntry })
    if (!proof) return
    const { id: actionId, name } = compactionActivity
    void growth.recordEquipmentUse(session.id, event, { kind: 'compaction', name, actionId, sourceId,
      heroId: matchHero(active.presetId, active.record).id, delegation: delegatedWork(active.agent),
    }, proof.equipment, proof.profile && profileGrowthEntries()).catch(() => {
      if (!warnings.includes('progress.json')) warnings.push('progress.json')
    })
  }

  function recordPanelActivity(entry, sessionId, activity, occurredAt = Date.now()) {
    if (closed || !profileProviderActive(entry)) return false
    const active = match(sessionId)
    if (!active) return false
    try {
      const equipment = profileEquipmentFor(entry)
      const seq = appendPluginRecord(active.agent.session, panelActivityRecord, { name: activity.name, source: equipment.name.slice(0, 300) })
      void growth.recordEquipmentUse(sessionId, { seq, time: occurredAt }, {
        kind: 'panel', name: activity.name, actionId: activity.id, sourceId: profileProviderId(entry),
        heroId: matchHero(active.presetId, active.record).id, delegation: delegatedWork(active.agent),
      }, equipment, profileGrowthEntries()).catch(() => {
        if (!warnings.includes('progress.json')) warnings.push('progress.json')
      })
      return true
    } catch {
      return false
    }
  }

  function recordPlanReview({ sessionId, callId, packageName, actionId, digest }) {
    if (closed || typeof sessionId !== 'string' || !sessionId || sessionId.length > 512
      || typeof callId !== 'string' || !callId || callId.length > 512
      || typeof packageName !== 'string' || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) return { accepted: false }
    const active = match(sessionId)
    const source = planReviews.sources().get(packageName)
    if (!active || !source || source.activity.id !== actionId) return { accepted: false }
    return planReviews.confirm(active.agent.session, callId, digest,
      time => recordPanelActivity(source.entry, sessionId, { ...source.activity, id: 'review:' + actionId }, time))
  }

  function providerEquipment(active, origin, standing, mounted) {
    if (!origin || !profileProviderActive(origin.toolEntry)) return
    if (origin.profileEntry) return profileEquipmentFor(origin.profileEntry)
    const { agent, scope, record } = active
    return pluginGrowthItem(record, scopedEquipmentProvider(ctx, scope, origin,
      standing ?? activePresetUnits(ctx, agent.ctx, record?.definition.plugins),
      mounted ?? activeAgentUnits(ctx, scope)))
  }

  function providerTrialSource(origin, equipment) {
    return origin.profileEntry ? profileProviderId(origin.profileEntry) : origin.shortcutSourceId ?? equipment.id
  }

  function equipmentCommands(active, standing, mounted, profile, trials) {
    const rows = new Map()
    const registry = ctx.get('commands')
    const origins = ctx.get('agentLoadoutToolOrigins')
    if (typeof registry?.list !== 'function' || typeof registry.find !== 'function' || !origins?.command) return rows
    for (const { name, description, input } of registry.list(active.agent)) {
      const origin = origins.command(registry.find(active.agent, name))
      const equipment = providerEquipment(active, origin, standing, mounted)
      if (!equipment) continue
      const command = { name, description, hint: input?.hint }
      const targets = origin.profileEntry
        ? profile.filter(item => item.profileEntries.includes(origin.profileEntry.id)).map(item => item.id)
        : [equipment.id]
      for (const id of targets) {
        if (!rows.has(id)) rows.set(id, [])
        rows.get(id).push(command)
        if (trials) addNativeTrial(trials, id, 'command', name, providerTrialSource(origin, equipment), name, command.hint)
      }
    }
    return rows
  }

  function observeCommand(session, event) {
    const use = ctx.get('agentLoadoutToolOrigins')?.takeCommand?.(session, event.data.commandId)
    if (!use || event.data.kind !== 'success') return
    const active = match(session.id)
    if (active?.agent.session !== session) return
    const equipment = providerEquipment(active, use.origin)
    if (!equipment) return
    const profile = use.origin.profileEntry && profileGrowthEntries()
    void growth.recordEquipmentUse(session.id, event, { kind: 'command', name: use.name,
      sourceId: providerTrialSource(use.origin, equipment), heroId: matchHero(active.presetId, active.record).id,
      delegation: delegatedWork(active.agent),
    }, equipment, profile).catch(() => {
      if (!warnings.includes('progress.json')) warnings.push('progress.json')
    })
  }

  function flagGear(gear, art) {
    return gear.map(item => ({ ...item, art: art('gear', item.id, item.sourceId, item.kind === 'tool' ? item.name : undefined) }))
  }

  function relayLegArtwork(leg, art) {
    return leg && { ...leg, hero: { ...leg.hero, art: art('hero', leg.hero.id) }, gear: flagGear(leg.gear, art) }
  }

  function questContext({ agent, presetId, record }) {
    const { session } = agent
    return { sessionId: session.id, parentId: session.header?.parentSession, inherited: session.inheritedEventCount,
      createdAt: session.header?.createdAt, hero: matchHero(presetId, record), after: session.seq }
  }

  async function handoffGrowthQuest({ sessionId, id }, signal) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const active = requireMatch(sessionId)
    const offer = growth.continuationOffer(questContext(active))
    if (!offer || offer.id !== id) throw new Error('原委托已变化，请刷新成长面板。')
    const query = ctx.get('sessionQuery')
    if (!query) throw new Error('当前 DSH 无法读取续战记录。')
    const source = await query.observeSession(sessionId, { projectionMode: 'none', signal })
    try {
      const current = requireMatch(sessionId)
      const context = questContext(current)
      if (closed || current.agent !== active.agent || current.presetId !== active.presetId ||
        context.parentId !== source.header.parentSession || context.inherited !== source.inheritedEventCount) {
        throw new Error('当前阵容或续战记录已变化，请刷新成长面板。')
      }
      const inheritedTurn = (event, proof) => event?.type === 'turn/end' && event.seq < context.inherited &&
        event.data.turn === proof.turn && event.data.reason.kind === 'completed' &&
        (proof.time === undefined || event.time === proof.time)
      const inheritedStep = proof => {
        const event = source.events[proof.seq]
        if (!proof.kind) return inheritedTurn(event, proof)
        if (!event || event.seq >= context.inherited) return false
        if (proof.kind === 'command') return event.type === 'command/done' && event.data.kind === 'success' &&
          event.data.commandId === proof.commandId && event.time === proof.time
        if (proof.kind === 'compaction') return event.type === 'compaction/end' && event.data.error === undefined &&
          event.data.compactionId === proof.compactionId && event.time === proof.time
        return proof.kind === 'panel' && event.type === panelActivityRecord && event.ignorable === true &&
          event.data.name === proof.name && event.time >= proof.time
      }
      return await growth.handoff(context, id,
        inheritedStep,
        progress => progress.seq === undefined
          ? source.events.slice(0, context.inherited).some(event => inheritedTurn(event, progress))
          : inheritedTurn(source.events[progress.seq], progress))
    } finally {
      source[Symbol.dispose]()
    }
  }

  function displayFlagFor(heroId, art) {
    const flag = growth.flagFor(heroId)
    if (flag) return { id: flag.id, title: flag.title, pair: flagGear(flag.pair, art), comboAction: flag.comboAction?.name,
      stagedAction: flag.stagedAction?.name, partner: flag.teamwork && (heroId === flag.hero.id ? flag.teamwork.hero.name : flag.hero.name) }
  }

  function displaySignatureFor(heroId, art) {
    const item = growth.signatureFor(heroId)
    return item && { ...item, art: art('gear', item.id, item.sourceId, item.kind === 'tool' ? item.name : undefined) }
  }

  function teamWorkArt(work, art) {
    return work && { ...work, hero: { ...work.hero, art: art('hero', work.hero.id) } }
  }

  async function growthFlags() {
    const flags = growth.flags()
    if (!flags.length) return []
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    return flags.map(flag => ({ ...flag, hero: { ...flag.hero, art: art('hero', flag.hero.id) },
      pair: flagGear(flag.pair, art), teamwork: teamWorkArt(flag.teamwork, art) }))
  }

  function historySources(sources) {
    const entries = Object.entries(sources).map(([id, source]) => ({ id, ...source }))
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.rounds - a.rounds || a.id.localeCompare(b.id))
    const names = entries.map(source => source.name)
    return entries.map(source => source.name && names.indexOf(source.name) !== names.lastIndexOf(source.name)
      ? { ...source, name: source.name + ' · ' + source.id.slice(-6) } : source)
  }

  async function heroFieldEquipment({ heroId }) {
    if (typeof heroId !== 'string' || !heroId || heroId.length > 512) throw new Error('找不到这位英雄的实战装备。')
    await growth.settle()
    const rows = await growth.heroEquipment(heroId)
    if (!rows.length) return []
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    return rows.map(item => {
      const { id, sources, ...row } = item
      const equipmentId = currentEquipmentId(id, ecosystem)
      const verifiedSources = historySources(sources)
      const sourceId = verifiedSources[0]?.id
      return { ...row, id: equipmentId, historyId: id, sources: verifiedSources, sourceId,
        signatureProgress: growth.signatureProgress(heroId, item),
        art: art('gear', equipmentId, sourceId) ?? uploaded('gear', id) }
    })
  }

  function equipmentHistoryIdentity(id, ecosystem) {
    const canonical = key => currentEquipmentId(key, ecosystem)
    const equipmentId = canonical(id)
    const ids = new Set([id, equipmentId])
    for (const legacyId of ecosystem.aliases.keys()) {
      if (canonical(legacyId) === equipmentId) ids.add(legacyId)
    }
    return { ids: [...ids], canonical }
  }

  async function equipmentFieldHeroes({ id }) {
    if (typeof id !== 'string' || !id || id.length > 512) throw new Error('找不到这件装备的实战搭配。')
    const ecosystem = await discover()
    const { ids, canonical } = equipmentHistoryIdentity(id, ecosystem)
    await growth.settle()
    const rows = await growth.equipmentHeroes(ids, canonical)
    if (!rows.length) return { heroes: [], sources: [] }
    const art = packageArt(await appearance.index(), ecosystem)
    const presets = new Map(ecosystem.presets.map(hero => [hero.id, hero]))
    const observed = Object.create(null)
    for (const row of rows) {
      for (const [sourceId, source] of Object.entries(row.sources)) {
        const previous = observed[sourceId]
        if (!previous || (source.time ?? 0) > (previous.time ?? 0)) {
          observed[sourceId] = { ...source, name: source.name ?? previous?.name }
        }
      }
    }
    const sources = historySources(observed).map(({ id, name }) => ({ id, name }))
    const labels = new Map(sources.map(source => [source.id, source.name]))
    return { sources, heroes: rows.map(row => ({
      ...row, hero: { ...row.hero, name: presets.get(row.hero.id)?.name ?? presetLabels.get(row.hero.id)?.[0] ?? row.hero.name,
        art: art('hero', row.hero.id) },
      sources: historySources(row.sources).map(source => ({ ...source, name: labels.get(source.id) ?? source.name })),
    })) }
  }

  async function equipmentFieldReview({ id, heroId, sourceId }) {
    if (![id, heroId, sourceId].every(value => typeof value === 'string' && value && value.length <= 512)) {
      throw new Error('找不到这条实战记录。')
    }
    const { ids, canonical } = equipmentHistoryIdentity(id, await discover())
    await growth.settle()
    const proof = await growth.equipmentSourceProof(heroId, ids, canonical(sourceId), canonical)
    if (!proof) throw new Error('这次使用的原回合已不在保留记录中。')
    return proof
  }

  function historicalEquipmentOption(item, preset, ecosystem, builtIn, removedRoots = []) {
    const card = ecosystem.equipment.get(item.id)
    const featured = equipmentById.get(item.id)
    if (!validEquipmentIds([item.id]) || !(card || featured)) return {}
    if (item.kind === 'tool' && !item.sourceId) return { reason: '原工具来源未核验，请在装备库选择。' }
    let roots = removedRoots
    const statusForDraft = () => {
      const removed = new Set(roots.flatMap(id => [id, ...(builtIn[id]?.linked ?? [])]))
      return card ? statusForEcosystem(card, preset, ecosystem, item.sourceId, removed)
        : featuredStatus(featured, preset, ecosystem, legacy.moduleName, removed)
    }
    let status = statusForDraft()
    const executor = ecosystem.executorByPreset.get(preset.id)
    if (status.state === 'unavailable' && card?.transport && ecosystem.executorUnits.has(item.sourceId)
      && executor !== item.sourceId && builtIn[executor] && !builtIn[executor].locked) {
      roots = [...new Set([...roots, executor])]
      status = statusForDraft()
    }
    if (status.state !== 'available' || (item.sourceId && status.sourceId !== item.sourceId)) return { reason: status.reason }
    return { item, remove: [...roots, ...(status.replacement?.remove ?? [])], providerId: status.equipId ?? item.id }
  }

  function historicalDraft(presetId, options) {
    return { presetId, equipmentIds: options.map(({ item }) => item.id),
      equipmentSources: Object.fromEntries(options.filter(({ item }) => item.sourceId).map(({ item }) => [item.id, item.sourceId])),
      removedEquipmentIds: [...new Set(options.flatMap(option => option.remove))] }
  }

  function historicalRemovalIds(candidate) {
    return new Set([...(candidate.removed ?? []), ...Array.from(candidate.units?.values() ?? [], unit => unit.replaceId).filter(Boolean)])
  }

  function historicalRemovals(candidate, builtIn, ecosystem) {
    return [...historicalRemovalIds(candidate)].map(key => builtIn[key]?.name ?? ecosystem.equipment.get(key)?.name).filter(Boolean)
  }

  async function previewRelayLoadout({ sessionId, questId, draft }) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 512 || typeof questId !== 'string' ||
      typeof draft?.presetId !== 'string' || !validEquipmentIds(draft.equipmentIds) ||
      !validEquipmentSources(draft.equipmentSources, draft.equipmentIds) || !validRemovedEquipment(draft.removedEquipmentIds ?? [])) {
      throw new Error('接力阵容无效，请重新选择。')
    }
    await growth.settle()
    const relay = growth.relayLoadout(sessionId, questId)
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    const item = { ...relay.gear, art: art('gear', relay.gear.id, relay.gear.sourceId) }
    const profile = await profileGrowthGear(undefined, ecosystem.bundleRows ?? [])
    const current = await checkDraftGear(draft, item, ecosystem, profile)
    const saved = records.get(draft.presetId)
    const hero = matchHero(draft.presetId, saved)
    const preview = { title: relay.title, item, hero, firstHero: relay.first, ready: Boolean(current.ready),
      timing: current.ready ? current.gear.timing : undefined, currentSource: current.gear?.sourceName, wrongSource: Boolean(current.gear && !current.ready) }
    if (current.ready) return preview
    return { ...preview, ...await repairDraftGear(draft, item, ecosystem, profile, current) }
  }

  async function checkDraftGear(draft, item, ecosystem, profile) {
    try {
      const candidate = await plan(draft, ecosystem)
      const gear = plannedGear(ecosystem, draft.presetId, candidate, profile).get(item.id)
      return { candidate, gear, ready: matchesDraftGear(gear, item) }
    } catch (error) {
      return { reason: error instanceof Error ? error.message : '这套阵容当前不可用。' }
    }
  }

  function matchesDraftGear(current, item) {
    const source = questToolSource(item)
    return Boolean(current && (!source || current.sourceId === source))
  }

  async function repairDraftGear(draft, item, ecosystem, profile, current, { replaceConflicts = false } = {}) {
    const source = questToolSource(item)
    const saved = records.get(draft.presetId)
    const hero = matchHero(draft.presetId, saved)
    const preset = ecosystem.presets.find(row => row.id === hero.id && !row.broken)
    if (!preset) return { reason: current.reason ?? '当前英雄的基础阵容不可用。' }
    const builtIn = presetEquipment(ecosystem, hero.id)
    const ids = (saved?.equipmentIds ?? draft.equipmentIds).map(id => currentEquipmentId(id, ecosystem))
    const sources = saved ? savedToolSources(saved, ecosystem) : draft.equipmentSources ?? {}
    const roots = (saved?.removedEquipmentIds ?? draft.removedEquipmentIds ?? []).map(id => currentEquipmentId(id, ecosystem))
    const before = new Set([
      ...roots.flatMap(id => [id, ...(builtIn[id]?.linked ?? [])]),
      ...(current.candidate ? historicalRemovalIds(current.candidate) : []),
    ])
    const labels = ids => ids.map(id => builtIn[id]?.name ?? ecosystem.equipment.get(id)?.name ?? id)
    const kept = ids.filter(id => id !== item.id)
    const keptSources = Object.fromEntries(Object.entries(sources).filter(([id]) => kept.includes(id)))
    const provider = source ? ecosystem.standingByPreset.get(hero.id)?.get(item.id) === source && source : item.id
    const restored = roots.filter(id => id !== provider && !builtIn[id]?.linked.includes(provider))
    const candidates = []
    if (kept.length < ids.length || restored.length < roots.length) {
      candidates.push({ draft: { presetId: hero.id, equipmentIds: kept, equipmentSources: keptSources, removedEquipmentIds: restored },
        providerId: builtIn[provider] ? provider : undefined })
    }
    const option = historicalEquipmentOption(item, preset, ecosystem, builtIn, roots)
    if (option.item) candidates.push({ draft: { presetId: hero.id, equipmentIds: [...kept, item.id],
      equipmentSources: source ? { ...keptSources, [item.id]: source } : keptSources, removedEquipmentIds: [...new Set(option.remove)] },
      providerId: option.providerId })

    if (replaceConflicts) {
      const selectedProviders = kept.map(id => {
        const card = ecosystem.equipment.get(id)
        const sourceId = sources[id] ?? current.candidate?.record?.equipmentSources?.[id]
        const { providerId } = historicalEquipmentOption({ id, kind: card?.kind, sourceId }, preset, ecosystem, builtIn, roots)
        return { id, claims: providerId ? standingToolClaims(providerId, ecosystem) : [] }
      })
      const replacements = candidates.flatMap(({ draft: candidate, providerId }) => {
        if (!providerId) return []
        const claims = standingToolClaims(providerId, ecosystem)
        const conflicts = new Set(selectedProviders.filter(row => row.claims.some(({ name, provider }) =>
          claims.some(claim => claim.name === name && claim.provider !== provider))).map(row => row.id))
        if (!conflicts.size) return []
        return [{ draft: { ...candidate, equipmentIds: candidate.equipmentIds.filter(id => !conflicts.has(id)),
          equipmentSources: Object.fromEntries(Object.entries(candidate.equipmentSources).filter(([id]) => !conflicts.has(id))) } }]
      })
      candidates.push(...replacements)
    }

    let reason = current.reason ?? option.reason
    for (const { draft: candidateDraft } of candidates) {
      const checked = await checkDraftGear(candidateDraft, item, ecosystem, profile)
      if (checked.ready) {
        const after = historicalRemovalIds(checked.candidate)
        return { repair: { draft: candidateDraft, timing: checked.gear.timing,
          removed: labels([...after].filter(id => !before.has(id))), restored: labels([...before].filter(id => !after.has(id))) } }
      }
      reason = checked.reason ?? reason
    }
    return { reason: reason ?? (source ? '当前阵容无法提供这件装备的原来源。' : '当前阵容无法提供这件装备。') }
  }

  async function recoverDraftGear(draft, item, ecosystem, profile, candidate) {
    const current = await repairDraftGear(draft, item, ecosystem, profile, { candidate })
    if (current.repair) return current
    const sourceId = item.kind === 'tool' ? questToolSource(item) : item.id
    if (!sourceId || collection.has(sourceId)) return current
    const toolId = item.kind === 'tool' ? item.id : undefined
    const recorded = toolId ? discoveries.sourcesOf(toolId)?.get(sourceId) : discoveries.snapshotOf(sourceId)
    if (!recorded?.snapshot) return current
    try {
      checkCollectionCompatibility(recorded.snapshot)
      const restored = await discover([recorded.snapshot])
      const result = await repairDraftGear(draft, item, restored, profile, { candidate })
      return result.repair ? { repair: { ...result.repair,
        collection: { id: sourceId, sessionId: recorded.sessionId, toolId: toolId ?? recorded.toolId } } } : result
    } catch (error) {
      return { reason: error instanceof Error ? error.message : current.reason }
    }
  }

  async function previewEquipmentPairing({ id, heroId, sourceId, againstDraft }) {
    if (![id, heroId, ...(sourceId === undefined ? [] : [sourceId])].every(value =>
      typeof value === 'string' && value && value.length <= 512)) throw new Error('找不到这套实战搭配。')
    const ecosystem = await discover()
    const preset = ecosystem.presets.find(item => item.id === heroId)
    if (!preset || preset.broken) throw new Error(preset?.broken ?? '这位英雄当前不可用。')
    const { ids, canonical } = equipmentHistoryIdentity(id, ecosystem)
    await growth.settle()
    const pairing = (await growth.equipmentHeroes(ids, canonical)).find(row => row.hero.id === heroId)
    if (!pairing) throw new Error('这位英雄还没有这件装备的实战结算。')
    const equipmentId = canonical(id)
    const card = ecosystem.equipment.get(equipmentId) ?? equipmentById.get(equipmentId)
    if (!card) throw new Error('这件装备当前未登记，请在装备库核对。')
    const source = sourceId === undefined ? undefined : canonical(sourceId)
    if (card.kind === 'tool' ? !source || !Object.hasOwn(pairing.sources, source) : source !== undefined) {
      throw new Error('请选择这位英雄使用过的装备来源。')
    }
    const builtIn = presetEquipment(ecosystem, heroId)
    const profile = await profileGrowthGear(undefined, ecosystem.bundleRows ?? [])
    const art = packageArt(await appearance.index(), ecosystem)
    const item = { id: equipmentId, kind: card.kind ?? 'featured', name: card.name, sourceId: source,
      sourceName: source && pairing.sources[source].name, art: art('gear', equipmentId, source) }
    const matchingCapability = candidate => {
      const current = plannedGear(ecosystem, heroId, candidate, profile).get(equipmentId)
      if (current && (!source || canonical(current.sourceId) === source)) return current
    }

    let draft = historicalDraft(heroId, [])
    let candidate = await plan(draft, ecosystem)
    let current = matchingCapability(candidate)
    if (!current) {
      const option = historicalEquipmentOption(item, preset, ecosystem, builtIn)
      if (!option.item) return { item, unavailable: option.reason ?? '历史装备当前不可装配。' }
      draft = historicalDraft(heroId, [option])
      try {
        candidate = await plan(draft, ecosystem)
        current = matchingCapability(candidate)
      } catch (error) {
        return { item, unavailable: error instanceof Error ? error.message : '历史装备当前不可装配。' }
      }
      if (!current) return { item, unavailable: '当前阵容无法提供记录中的装备来源。' }
    }
    const placement = current.profileEntries ? 'profile' : draft.equipmentIds.length ? 'selected' : 'included'
    return { item, draft, placement, timing: current.timing, removed: historicalRemovals(candidate, builtIn, ecosystem),
      comparison: await compare({ ...draft, againstDraft }, ecosystem, candidate) }
  }

  function fittingItem({ id, sourceId }, ecosystem, art) {
    const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 512
    if (!validId(id) || (sourceId !== undefined && !validId(sourceId))) throw new Error('请选择要试装的装备和来源。')
    const equipmentId = currentEquipmentId(id, ecosystem)
    const card = ecosystem.equipment.get(equipmentId) ?? equipmentById.get(equipmentId)
    if (!card) throw new Error('这件装备当前未登记，请刷新装备库。')
    const source = sourceId && currentEquipmentId(sourceId, ecosystem)
    if (card.kind === 'tool' ? !source || source === 'profile' : source !== undefined) {
      throw new Error('请选择具体的工具来源。')
    }
    return { id: equipmentId, kind: card.kind ?? 'featured', name: card.name, sourceId: source,
      art: art('gear', equipmentId, source) }
  }

  async function fitDraftEquipment(draft, items, ecosystem, profile, initial, { pinProfileTools = false } = {}) {
    let candidate = initial
    let gear = plannedGear(ecosystem, draft.presetId, candidate, profile)
    const fits = item => matchesDraftGear(gear.get(item.id), item) && (!pinProfileTools ||
      !isProfileToolSource(item.sourceId) || draft.equipmentSources[item.id] === item.sourceId)
    for (const item of items) {
      if (fits(item)) continue
      const { repair, reason } = await repairDraftGear(draft, item, ecosystem, profile, { candidate }, { replaceConflicts: true })
      if (!repair) return { unavailable: items.length > 1 ? item.name + ' · ' + reason : reason }
      draft = repair.draft
      candidate = await plan(draft, ecosystem)
      gear = plannedGear(ecosystem, draft.presetId, candidate, profile)
    }
    const displaced = items.find(item => !fits(item))
    if (displaced) return { unavailable: '试装会使「' + displaced.name + '」失去所选来源或装配位置。请选择其他搭配。' }
    return { draft, candidate, gear }
  }

  async function previewEquipmentFitting({ id, heroId, sourceId, partner, againstDraft }) {
    if (typeof heroId !== 'string' || !heroId || heroId.length > 512 ||
      (partner !== undefined && (!partner || typeof partner !== 'object' || Array.isArray(partner)))) {
      throw new Error('请选择要试装的英雄和装备。')
    }
    const ecosystem = await discover()
    const preset = ecosystem.presets.find(item => item.id === heroId)
    if (!preset || preset.broken) throw new Error(preset?.broken ?? '这位英雄当前不可用。')
    const profile = await profileGrowthGear(undefined, ecosystem.bundleRows ?? [])
    const art = packageArt(await appearance.index(), ecosystem)
    const item = fittingItem({ id, sourceId }, ecosystem, art)
    const second = partner && fittingItem(partner, ecosystem, art)
    if (second?.id === item.id) throw new Error('请选择两件不同的装备。')
    const items = second ? [item, second] : [item]
    let startingDraft = historicalDraft(heroId, [])
    if (againstDraft?.presetId === heroId) {
      startingDraft = { ...startingDraft, equipmentIds: againstDraft.equipmentIds, equipmentSources: againstDraft.equipmentSources ?? {},
        removedEquipmentIds: againstDraft.removedEquipmentIds ?? [] }
    }
    const initial = await checkDraftGear(startingDraft, item, ecosystem, profile)
    if (!initial.candidate) return { item, unavailable: initial.reason }
    const fit = order => fitDraftEquipment(startingDraft, order, ecosystem, profile, initial.candidate)
    let result = await fit(items)
    if (!result.draft && second) {
      const reversed = await fit([second, item])
      if (reversed.draft) result = reversed
    }
    if (!result.draft) return { item, unavailable: result.unavailable }
    const { draft, candidate, gear } = result
    const builtIn = presetEquipment(ecosystem, heroId)
    const before = historicalRemovalIds(initial.candidate)
    const after = historicalRemovalIds(candidate)
    const labels = ids => ids.map(id => builtIn[id]?.name ?? ecosystem.equipment.get(id)?.name ?? id)
    const dropped = startingDraft.equipmentIds.map(id => currentEquipmentId(id, ecosystem)).filter(id => !draft.equipmentIds.includes(id))
    const removed = labels([...new Set([...dropped, ...[...after].filter(id => !before.has(id))])])
    const restored = labels([...before].filter(id => !after.has(id)))
    const slots = items.map(entry => {
      const fitted = gear.get(entry.id)
      const placement = fitted.profileEntries ? 'profile' : draft.equipmentIds.includes(entry.id) ? 'selected' : 'included'
      return { item: { ...entry, sourceName: fitted.sourceName }, placement, timing: fitted.timing }
    })
    const pair = second && plannedEquipmentChoices(items.map(item => gear.get(item.id)), ecosystem, profile, packageActions(ctx))
    const combo = pair && growth.comboPreview(matchHero(candidate.id, candidate.record), pair)
    return { ...slots[0], draft, removed, restored, ...(pair && { combo,
      slots: slots.map((slot, index) => ({ ...slot, trialActions: pair[index].trialActions })) }),
      comparison: await compare({ ...draft, againstDraft }, ecosystem, candidate) }
  }

  async function heroRoundHistory({ heroId, before }) {
    if (typeof heroId !== 'string' || !heroId || heroId.length > 512) throw new Error('找不到这位英雄的实战记录。')
    await growth.settle()
    const page = await growth.heroRounds(heroId, before)
    if (!page.rounds.length) return page
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    const workspaces = workspaceLabels()
    return { ...page, rounds: page.rounds.map(round => ({ ...round, workspace: workspaces.get(round.sessionId) ??
      workspaces.get(round.delegation?.ancestors[0]), gear: flagGear(round.gear, art), followUpGear: flagGear(round.followUpGear, art) })) }
  }

  async function previewFlagLoadout({ id }) {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('找不到这面战旗。')
    await growth.settle()
    const flag = growth.flags().find(item => item.id === id)
    if (!flag || flag.teamwork || flag.pair?.length !== 2) throw new Error('找不到这面战旗的连携装备。')
    const ecosystem = await discover()
    const presetId = flag.hero.id
    const preset = ecosystem.presets.find(item => item.id === presetId)
    if (!preset || preset.broken) throw new Error(preset?.broken ?? '达成战旗的英雄当前不可用。')
    const builtIn = presetEquipment(ecosystem, presetId)
    const profile = await profileGrowthGear(undefined, ecosystem.bundleRows ?? [])
    const pair = flag.pair.map(item => {
      const source = questToolSource(item)
      return { ...item, id: currentEquipmentId(item.id, ecosystem), sourceId: source && currentEquipmentId(source, ecosystem) }
    })
    if (pair[0].id === pair[1].id) throw new Error('两件历史装备现在指向同一件装备，请在装备库重新选择。')

    const options = pair.map(item => historicalEquipmentOption(item, preset, ecosystem, builtIn))
    const equippable = options.filter(option => option.item)
    const candidates = [[], ...equippable.map(option => [option]), ...(equippable.length === 2 ? [equippable] : [])]
    let best
    let conflict
    for (const selected of candidates) {
      const draft = historicalDraft(presetId, selected)
      try {
        const candidate = await plan(draft, ecosystem)
        const capabilities = plannedGear(ecosystem, presetId, candidate, profile)
        const slots = pair.map((item, index) => {
          const current = capabilities.get(item.id)
          const available = Boolean(current && (!item.sourceId || item.sourceId === currentEquipmentId(current.sourceId, ecosystem)))
          return { id: item.id, available, timing: available ? current.timing : undefined,
            placement: available ? current.profileEntries ? 'profile' : draft.equipmentIds.includes(item.id) ? 'selected' : 'included' : undefined,
            sourceUnverified: item.kind === 'tool' && !item.sourceId, currentSource: current?.sourceName,
            ...(available ? {} : { reason: options[index].reason }) }
        })
        const count = slots.filter(slot => slot.available).length
        const removed = historicalRemovals(candidate, builtIn, ecosystem)
        if (!best || count > best.count || count === best.count && removed.length < best.removed.length) {
          best = { draft, slots, count, removed, candidate, capabilities }
        }
      } catch (error) {
        if (!selected.length) throw error
        conflict = error instanceof Error ? error.message : String(error)
      }
    }
    const { candidate, capabilities, ...preview } = best
    if (preview.count < pair.length) return { ...preview, ...(conflict && { conflict }) }
    const hero = matchHero(candidate.id, candidate.record)
    const choices = plannedEquipmentChoices(pair.map(item => capabilities.get(item.id)), ecosystem, profile, packageActions(ctx))
    const combo = growth.comboPreview(hero, choices)
    if (combo.flagId === id) {
      preview.upgrade = { ...combo, modes: combo.modes.filter(mode => mode.id !== 'basic') }
    } else {
      preview.upgradeUnavailable = '当前阵容无法核对原战旗的装备来源。'
    }
    try {
      await growth.recoverFlagPractice(id)
      const practice = growth.flagPractice(id, hero, choices)
      growth.validateQuest({ ...growthQuest(practice, { choices }), hero })
      return { ...preview, practice }
    } catch (error) {
      return { ...preview, practiceUnavailable: error instanceof Error ? error.message : String(error) }
    }
  }

  function workspaceLabels() {
    const workspaces = new Map()
    for (const workspace of ctx.get('workspaceRegistry')?.list() ?? []) {
      for (const id of workspace.sessionIds) {
        workspaces.set(id, workspace.title === 'default-workspace' ? '默认工作区' : workspace.title)
      }
    }
    return workspaces
  }

  async function growthJournal() {
    const { active, completed } = growth.journal()
    if (!active.length && !completed.length) return { active, completed }
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    const workspaces = workspaceLabels()
    const portrait = hero => hero && { ...hero, art: art('hero', hero.id) }
    const itemArt = item => ({ ...item, art: art(item.kind ? 'gear' : 'hero', item.id, item.sourceId) })
    const legArt = leg => leg && { ...leg, hero: portrait(leg.hero) }
    const decorate = entry => ({ ...entry, hero: portrait(entry.hero), workspace: workspaces.get(entry.sessionId),
      gear: entry.gear?.map(itemArt), awards: entry.awards?.map(itemArt),
      relayGear: entry.relayGear && itemArt(entry.relayGear),
      teamwork: teamWorkArt(entry.teamwork, art),
      relay: entry.relay && { starter: portrait(entry.relay.starter), runner: portrait(entry.relay.runner),
        first: legArt(entry.relay.first), second: legArt(entry.relay.second) },
    })
    return { active: active.map(decorate), completed: completed.map(decorate) }
  }

  function profileBundles() {
    return ctx.get('pluginManager')?.listBundles().catch(() => []) ?? Promise.resolve([])
  }

  async function profileGrowthGear(entries = profileGrowthEntries(), bundles = profileBundles()) {
    const plugins = Array.from(entries, ([id, { module, baseUrl, shortcutKey }]) => {
      const meta = equipmentMetadata(ctx, module, baseUrl)
      return { id: 'host:' + id, name: metadata(meta, 'title') ?? moduleLabel(module), kind: 'plugin', profileEntries: [id], shortcutKey }
    })
    return [
      ...plugins,
      ...(await bundles).filter(bundle => bundle.enabled && !bundle.error && bundle.availability !== 'missing').flatMap(bundle => {
        const profileEntries = bundle.rows.flatMap(row => entries.get(row.entryId)?.module === row.moduleName ? [row.entryId] : [])
        if (!profileEntries.length) return []
        const keys = profileEntries.map(id => entries.get(id).shortcutKey)
        const fingerprint = keys.every(Boolean) && jsonFingerprint([bundle.name, bundle.version ?? bundle.meta?.version ?? null, keys.sort()])
        return [{ id: 'bundle:' + bundle.name, name: metadata(bundle.meta, 'title') ?? moduleLabel(bundle.name),
          kind: 'plugin', profileEntries, shortcutKey: fingerprint ? 'profile:' + fingerprint : undefined }]
      }),
    ]
  }

  function actionChoices(targetId, moves, describe = false) {
    return moves.map(move => ({ key: move.proofKey ?? actionKey(targetId, move), name: move.name,
      ...(describe && { detail: move.detail, requiresInput: Boolean(move.requiresInput) }) }))
  }

  function comboFlags(heroId) {
    return growth.flags(heroId).filter(flag => !flag.teamwork).map(flag => ({ id: flag.id, pair: flag.pair.map(item => item.id),
      ...(flag.combinationId && { sources: Object.fromEntries(flag.pair.filter(questToolSource).map(item => [item.id, item.sourceId])) }),
      upgraded: Boolean(flag.comboAction), staged: Boolean(flag.stagedAction) }))
  }

  function teamBoard(active) {
    if (!active) return
    const team = ctx.get('agentTeams')
    const subagents = ctx.get('subagents')
    if (typeof team?.listTasks !== 'function' || typeof subagents?.rootOf !== 'function') return
    const { agent } = active
    try {
      if (subagents.rootOf(agent) !== agent) return
      const board = ctx.get('sessionProjections')?.snapshot?.(agent.session, ['agentTeam'])?.values?.agentTeam
      if (Array.isArray(board?.tasks) && !board.failure) return board
    } catch {
      // The native board may be unavailable while a session or plugin is closing.
    }
  }

  function teamTaskSummary({ id, subject, status, revision }) {
    return { kind: 'team', id, name: subject, status, revision }
  }

  function teamTaskChoices(sessionId, board) {
    if (!board?.enabled) return []
    return board.tasks.filter(task => (task.status === 'pending' || task.status === 'in_progress') &&
      !growth.teamTaskClaimed(sessionId, task.id)).map(task => ({ ...teamTaskSummary(task), blocked: task.status === 'pending' && !task.ready }))
  }

  function dispatchableTeamTask(task) {
    return task.status === 'pending' && task.ready && !task.ownerId
  }

  function teamDispatchOptions(board) {
    if (!board?.enabled) return
    return board.tasks.filter(task => task.status === 'pending' || task.status === 'in_progress').map(task => ({
      ...teamTaskSummary(task), available: dispatchableTeamTask(task),
      reason: task.status === 'in_progress' || task.ownerId ? '已有负责人' : !task.ready ? '等待依赖' : undefined,
    }))
  }

  function latestTeamTask(active, quest, board = teamBoard(active)) {
    if (!board) return
    const { session } = active.agent
    const task = board.tasks.find(item => item.id === quest.teamTask.id)
    const event = session.snapshotEvents(quest.after).findLast(event => event.type === 'team/task' &&
      event.data.version === 2 && event.data.teamId === session.id && event.data.task?.id === quest.teamTask.id)
    if (!event) return
    const recorded = event.data.task
    if (task ? recorded.revision !== task.revision || recorded.status !== task.status : recorded.status !== 'deleted') return
    return { task: teamTaskSummary(recorded), event }
  }

  async function refreshTeamTask(active, board = teamBoard(active)) {
    if (!active || !board) return
    const sessionId = active.agent.session.id
    const quest = growth.teamQuest(sessionId)
    if (!quest || board.tasks.some(item => item.id === quest.teamTask.id && item.revision === quest.teamTask.revision)) return
    const latest = latestTeamTask(active, quest, board)
    if (latest && latest.task.revision > quest.teamTask.revision) {
      await growth.recordTeamTask(sessionId, quest.id, latest.task, latest.event)
    }
  }

  async function verifyTeamDelivery(active, quest) {
    const { session } = active.agent
    if (!await ctx.get('sessions')?.flush(session) || match(session.id)?.agent.session !== session) return false
    const latest = latestTeamTask(active, quest)
    if (latest?.task.status !== 'completed' || latest.task.revision !== quest.teamTask.revision ||
      latest.event.seq !== quest.teamTask.proof.seq) return false
    const ownerId = latest.event.data.task.ownerId
    if (!ownerId || ownerId === session.id) return true
    // A title or description edit can follow completion. Reopening creates a
    // new interval and requires a new completion by the current owner.
    const revisions = session.snapshotEvents(quest.after, latest.event.seq).filter(event => event.type === 'team/task' &&
      event.data.version === 2 && event.data.teamId === session.id && event.data.task?.id === latest.task.id)
    const previous = revisions.findLastIndex(event => event.data.task.status !== 'completed' || event.data.task.ownerId !== ownerId)
    const completion = revisions[previous + 1] ?? latest.event
    const proof = session.snapshotEvents(completion.seq + 1).find(event => event.type === teamworkRecord &&
      event.ignorable === true && event.data.completionSeq === completion.seq && event.data.taskId === latest.task.id &&
      event.data.revision === completion.data.task.revision && event.data.address?.childSessionId === ownerId)
    const worker = proof?.data
    const teamwork = worker?.hero?.id && worker.hero.id !== quest.hero.id ? {
      hero: worker.hero, address: worker.address, taskId: worker.taskId, completionSeq: worker.completionSeq,
    } : undefined
    return { teamwork }
  }

  function currentQuestTask(sessionId, heroId) {
    const task = growth.questTask(sessionId)
    if (task && (task.quest.relay?.runner ?? task.quest.hero).id === heroId) return task
  }

  function questTaskShortcut({ quest, target }) {
    if (!target) return quest.mode === 'trial' ? quest.gear?.shortcut : undefined
    if (target.kind !== 'gear') return
    const tool = quest.gear?.id === target.id ? quest.gear : quest.pair?.find(item => item.id === target.id)
    if (tool?.shortcut && target.key === actionKey(tool.id, equipmentTask(tool))) return tool.shortcut
  }

  function questTaskBindings({ quest, target, support }) {
    if (support) return support.shortcut ? [support.shortcut] : []
    const gear = quest.pair ?? (quest.gear ? [quest.gear] : [])
    return gear.filter(item => !quest.comboAction?.staged || item.id === target?.id).flatMap(item => item.shortcut ? [item.shortcut] : [])
  }

  function shortcutToolState(active, pin, transport = executorTools(ctx, active.scope)) {
    const state = shortcuts.toolAvailability(active.scope, transport)(pin)
    if (state !== 'ready' && state !== 'waiting') return state
    const expected = equippedToolBindings(active.record).find(tool => tool.name === pin.name)
    if (!expected) return state
    if (expected.id !== pin.id) return 'conflict'
    const boundState = boundToolState(ctx, active.scope, active.runtime.scopeParentOf(active.scope), active.record, expected)
    return state === boundState ? state : boundState === 'missing' ? 'missing' : 'conflict'
  }

  function shortcutToolAvailable(active, pin, transport) {
    const state = shortcutToolState(active, pin, transport)
    return state === 'ready' || state === 'waiting'
  }

  function questContinuationOffer(active, transport) {
    return growth.continuationOffer(questContext(active), task => {
      const { quest, target, support } = task
      const gear = quest.pair ?? (quest.gear ? [quest.gear] : [])
      const toolStates = Object.fromEntries(gear.filter(item => item.shortcut)
        .map(item => [item.id, shortcutToolState(active, item.shortcut, transport)]))
      const shortcutActionReady = target && questTaskShortcut(task) && questTaskBindings(task)
        .every(pin => toolStates[pin.id] === 'ready' || toolStates[pin.id] === 'waiting')
      return {
        ...(Object.keys(toolStates).length && { toolStates }),
        ...(quest.comboAction?.staged && { stepGearId: target?.id ?? support?.id }),
        shortcutActionReady,
      }
    })
  }

  function requireQuestBindings(active, task) {
    const bindings = questTaskBindings(task)
    if (bindings.some(pin => !shortcutToolAvailable(active, pin))) throw new Error('委托所选工具来源当前不可用。')
    return bindings
  }

  function questTaskSummary(sessionId, heroId, active) {
    const task = currentQuestTask(sessionId, heroId)
    if (task) {
      const { id, title, mode, brief } = task.quest
      const shortcut = questTaskShortcut(task)
      const bindings = questTaskBindings(task)
      const sourcesReady = bindings.length ? bindings.every(pin => shortcutToolAvailable(active, pin)) : undefined
      return { id, title, mode, input: task.quest.comboFirst ? title : brief ?? title, target: task.target,
        sourcesReady, ...(shortcut && { shortcut: { name: shortcut.name, sourceName: shortcut.sourceName, ready: sourcesReady } }),
        ...(task.support && { support: task.support.name }),
        ...(task.quest.comboAction?.prepare && !task.quest.comboFirst && { preparing: true }) }
    }
  }

  async function growthChoices(sessionId, active) {
    const bundles = profileBundles()
    const profile = profileGrowthGear(undefined, bundles)
    const nativeTrials = new Map()
    const snapshot = await sessionEquipment(sessionId, bundles, profile, nativeTrials)
    const gear = new Map(growthLoadout(active).map(item => [item.id, item]))
    const tools = new Map((snapshot.tools ?? []).map(tool => [tool.id, tool]))
    for (const pin of snapshot.pinned ?? []) {
      if (pin.kind === 'tool' && pin.deferred && pin.artSourceId && (pin.state === 'ready' || pin.state === 'waiting')) tools.set(pin.id, pin)
    }
    for (const tool of tools.values()) {
      if (tool.state === 'ready' || tool.state === 'waiting') {
        const item = { id: tool.id, name: tool.name, kind: 'tool',
          sourceId: tool.artSourceId, sourceName: tool.sourceName,
          ...(tool.conditional && tool.activation !== 'enabled' ? { timing: 'condition' }
            : tool.deferred || tool.state === 'waiting' ? { timing: 'turn' } : {}), ...(tool.transport && { transport: true }) }
        if (tool.pinned && tool.deferred) {
          item.shortcut = { id: tool.id, name: tool.name, key: tool.shortcutKey, sourceId: item.sourceId,
            sourceName: tool.sourceName, deferred: true, ...(tool.transport && { transport: true }) }
          item.trialActions = actionChoices(item.id, [equipmentTask(item)])
        }
        gear.set(item.id, item)
      }
    }
    for (const item of await profile) gear.set(item.id, item)
    let heroActions = []
    for (const skill of snapshot.skills ?? []) {
      if (skill.kind === 'hero' && skill.ready) heroActions = actionChoices(skill.id, skill.actions)
      const item = skill.kind === 'gear' && skill.ready && gear.get(skill.id)
      if (item) item.trialActions = actionChoices(skill.id, skill.actions)
    }
    for (const [id, trials] of nativeTrials) {
      const item = gear.get(id)
      if (item) item.trialActions = [...(item.trialActions ?? []), ...trials]
    }
    return { choices: [...gear.values()], heroActions }
  }

  async function matchGrowth({ sessionId, includeChoices }) {
    const active = requireMatch(sessionId)
    const hero = matchHero(active.presetId, active.record)
    const { choices, heroActions } = includeChoices === true ? await growthChoices(sessionId, active) : {}
    const uploaded = await appearance.index()
    const art = await matchHistoryArt(uploaded, active, { useCurrentTool: true })
    const board = teamBoard(active)
    await refreshTeamTask(active, board)
    const value = growth.read(sessionId, hero.id)
    const relay = value.quest?.relay
    const offer = questContinuationOffer(active)
    return { ...value, hero: { ...hero, ...value.hero, art: art('hero', hero.id), flag: displayFlagFor(hero.id, art) },
      gear: flagGear(value.gear, art),
      quest: value.quest && { ...value.quest, gear: value.quest.gear && flagGear([value.quest.gear], art)[0],
        pair: value.quest.pair && flagGear(value.quest.pair, art),
        relay: relay && { ...relay, first: relayLegArtwork(relay.first, art), second: relayLegArtwork(relay.second, art) } },
      relayOffer: offer?.mode === 'relay' ? { ...offer, gear: offer.gear && flagGear(offer.gear, art) } : undefined,
      questOffer: offer && offer.mode !== 'relay' ? { ...offer, gear: flagGear(offer.gear, art) } : undefined,
      task: questTaskSummary(sessionId, hero.id, active),
      teamMode: board?.enabled,
      teamAvailable: value.quest?.teamTask ? Boolean(board) : undefined,
      teamTasks: teamTaskChoices(sessionId, board),
      flags: comboFlags(hero.id),
      stagedLevel: growth.stagedLevel, relayGearLevel: growth.relayGearLevel,
      heroActions,
      choices: choices?.map(({ profileEntries, shortcut, ...item }) => ({ ...item, level: growth.gearRank(item.id).level,
        profile: Boolean(profileEntries) })) }
  }

  async function previewQuestCombo({ sessionId, draft, gearIds, questSources, practiceFlagId, upgradeFlagId }) {
    if (!Array.isArray(gearIds) || gearIds.length !== 2 || new Set(gearIds).size !== 2 ||
      gearIds.some(id => typeof id !== 'string' || !id || id.length > 512) ||
      (sessionId === undefined) === (draft === undefined)) {
      throw new Error('请在当前阵容中选择两件不同的装备。')
    }
    let hero, choices
    if (sessionId !== undefined) {
      const active = requireMatch(sessionId)
      hero = matchHero(active.presetId, active.record)
      choices = (await growthChoices(sessionId, active)).choices
    } else {
      const planned = await plannedGrowth(draft)
      hero = planned.hero
      choices = planned.choices
    }
    const pair = gearIds.map(id => choices.find(item => item.id === id))
    if (pair.some(item => !item)) throw new Error('所选装备当前不可用，请重新核对阵容。')
    const currentSources = Object.fromEntries(pair.filter(questToolSource).map(item => [item.id, item.sourceId]))
    if (!questSources || typeof questSources !== 'object' || Array.isArray(questSources) ||
      Object.keys(questSources).length !== Object.keys(currentSources).length ||
      Object.entries(questSources).some(([id, source]) => !Object.hasOwn(currentSources, id) || currentSources[id] !== source)) {
      throw new Error('所选工具来源已变化，请重新核对阵容。')
    }
    await growth.settle()
    const practice = practiceFlagId === undefined ? undefined : growth.flagPractice(practiceFlagId, hero, pair)
    const preview = growth.comboPreview(hero, pair, practice)
    if (upgradeFlagId === undefined) return preview
    if (practice || preview.flagId !== upgradeFlagId) throw new Error('原战旗的英雄或装备来源已变化，请重新核对。')
    return { ...preview, modes: preview.modes.filter(mode => mode.id !== 'basic') }
  }

  async function matchSettlements({ sessionId, before, action }) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 512) throw new Error('找不到这场对局的结算。')
    await growth.settle()
    const page = action === 'match-settlements-page'
    const { receipts, before: older } = await growth.settlements(sessionId, page ? before : undefined)
    if (!receipts.length) return page ? { receipts } : receipts
    const uploaded = await appearance.index()
    const active = match(sessionId)
    const portable = new Set(active && activeAgentUnits(ctx, active.scope)
      .filter(unit => unit.sessionRecipe && !unit.persona).map(unit => unit.id))
    const art = await matchHistoryArt(uploaded, active)
    function collectionFor(award, receiptSessionId) {
      const id = award.kind === 'tool' ? award.sourceId : award.id
      if (collection.has(id)) return { id, saved: true }
      if (receiptSessionId === sessionId && portable.has(id)) return { id, sessionId }
      const recorded = award.kind === 'tool' ? discoveries.sourcesOf(award.id)?.get(id) : discoveries.snapshotOf(id)
      if (recorded?.snapshot) return { id, sessionId: recorded.sessionId, toolId: recorded.toolId ?? award.id }
    }
    const items = receipts.map(receipt => ({ ...receipt, teammate: receipt.sessionId !== sessionId,
      ...(receipt.signatures?.length && { signatures: receipt.signatures.map(item => {
        const shown = growth.signatureFor(item.hero.id)
        return { ...item, art: art('gear', item.id, item.sourceId, item.kind === 'tool' ? item.name : undefined),
          displayed: shown?.id === item.id && shown?.sourceId === item.sourceId }
      }) }),
      relay: receipt.relay?.map(leg => relayLegArtwork(leg, art)),
      relayGear: receipt.relayGear && flagGear([receipt.relayGear], art)[0],
      pair: receipt.pair && flagGear(receipt.pair, art),
      teamwork: teamWorkArt(receipt.teamwork, art),
      followUpGear: flagGear(receipt.followUpGear, art),
      awards: receipt.awards.map(award => ({ ...award,
        art: art(award.kind ? 'gear' : 'hero', award.id, award.sourceId, award.kind === 'tool' ? award.name : undefined),
        collection: award.kind && collectionFor(award, receipt.sessionId),
        ...(award.kind === 'tool' && discoveries.usageOf(award.id) && { discovered: true }),
      })) }))
    return page ? { receipts: items, before: older } : items
  }

  async function matchFollowUp({ sessionId, receiptId, gearIds, action, combo }) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 512) throw new Error('找不到这场对局的结算。')
    await growth.settle()
    const followUp = await growth.followUp(sessionId, receiptId, gearIds)
    const active = followUp.activity ? requireMatch(sessionId) : match(sessionId)
    const preview = action === 'match-follow-up-preview'
    if (preview || combo !== undefined) {
      if (followUp.quest.mode !== 'combo') throw new Error('请选择本回合参与过的两件装备。')
      if (!active) {
        if (preview) return { reason: '原对局未打开，可回城核对装备与连携。' }
        throw new Error('原对局已关闭，请回城重新核对连携。')
      }
      const { choices } = await growthChoices(sessionId, active)
      const pair = followUp.gear.map(item => choices.find(current => current.id === item.id && matchesDraftGear(current, item)))
      if (pair.some(item => !item)) {
        if (preview) return { reason: '本回合的装备来源暂不可用，可回城核对原来源。' }
        throw new Error('所选装备来源已变化，请重新核对。')
      }
      const hero = matchHero(active.presetId, active.record)
      if (hero.id !== followUp.heroId) throw new Error('原对局的英雄已变化，请重新核对。')
      await growth.settle()
      if (preview) {
        return { combo: growth.comboPreview(hero, pair), gear: pair.map(({ id, trialActions }) => ({ id, trialActions })) }
      }
      if (!combo || !['basic', 'action', 'staged'].includes(combo.mode) ||
        (combo.mode === 'basic' ? combo.actionKey !== undefined : typeof combo.actionKey !== 'string')) {
        throw new Error('请选择有效的连携方式和操作。')
      }
      const questSources = Object.fromEntries(pair.filter(questToolSource).map(item => [item.id, item.sourceId]))
      const quest = { mode: 'combo', gearIds, questSources, comboActionKey: combo.actionKey,
        ...(combo.mode === 'staged' && { staged: true }), prepareActionKey: combo.prepareKey }
      growth.validateQuest({ ...growthQuest({ ...quest, title: '连携' }, { choices }), hero })
      followUp.quest = quest
    }
    if (followUp.activity) {
      const hero = matchHero(active.presetId, active.record)
      if (growth.read(sessionId, hero.id).quest) throw new Error('本局已有委托。完成或放弃后，即可筹备试炼。')
      const choices = await growthChoices(sessionId, active)
      growth.validateQuest(growthQuest({ ...followUp.quest, title: followUp.activity.name.slice(0, 80) }, choices))
    }
    const [uploaded, ecosystem] = await Promise.all([appearance.index(), active ? undefined : discover()])
    const art = active ? await matchHistoryArt(uploaded, active) : packageArt(uploaded, ecosystem)
    return { ...followUp, id: receiptId, gear: flagGear(followUp.gear, art) }
  }

  async function provenDeliverables({ sessionId, windows }, signal) {
    const query = ctx.get('sessionQuery')
    if (!windows.length || !query) return []
    let source
    try {
      source = await query.observeSession(sessionId, { projectionMode: 'none', signal })
      const files = new Map()
      const ends = new Map(windows.map(({ endSeq, turn }) => [endSeq, turn]))
      let turn
      let pending = new Map()
      for (const event of source.events.slice(source.inheritedEventCount)) {
        if (event.type === 'turn/start') {
          turn = event.data.turn
          pending = new Map()
        } else if (event.type === 'deliverables/presented' && turn !== undefined && event.data.turn === turn) {
          noteDeliveredFiles(pending, event.data)
        } else if (event.type === 'turn/end') {
          if (turn !== undefined && ends.get(event.seq) === turn && event.data.turn === turn && event.data.reason?.kind === 'completed') {
            for (const [path, file] of pending) files.set(path, file)
          }
          turn = undefined
        }
      }
      return [...files.values()]
    } catch {
      signal?.throwIfAborted()
      return []
    } finally {
      source?.[Symbol.dispose]()
    }
  }

  async function previewProvenLoadout({ sessionId, receiptId, gearIds }, signal) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 512) {
      throw new Error('找不到这场对局的结算。')
    }
    await growth.settle()
    const proof = await growth.provenLoadout(sessionId, receiptId)
    if (!proof) throw new Error('这条记录没有可核对的本局出装。')
    const proved = new Set(proof.gear.map(item => item.id))
    const picked = gearIds === undefined ? proved : new Set(Array.isArray(gearIds) ? gearIds : [])
    if (gearIds !== undefined && (!Array.isArray(gearIds) || !gearIds.length || picked.size !== gearIds.length ||
      gearIds.some(id => typeof id !== 'string' || !proved.has(id)))) {
      throw new Error('请选择这条记录中已验证的装备。')
    }
    const [ecosystem, uploaded, deliverables] = await Promise.all([
      discover(), appearance.index(), provenDeliverables(proof, signal),
    ])
    const art = packageArt(uploaded, ecosystem)
    const { hero, id, title, turn, kind } = proof
    const heroId = hero.id
    const preset = ecosystem.presets.find(item => item.id === heroId)
    const heroName = preset?.name ?? hero.name ?? presetLabels.get(heroId)?.[0] ?? heroId
    const result = { id, sessionId, title, turn, kind, deliverables, hero: { id: heroId, name: heroName, art: art('hero', heroId) } }
    const builtIn = presetEquipment(ecosystem, heroId)
    const bounded = proof.gear.map(({ sources: observed, ...recorded }) => {
      const currentId = currentEquipmentId(recorded.id, ecosystem)
      const bindings = new Map((observed ?? []).map(source => [currentEquipmentId(source.sourceId, ecosystem), source.sourceName]))
      const sourceId = recorded.kind === 'tool' && bindings.size === 1 ? bindings.keys().next().value : undefined
      const sourceName = bindings.get(sourceId) ?? recorded.sourceName
      const item = { ...recorded, id: currentId, sourceId, sourceName }
      const profilePlugin = /^(?:host|bundle):/.test(currentId)
      const selectByDefault = !(profilePlugin && recorded.evidence === 'provider')
      const row = { ...recorded, sourceId, sourceName, selected: picked.has(recorded.id) && (gearIds !== undefined || selectByDefault),
        art: art('gear', currentId, sourceId, recorded.kind === 'tool' ? recorded.name : undefined) }
      let reason
      if (recorded.kind === 'tool' && bindings.size !== 1) {
        reason = bindings.size > 1 ? '该回合使用了同名工具的多个来源，请在装备库选择。' : '实战记录缺少能核对的工具来源。'
      } else if (profilePlugin) {
        reason = '这项记录依赖当前 Profile 插件，请在插件管理中核对。'
      } else if (!preset || preset.broken) reason = '实战记录中的英雄当前不可用。'
      return { row, item, reason }
    })
    if (!preset || preset.broken) {
      return { ...result, gear: bounded.map(({ row, reason }) => ({ ...row, available: false, reason })),
        reason: '实战记录中的英雄当前不可用。' }
    }
    const baseline = historicalDraft(heroId, [])
    let initial
    try {
      initial = await plan(baseline, ecosystem)
    } catch (error) {
      const reason = error instanceof Error ? error.message : '实战记录中的英雄当前不可用。'
      return { ...result, reason, gear: bounded.map(({ row, reason: gearReason }) =>
        ({ ...row, available: false, reason: gearReason ?? reason })) }
    }
    const profile = await profileGrowthGear(undefined, ecosystem.bundleRows ?? [])
    const ready = plannedGear(ecosystem, heroId, initial, profile)
    for (const entry of bounded) {
      if (entry.reason) continue
      const { item } = entry
      if (matchesDraftGear(ready.get(item.id), item)) continue
      const option = historicalEquipmentOption(item, preset, ecosystem, builtIn)
      if (!option.item) entry.reason = option.reason ?? '本回合的装备或来源当前不可装配。'
    }
    const gear = bounded.map(({ row, item, reason }) => ({ ...row, available: !reason, reason,
      currentSource: ready.get(item.id)?.sourceName }))
    const selected = bounded.filter(entry => entry.row.selected)
    if (!selected.length || selected.some(entry => entry.reason)) {
      return { ...result, gear, reason: '请选择仍能核对来源的装备。' }
    }
    const items = selected.map(entry => entry.item)
    if (new Set(items.map(item => item.id)).size !== items.length) {
      return { ...result, gear, reason: '这些记录现在指向同一件装备，请只保留一个。' }
    }
    signal?.throwIfAborted()
    const fit = order => fitDraftEquipment(baseline, order, ecosystem, profile, initial, { pinProfileTools: true })
    let fitted = await fit(items)
    if (!fitted.draft && items.length > 1) fitted = await fit([...items].reverse())
    if (!fitted.draft) return { ...result, gear, reason: fitted.unavailable ?? '所选装备无法同时复用。' }
    const { draft, candidate } = fitted
    return { ...result, gear, draft, removed: historicalRemovals(candidate, builtIn, ecosystem),
      comparison: await compare(draft, ecosystem, candidate) }
  }

  function growthQuest({ title, mode, gearId, gearIds, trialActionKey: selectedKey, heroActionKey, comboActionKey, staged, prepareActionKey,
    teamTaskId, brief, questSources, practiceFlagId, upgradeFlagId }, { choices = [], heroActions = [], teamTasks = [] }) {
    const taskBrief = brief === undefined ? undefined : actionInput(brief) || undefined
    const relayGear = mode === 'relay' && gearId !== undefined
    const pick = mode === 'trial' || relayGear ? choices.find(item => item.id === gearId) : undefined
    if (relayGear && !pick) throw new Error('请选择当前阵容里的接力装备。')
    const trialAction = mode === 'trial' ? pick?.trialActions?.find(item => item.key === selectedKey) : undefined
    if (selectedKey !== undefined && !trialAction) throw new Error('指定操作当前不可用，请重新选择试炼操作。')
    const heroAction = mode === 'delivery' && heroActions.find(item => item.key === heroActionKey)
    if (heroActionKey !== undefined && !heroAction) throw new Error('指定英雄操作当前不可用，请重新选择交付方式。')
    const teamTask = teamTaskId !== undefined && mode === 'delivery' && heroActionKey === undefined
      ? teamTasks.find(item => item.id === teamTaskId) : undefined
    if (teamTaskId !== undefined && !teamTask) throw new Error('请选择本局尚未完成且未领取奖励的队伍任务。')
    const pair = mode === 'combo' && Array.isArray(gearIds) && gearIds.length === 2
      ? gearIds.map(id => choices.find(item => item.id === id)) : undefined
    if (questSources !== undefined) {
      const selected = new Map([pick, ...(pair ?? [])].filter(questToolSource).map(item => [item.id, item.sourceId]))
      if (!questSources || typeof questSources !== 'object' || Array.isArray(questSources) ||
        Object.entries(questSources).some(([id, source]) => source !== selected.get(id))) {
        throw new Error('委托的工具来源已变化，请核对当前装备后重新选择。')
      }
    }
    let comboAction
    if (comboActionKey !== undefined) {
      for (const item of pair ?? []) {
        if (!item) continue
        const move = item.trialActions?.find(move => (staged === true || !move.kind) && move.key === comboActionKey)
        if (move) comboAction = { ...move, gearId: item.id }
      }
      if (!comboAction) throw new Error('请为参与连携的装备选择有效的发动操作。')
    }
    const support = comboAction && pair.find(item => item && item.id !== comboAction.gearId)
    if (staged !== undefined) {
      if (staged !== true || !support) throw new Error('分阶段连携需要两件不同的装备和一项发动操作。')
      const prepare = support.trialActions?.find(move => move.key === prepareActionKey)
      if (!prepare && (prepareActionKey !== undefined || support.kind !== 'tool')) throw new Error('请选择辅助装备当前可用的准备操作。')
      if (prepare?.operation && prepare.operation === comboAction.operation) {
        throw new Error('请选择不同的准备和发动操作。同一插件的同一操作只计入一个阶段。')
      }
      comboAction.staged = true
      if (prepare) comboAction.prepare = { ...prepare, gearId: support.id }
    } else if (prepareActionKey !== undefined || (comboAction && support?.kind !== 'tool')) {
      throw new Error('同回合的指定操作需要另一件工具作为辅助。')
    }
    const stripActions = item => {
      if (!item) return
      const { trialActions: _trialActions, shortcutKey: _shortcutKey, ...gear } = item
      return gear
    }
    return { title, mode, gear: stripActions(pick), trialAction, heroAction: heroAction || undefined,
      pair: pair?.map(stripActions), comboAction, teamTask, practiceFlagId, upgradeFlagId,
      brief: teamTask || trialAction?.kind || comboAction?.prepare?.kind ? undefined : taskBrief }
  }

  async function acceptGrowthQuest({ sessionId, ...selection }, openingPreset, allowBasicReplay) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const active = requireMatch(sessionId)
    if (openingPreset && active.presetId !== openingPreset) throw new Error('新对局的阵容已变化。')
    const { mode } = selection
    const choices = mode === 'trial' || mode === 'combo' || (mode === 'relay' && selection.gearId !== undefined) || selection.heroActionKey !== undefined
      ? await growthChoices(sessionId, active) : {}
    if (openingPreset) {
      const source = await ctx.get('sessionQuery').observeSession(sessionId, { projectionMode: 'none' })
      try {
        if (source.events.some(event => event.type === 'turn/start' || event.type === 'user/message')) {
          throw new Error('这场对局已经开始，请在「成长与委托」里接下委托。')
        }
      } finally {
        source[Symbol.dispose]()
      }
    }
    const current = requireMatch(sessionId)
    if (closed || current.agent !== active.agent || current.presetId !== active.presetId) throw new Error('当前英雄已变化，请刷新后重试。')
    const teamTasks = !openingPreset && selection.teamTaskId !== undefined ? teamTaskChoices(sessionId, teamBoard(current)) : undefined
    const quest = growthQuest(selection, { ...choices, teamTasks })
    return growth.accept(sessionId, { ...quest, hero: matchHero(current.presetId, current.record), after: current.agent.session.seq,
      opening: Boolean(openingPreset), allowBasicReplay })
  }

  function plannedGear(ecosystem, presetId, { record, units, removed }, profile) {
    const cards = summarizeCapabilities(ecosystem, presetId, { record, units, removed, questGear: true })
    for (const [id, item] of cards) {
      if (item.kind === 'tool' && item.timing === 'turn' && !record?.equipmentIds.includes(id)) cards.delete(id)
    }
    for (const item of profile) cards.set(item.id, item)
    return cards
  }

  function plannedEquipmentChoices(cards, ecosystem, profile, reader, describe) {
    const nativeTrials = new Map()
    profilePanelActivities(profile, nativeTrials)
    equipmentCompactionActivities(profile, nativeTrials)
    return Array.from(cards, item => {
      const published = item.kind === 'tool' ? sourceToolActions(reader, ecosystem, item, item.sourceId)
        : catalogActions(reader, ecosystem.equipment.get(item.id))
      const task = equipmentTask(item)
      const trialActions = actionChoices(item.id, [...equipmentActions(item.id), ...actions.read('gear', item.id).actions,
        ...published, ...(task ? [task] : [])], describe).concat(nativeTrials.get(item.id) ?? [])
      return { ...item, trialActions }
    })
  }

  async function plannedGrowth(draft, { describe = false, ecosystem } = {}) {
    ecosystem ??= await discover()
    const candidate = await plan(draft, ecosystem)
    const hero = matchHero(candidate.id, candidate.record)
    const profile = await profileGrowthGear().catch(() => [])
    const cards = plannedGear(ecosystem, draft.presetId, candidate, profile)
    const reader = packageActions(ctx)
    const heroActions = actionChoices(hero.id, [...builtInHeroActions(hero.id), ...actions.read('hero', hero.id).actions,
      ...reader.hero(hero.id, ecosystem.compositions.get(hero.id))], describe)
    return { candidate, hero, choices: plannedEquipmentChoices(cards.values(), ecosystem, profile, reader, describe), heroActions, ecosystem, profile }
  }

  async function openingChoices(draft, restoreGear = [], describe = false) {
    const ids = Array.isArray(restoreGear) ? restoreGear.map(item => item?.id) : undefined
    const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 512
    if (!ids || ids.length > 2 || !ids.every(validId) || new Set(ids).size !== ids.length ||
      restoreGear.some(({ sourceId }) => sourceId !== undefined && !validId(sourceId))) throw new Error('回合装备选择无效。')
    const [{ candidate, hero, choices, heroActions, ecosystem, profile }, uploaded] =
      await Promise.all([plannedGrowth(draft, { describe }), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    const repairs = await Promise.all(restoreGear.map(async ({ id, sourceId }) => {
      const kind = ecosystem.equipment.get(id)?.kind ?? (id.startsWith('tool:') ? 'tool' : id.startsWith('plugin:') ? 'plugin' : 'featured')
      const item = { id, sourceId, kind }
      if (matchesDraftGear(choices.find(choice => choice.id === id), item)) return { id }
      return { id, ...await recoverDraftGear(draft, item, ecosystem, profile, candidate) }
    }))
    return { hero: { ...hero, level: growth.heroRank(hero.id).level }, rewards: growth.rewards, flags: comboFlags(hero.id), heroActions,
      stagedLevel: growth.stagedLevel, relayGearLevel: growth.relayGearLevel, ...(repairs.length && { repairs }),
      choices: choices.map(({ id, name, kind, timing, sourceId, sourceName, transport, profileEntries, trialActions }) =>
        ({ id, name, kind, timing, sourceId, sourceName, transport, profile: Boolean(profileEntries),
          art: art('gear', id, sourceId, kind === 'tool' ? name : undefined), trialActions,
          level: growth.gearRank(id).level })) }
  }

  async function startWithQuest({ draft, quest, workspaceId, launchId }, signal, { allowBasicReplay } = {}) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const workspace = typeof workspaceId === 'string' && ctx.get('workspaceRegistry')?.get(workspaceId)
    const controller = ctx.get('sessionController')
    if (!workspace || !controller?.create) throw new Error('所选工作区不可用，请重新选择。')
    if (!validOpeningId(launchId)) {
      throw new Error('开局请求无效，请重试。')
    }
    const planned = await plannedGrowth(draft)
    const { candidate, hero } = planned
    const selection = growthQuest(quest ?? {}, planned)
    const action = selection.trialAction ?? selection.heroAction ?? selection.comboAction
    const key = [launchId, workspaceId, candidate.id, selection.title, selection.mode, selection.gear?.id,
      selection.pair?.map(item => item?.id), ...(action ? [action.key] : []), ...(selection.comboAction?.staged ? ['staged'] : []),
      ...(selection.comboAction?.prepare ? [{ prepare: selection.comboAction.prepare.key }] : []),
      ...(selection.practiceFlagId ? [{ practice: selection.practiceFlagId }] : []),
      ...(selection.upgradeFlagId ? [{ upgrade: selection.upgradeFlagId }] : []),
      ...(selection.brief ? [{ brief: selection.brief }] : [])]
    const sessionId = 'session-' + createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 32)
    if (openingMatches.has(sessionId)) return openingMatches.get(sessionId)
    if (workspace.sessionIds.includes(sessionId) && growth.openedWithQuest(sessionId)) return { sessionId }
    growth.validateQuest({ ...selection, hero, allowBasicReplay })

    const launch = async () => {
      const { presetId, verifyLive: check } = await prepare(draft, candidate)
      signal?.throwIfAborted()
      if (closed) throw new Error('配装服务正在关闭，请重试。')
      if (!workspace.sessionIds.includes(sessionId)) {
        const created = await controller.create({ sessionId, workspaceId, agentPreset: presetId })
        if (created.sessionId !== sessionId) throw new Error('新对局的会话标识已变化，请重新开局。')
      }
      try {
        if (!match(sessionId)) {
          const result = await controller.resolveAgent(sessionId)
          if (!result.agent) throw new Error(result.error?.message ?? '无法打开新对局。')
        }
        if (check) verifyLive({ presetId, sessionId })
        if (!growth.openedWithQuest(sessionId)) await acceptGrowthQuest({ ...quest, sessionId }, presetId, allowBasicReplay)
        return { sessionId }
      } catch (error) {
        return { sessionId, questError: error instanceof Error ? error.message : '新对局未能接下委托。' }
      }
    }
    const work = launch().finally(() => openingMatches.delete(sessionId))
    openingMatches.set(sessionId, work)
    return work
  }

  function standardDeliveryDraft(ecosystem, equipmentIds) {
    const presetId = 'standard'
    const builtIns = presetEquipment(ecosystem, presetId)
    const removedEquipmentIds = Object.keys(builtIns).filter(id => builtIns[id].tools.includes('present'))
    return { presetId, equipmentIds, equipmentSources: {}, removedEquipmentIds }
  }

  function deliveryPlaybookDraft(ecosystem, id) {
    return standardDeliveryDraft(ecosystem, id === 'review' ? ['present', 'review'] : ['present'])
  }

  async function previewFieldPlaybook({ id, againstDraft, sourceSessionId }) {
    if (id !== 'direct' && id !== 'review') throw new Error('请选择大厅里的实战打法。')
    const ecosystem = await discover()
    const draft = deliveryPlaybookDraft(ecosystem, id)
    return { draft, comparison: await compare({ ...draft, againstDraft, sourceSessionId }, ecosystem) }
  }

  async function startLighthouse({ route, launchId }, english, signal) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    if (!validOpeningId(launchId) || !['recon', 'delivery'].includes(route)) throw new Error('开局请求无效，请重试。')
    const registry = ctx.get('workspaceRegistry')
    if (!registry?.create || !ctx.get('sessionController')?.create) throw new Error('灯塔练习工作区不可用。')
    const ecosystem = await discover()
    const delivery = route === 'delivery'
    const draft = standardDeliveryDraft(ecosystem, delivery ? ['present'] : [])
    const planned = await plannedGrowth(draft, { ecosystem })
    const glob = planned.choices.find(item => item.name === 'glob' && questToolSource(item) && !item.timing)
    if (!glob) throw new Error('标准模式的 glob 工具不可用，请检查 DSH 的预设配置。')
    if (planned.choices.some(item => item.name === 'present' && item.kind === 'tool') !== delivery) {
      throw new Error('灯塔行动无法切换交付物预览，请检查 DSH 的预设配置。')
    }
    const task = lighthouseTask(route, english)
    const quest = { ...task, title: english ? englishText(task.title) : task.title, questSources: { [glob.id]: glob.sourceId },
      ...(delivery ? { mode: 'combo', gearIds: [glob.id, 'present'] } : { mode: 'trial', gearId: glob.id }) }
    growth.validateQuest({ ...growthQuest(quest, planned), hero: planned.hero, allowBasicReplay: delivery })
    signal?.throwIfAborted()
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const workspace = await lighthouseWorkspace(directory, registry)
    return startWithQuest({ draft, quest, workspaceId: workspace.id, launchId }, signal, { allowBasicReplay: delivery })
  }

  function requestedPlanComparison(selection, english) {
    const { workspaceId, evidenceRetest } = selection
    if (evidenceRetest !== undefined && typeof evidenceRetest !== 'boolean') throw new Error('请选择同一次证据换装两侧保存的方案。')
    const validRef = value => typeof value === 'string' && value.length > 0 && value.length <= 512
    const plans = Object.fromEntries(planComparisonArms.map(arm => {
      const { id, revision } = selection.plans?.[arm] ?? {}
      if (!validRef(id) || !validRef(revision)) throw new Error('请选择两份不同的出装方案。')
      return [arm, { id, revision }]
    }))
    if (plans.left.id === plans.right.id) throw new Error('请选择两份不同的出装方案。')
    if (!validRef(workspaceId)) throw new Error('请选择一个现有的工作区。')
    const { material, task } = planTaskPrompt(selection, english)
    const input = { plans, workspaceId, material, brief: selection.task.trim(),
      task: task + (english ? '\nKeep the original material unchanged.' : '\n保留原始材料，不要修改。'),
      ...(evidenceRetest && { evidenceRetest }) }
    const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return { ...input, inputHash }
  }

  function planComparisonLabels(record, arm) {
    const plan = record.plans?.[arm]
    return plan ? { planName: plan.planName, heroName: plan.heroName } : {}
  }

  function comparisonLoadoutIdentity(draft, candidate, ecosystem, identity = loadoutIdentity(draft, candidate, ecosystem),
    capabilities = summarizeCapabilities(ecosystem, candidate.inventoryPresetId ?? draft.presetId, candidate)) {
    const sources = [...capabilities.keys()].sort().map(id => {
      const { sourceId, timing } = capabilities.get(id)
      return [id, sourceId ?? null, timing ?? null]
    })
    return jsonFingerprint([identity, sources, candidate.record?.realms ?? []])
  }

  async function verifiedPlanComparisonArm(saved, ecosystem) {
    const { draft, candidate, identity } = await verifySavedPlan(saved, ecosystem)
    return { draft, candidate, identity: comparisonLoadoutIdentity(draft, candidate, ecosystem, identity) }
  }

  function matchesLessonIdentity(pinned, identity, draft, candidate, ecosystem) {
    if (pinned === identity) return true
    if (draft.presetId !== 'standard') return false
    // Some 0.2.1 hosts first discover the built-in subagent tool after a plain Standard session opens.
    // Compare the original configuration and every other capability against the historical hash.
    const delegation = ecosystem.unitsByPreset.get(draft.presetId)?.find(unit => unit.row.id === 'delegation' &&
      unit.modules.includes('@deepseek-ai/dsh-tool-subagent'))
    if (!delegation) return false
    const capabilities = summarizeCapabilities(ecosystem, draft.presetId, candidate)
    const standing = ecosystem.standingByPreset.get(draft.presetId)
    const bindings = equippedToolBindings(candidate.record)
    const observed = [...capabilities.values()].filter(item => item.kind === 'tool' && item.name === 'subagent' &&
      item.timing === 'startup' && item.sourceId === delegation.id && !standing?.has(item.id) &&
      !bindings.some(binding => binding.id === item.id))
    if (observed.length !== 1) return false
    capabilities.delete(observed[0].id)
    return pinned === comparisonLoadoutIdentity(draft, candidate, ecosystem, undefined, capabilities)
  }

  async function checkPlanComparison(input, signal) {
    const { workspaceId, material, task, brief, inputHash, evidenceRetest } = input
    const source = evidenceRetest && requireEvidenceRetest(input.plans)
    const { workspace, digest } = await (evidenceRetest ? readPersonalTaskMaterial : readWorkspaceMaterial)(workspaceId, material, signal)
    const ecosystem = await discover()
    const checked = await Promise.all(planComparisonArms.map(async id => {
      const view = { id, status: 'unopened' }
      const ref = input.plans[id]
      try {
        const saved = buildPlans.read(ref.id, ref.revision)
        view.planName = saved.name
        view.heroName = saved.heroName
        const { identity, draft, candidate } = await verifiedPlanComparisonArm(saved, ecosystem)
        if (!identity) throw new Error('无法核对当前出装的配置。')
        if (source) {
          const historical = saved.evidenceOrigin.arm === 'baseline' ? source.baseline : source.loadout
          if (!matchesLessonIdentity(historical.identity, identity, draft, candidate, ecosystem)) {
            throw new Error('本机配置已变化，无法核对这局的原出装。')
          }
        }
        buildPlans.read(ref.id, ref.revision)
        const removed = historicalRemovals(candidate, presetEquipment(ecosystem, saved.heroId), ecosystem)
        return { view: { ...view, removed }, draft, candidate, pinned: { ...ref, identity, presetId: saved.presetId, heroId: saved.heroId,
          planName: saved.name, heroName: saved.heroName }, ...(source && { originArm: saved.evidenceOrigin.arm }) }
      } catch (error) {
        return { view: { ...view, reason: error instanceof Error ? error.message : '无法核对当前出装的配置。' } }
      }
    }))
    signal?.throwIfAborted()
    const view = { workspaceId, workspaceTitle: workspace.title, material, task, arms: checked.map(item => item.view) }
    if (checked.some(item => !item.pinned)) return { view }
    const [left, right] = checked
    const plans = { left: left.pinned, right: right.pinned }
    const token = createHash('sha256').update(JSON.stringify([inputHash, workspace.path, digest, plans])).digest('hex')
    return { view, record: { workspaceId, workspaceTitle: workspace.title, cwd: workspace.path, material, task, brief, digest, inputHash, plans, token,
      ...(source && { evidenceRetest, evidenceRetestSource: { comparisonId: source.id, left: left.originArm, right: right.originArm } }) },
      ecosystem, left, right }
  }

  async function previewPlanComparison(selection, english, signal) {
    const { view, record, ecosystem, left, right } = await checkPlanComparison(requestedPlanComparison(selection, english), signal)
    if (!record) return view
    const comparison = await compare({ ...right.draft, againstDraft: left.draft }, ecosystem, right.candidate, left.candidate)
    signal?.throwIfAborted()
    return { ...view, comparison, token: record.token }
  }

  async function createPlanComparison(selection, english, signal) {
    const input = requestedPlanComparison(selection, english)
    const mismatch = '材料、任务或出装已变化，请重新核对。'
    const { launchId, token } = selection
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('请先核对两套出装和共用材料。')
    const record = await planComparisons.create(launchId, async () => {
      const checked = await checkPlanComparison(input, signal)
      if (checked.record?.token !== token) throw new Error(mismatch)
      return checked.record
    })
    if (record.inputHash !== input.inputHash || record.token !== token) throw new Error(mismatch)
    return record
  }

  async function preparePlanComparison(comparison, arm) {
    const pinned = comparison.plans[arm]
    if (comparison.evidenceRetest) requireEvidenceRetest(comparison.plans)
    const current = buildPlans.read(pinned.id, pinned.revision)
    const { draft, candidate, identity } = await verifiedPlanComparisonArm(current, await discover())
    if (current.presetId !== pinned.presetId || identity !== pinned.identity) {
      throw new Error('材料、任务或出装已变化，请重新核对。')
    }
    if (comparison.evidenceRetest) requireEvidenceRetest(comparison.plans)
    return prepare(draft, candidate)
  }

  function rematchReference({ kind, comparisonId, arm }) {
    const comparisons = validRematchReference({ kind, comparisonId, arm }) ? comparisonStores[kind] : undefined
    const record = comparisons?.read(comparisonId)
    if (!record || !comparisons.armsFor(record).includes(arm)) throw new Error('请选择一局已核验的实战作为原局。')
    return { comparisons, record, arm }
  }

  async function verifiedLessonTaskSource(selection, signal) {
    if (isHeroDeliveryTrialSource(selection)) return verifiedHeroDeliveryLesson(selection.comparisonId, signal)
    if (isStockTrialSource(selection)) {
      const record = heroTrials.read(selection.comparisonId)
      const observed = record && await readHeroTrialArm(record, selection.arm, signal, true)
      const checked = record && await verifiedStockTrialLesson(record, observed, signal)
      if (!checked) throw new Error('请从已经核验的灯塔练习开始。')
      return checked
    }
    const { kind, comparisonId, arm } = selection
    const evidence = isEvidenceLessonSource(selection)
    const lesson = evidence ? evidenceLesson : lighthouseLesson
    const comparisons = validLessonTaskReference(selection) ? comparisonStores[kind] : undefined
    const record = comparisons?.read(comparisonId)
    const unavailable = '请从已经核验的灯塔练习开始。'
    const publicReplay = comparisons === rematchComparisons && arm === 'rematch' && record?.baseline?.publicEvidenceReplay === true
    if (!record || (!publicReplay && record.lesson !== lesson) || !comparisons.armsFor(record).includes(arm)) throw new Error(unavailable)
    const [observed, saved] = await Promise.all([
      publicReplay ? readComparisonArms(comparisons, record, signal).then(({ arms, evidenceOutcome }) => {
        if (evidenceOutcome?.arms.some(side => side.id === arm && side.lessonTaskSource)) return arms.find(side => side.id === arm)
      }) : readComparisonArm(comparisons, record, arm, signal),
      comparisons.readArm(record.id, arm),
    ])
    if (!saved?.opened || !observed || (publicReplay
      ? saved.workspaceId !== record.workspaceId || saved.cwd !== record.cwd
      : !observed.canReuse || (evidence && observed.continuationReason))) throw new Error(unavailable)
    const pinned = record.loadout
    const heroId = pinned?.heroId ?? records.get(saved.presetId)?.baseId ?? saved.presetId
    const ecosystem = await discover()
    const { draft, candidate, identity } = await verifiedPlanComparisonArm({ presetId: saved.presetId, heroId }, ecosystem)
    const verifiedIdentity = pinned && (publicReplay ? pinned.identity === identity
      : matchesLessonIdentity(pinned.identity, identity, draft, candidate, ecosystem))
    const invalidReplayLoadout = publicReplay && (draft.presetId !== 'standard' || !isDeepStrictEqual(draft.equipmentIds, ['present']))
    if (!identity || invalidReplayLoadout || (pinned && (pinned.presetId !== saved.presetId || !verifiedIdentity))) {
      throw new Error('本机配置已变化，无法核对这局的原出装。')
    }
    const heroName = pinned?.heroName ?? matchHero(heroId, records.get(saved.presetId)).name
    const lessonDetails = evidence ? { lesson } : publicReplay ? { publicEvidenceReplay: true } : undefined
    const proof = { kind, comparisonId: record.id, arm, sessionId: observed.sessionId,
      presetId: saved.presetId, identity: pinned?.identity ?? identity, ...lessonDetails }
    const view = { kind, comparisonId: record.id, arm, sessionId: observed.sessionId, heroName,
      ...(record.change && { change: record.change }), ...lessonDetails }
    signal?.throwIfAborted()
    return { draft, candidate, ecosystem, proof, view }
  }

  async function personalTaskPathFilter() {
    const profileDirectory = await realpath(directory)
    const webPractice = join(profileDirectory, webSourceDirectory)
    return path => !lighthousePracticeContains(profileDirectory, path) &&
      path !== webPractice && !path.startsWith(webPractice + sep)
  }

  async function personalWorkspaceIds(signal) {
    const includesPath = await personalTaskPathFilter()
    const workspaces = ctx.get('workspaceRegistry')?.list() ?? []
    const allowed = await Promise.all(workspaces.map(async workspace =>
      (await checkedPersonalWorkspace(workspace, includesPath))?.id))
    signal?.throwIfAborted()
    return allowed.filter(Boolean)
  }

  async function checkedPersonalWorkspace(workspace, includesPath) {
    if (!workspace) return
    const path = await realpath(workspace.path).catch(() => undefined)
    if (path && path === workspace.path && includesPath(path)) return workspace
  }

  async function lessonTaskOptions(selection, signal) {
    const { view } = await verifiedLessonTaskSource(selection, signal)
    const { handoffPairId } = selection
    await verifyHandoffTaskPair(selection, signal)
    return { source: { ...view, ...(handoffPairId && { handoffPairId }) }, workspaceIds: await personalWorkspaceIds(signal) }
  }

  function requestedLessonTask(selection, english) {
    const { kind, comparisonId, arm, workspaceId, handoffPairId, handoffAlternateOf } = selection
    const source = { kind, comparisonId, arm, ...(handoffPairId !== undefined && { handoffPairId }) }
    if (!validLessonTaskReference(source)) throw new Error('请从已经核验的灯塔练习开始。')
    if (handoffAlternateOf !== undefined && (!handoffPairId || typeof handoffAlternateOf !== 'string' ||
      !heroAlternateSessionId.test(handoffAlternateOf))) throw new Error(handoffPairChanged)
    if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 512) throw new Error('请选择一个现有的工作区。')
    const fields = { source, workspaceId, ...planTaskPrompt(selection, english), ...(handoffAlternateOf && { handoffAlternateOf }) }
    const hash = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
    return { ...fields, hash, english }
  }

  async function readPersonalTaskMaterial(workspaceId, material, signal) {
    const workspace = ctx.get('workspaceRegistry')?.get(workspaceId)
    if (!workspace) throw new Error('请选择一个现有的工作区。')
    const cwd = workspace.path
    const includesPath = await personalTaskPathFilter()
    const path = join(cwd, material)
    const original = await realpath(path).catch(() => undefined)
    if (!includesPath(cwd) || (original && !includesPath(original))) {
      throw new Error('请选择自己的工作区和材料。练习文件保留在独立工作区。')
    }
    if (await realpath(cwd).catch(() => undefined) !== cwd || original !== path) {
      throw new Error('无法读取所选材料，请核对工作区内的文件路径。')
    }
    const { workspace: current, digest } = await readWorkspaceMaterial(workspaceId, material, signal)
    const resolved = await realpath(path).catch(() => undefined)
    if (resolved !== path || current.path !== cwd) throw new Error('材料、任务或出装已变化，请重新核对。')
    return { workspace: current, digest }
  }

  async function checkLessonTask(input, signal) {
    const { workspaceId, material, task, hash, english } = input
    const { draft, candidate, ecosystem, proof, view: source, stockBindings } = await verifiedLessonTaskSource(input.source, signal)
    await verifyHandoffTaskPair(input.source, signal)
    const { workspace, digest } = await readPersonalTaskMaterial(workspaceId, material, signal)
    const cwd = workspace.path
    const handoffAlternateOf = input.handoffAlternateOf &&
      await sameHandoffOrigin(input.handoffAlternateOf, input.source, { workspaceId, material, task, cwd, digest }, signal)
    const lessonName = isStockTrialSource(source) ? presetLabels.get(source.arm)[0]
      : source.heroDeliveryTrial ? '极简模式 + 交付物预览'
      : source.publicEvidenceReplay ? '灯塔证据换装对照' : source.lesson === evidenceLesson ? '灯塔证据取舍' : '灯塔换装练习'
    const planName = english ? englishText(lessonName) : lessonName
    const { handoffPairId } = input.source
    const view = { workspaceId, workspaceTitle: workspace.title, material, planName, task,
      source: { ...source, ...(handoffPairId && { handoffPairId }) }, ...(handoffAlternateOf && { sameHandoffTask: true }) }
    const token = createHash('sha256').update(JSON.stringify([
      hash, cwd, digest, proof, ...(input.handoffAlternateOf ? [handoffAlternateOf ?? null] : []),
    ])).digest('hex')
    signal?.throwIfAborted()
    return { view, cwd, digest, draft, candidate, ecosystem, token, identity: proof.identity, stockBindings, handoffAlternateOf }
  }

  function personalTaskTarget(launch, header) {
    const { source, armory, target, material, task } = launch ?? {}
    if ((!source && armory !== true) || !target || target.presetId !== header.agentPreset || !/^[a-f0-9]{24}$/.test(target.identity)) return
    const current = { ...target, cwd: header.cwd, material, task }
    if (validWorkspaceComparison(current)) return current
  }

  async function personalTaskMaterialState({ workspaceId, cwd, material, digest }, signal) {
    try {
      const { workspace, digest: current } = await readPersonalTaskMaterial(workspaceId, material, signal)
      if (workspace.path !== cwd) return 'unavailable'
      return current === digest ? 'verified' : 'changed'
    } catch {
      signal?.throwIfAborted()
      return 'unavailable'
    }
  }

  const heroAlternateUnavailable = '同组已核验的另一套出装暂不可用。'
  const heroAlternateChanged = '材料、任务或出装已变化，请重新核对。'

  function oppositePersonalHeroArm(source) {
    if (!source) return
    if (isStandardTrialSource(source)) return lighthouseHeroDelivery
    if (isHeroDeliveryTrialSource(source)) return 'standard'
  }

  function alternateHeroSource(launch) {
    const source = launch?.source
    const arm = !launch?.alternateOf && oppositePersonalHeroArm(source)
    if (arm && heroTrials.read(source.comparisonId)?.need !== 'original') return
    if (arm) return { kind: 'hero-trial', comparisonId: source.comparisonId, arm }
  }

  function heroAlternateInput(sessionId, launch, target, english) {
    const source = alternateHeroSource(launch)
    if (!source || !target) throw new Error(heroAlternateUnavailable)
    const { workspaceId, material, task } = target
    const fields = { alternateOf: sessionId, source, workspaceId, material, task, originalTarget: target }
    const hash = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
    return { ...fields, hash, english }
  }

  async function requestedHeroAlternateTask({ sessionId }, english, signal) {
    if (typeof sessionId !== 'string' || !heroAlternateSessionId.test(sessionId)) throw new Error(heroAlternateUnavailable)
    const saved = await planTaskSession(sessionId, signal)
    return heroAlternateInput(sessionId, saved?.launch, saved && personalTaskTarget(saved.launch, saved.header), english)
  }

  async function checkHeroAlternateTask(input, signal, observed) {
    const original = observed ?? await observeLessonTask(input.alternateOf, signal, true)
    if (!original || !isDeepStrictEqual(original.target, input.originalTarget) ||
      !isDeepStrictEqual(alternateHeroSource(original.launch), input.source) ||
      original.evidence.status !== 'complete' || !original.evidence.materialDelivered ||
      !verifiedPresentHandoff(original.evidence) || !original.presentBinding) throw new Error(heroAlternateUnavailable)
    const [against, checked] = await Promise.all([
      verifiedLessonTaskSource(original.launch.source, signal),
      checkLessonTask(input, signal),
    ])
    const present = against.stockBindings?.find(binding => binding.tool === 'present')
    if (against.proof.sessionId !== original.launch.source.sessionId ||
      against.proof.presetId !== original.target.presetId || against.proof.identity !== original.target.identity ||
      (present && !isDeepStrictEqual(present, original.presentBinding)) ||
      checked.cwd !== original.target.cwd || checked.digest !== original.target.digest) throw new Error(heroAlternateChanged)
    const token = createHash('sha256').update(JSON.stringify([checked.token, against.proof])).digest('hex')
    return { ...checked, against, token, view: { ...checked.view, fromArm: original.launch.source.arm } }
  }

  async function heroAlternateTaskOption(sessionId, original, signal) {
    if (!original.presentBinding || !alternateHeroSource(original.launch)) return
    try {
      const input = heroAlternateInput(sessionId, original.launch, original.target, false)
      await checkHeroAlternateTask(input, signal, original)
      return { arm: input.source.arm }
    } catch {
      signal?.throwIfAborted()
    }
  }

  async function pendingStandardTrial(original, signal) {
    const { launch, evidence, presentBinding, target } = original
    const next = alternateHeroSource(launch)
    if (next?.arm !== 'standard' || !target || !presentBinding ||
      evidence.status !== 'complete' || !verifiedPresentHandoff(evidence)) return
    try {
      const record = heroTrials.read(next.comparisonId)
      const stock = await readHeroTrialArm(record, next.arm, signal)
      if (stock.status !== 'unopened' && (stock.status !== 'waiting' || stock.presetChanged || stock.materialState !== 'verified')) return
      const [checked, materialState] = await Promise.all([
        verifiedLessonTaskSource(launch.source, signal),
        personalTaskMaterialState(target, signal),
      ])
      if (materialState === 'verified' && checked.proof.sessionId === launch.source.sessionId &&
        checked.proof.presetId === target.presetId && checked.proof.identity === target.identity &&
        isDeepStrictEqual(checked.deliveryBinding, presentBinding) && await heroTrialAvailable(checked.ecosystem)) {
        return { comparisonId: next.comparisonId, arm: next.arm }
      }
    } catch {
      signal?.throwIfAborted()
    }
  }

  function standardReturnDirectory(comparisonId) {
    return join(heroTrials.armDirectory(comparisonId), 'personal-returns')
  }

  function personalTaskBrief(task) {
    return task.split('\n').slice(2, -1).join('\n').trim()
  }

  async function openStandardFromPersonal({ sessionId, comparisonId, arm }, english, signal) {
    const unavailable = '无法从这次个人任务打开标准模式试玩。'
    if (typeof sessionId !== 'string' || !heroAlternateSessionId.test(sessionId)) throw new Error(unavailable)
    const original = await observeLessonTask(sessionId, signal, true)
    const source = original && await pendingStandardTrial(original, signal)
    if (!source || source.comparisonId !== comparisonId || source.arm !== arm) throw new Error(unavailable)
    const waiting = (await heroTrials.readArm(comparisonId, arm))?.opened === true
    const opened = await openComparisonArm(heroTrials, source, english, signal)
    try {
      await saveEntry(standardReturnDirectory(comparisonId), sessionId, { startedAt: Date.now() }, { exclusive: true })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    updates.notify(opened.sessionId)
    const { task, ...reply } = opened
    return waiting ? reply : { ...reply, task }
  }

  async function standardReturnTasks(record, signal) {
    const directory = standardReturnDirectory(record.id)
    const entries = await readdir(directory).catch(() => [])
    const ids = entries.filter(file => file.endsWith('.json')).map(file => file.slice(0, -5))
      .filter(id => heroAlternateSessionId.test(id))
    const tasks = await Promise.all(ids.map(async sessionId => {
      try {
        const { startedAt } = JSON.parse(await readFile(join(directory, sessionId + '.json'), 'utf8'))
        if (!Number.isSafeInteger(startedAt) || startedAt < 0) return
        const original = await observeLessonTask(sessionId, signal, true)
        if (!original || original.launch.source?.comparisonId !== record.id ||
          (await heroAlternateTaskOption(sessionId, original, signal))?.arm !== 'standard') return
        const { workspaceId, material } = original.target
        const workspaceTitle = ctx.get('workspaceRegistry')?.get(workspaceId)?.title
        return { sessionId, material, workspaceTitle, startedAt, task: original.target.task }
      } catch {
        signal?.throwIfAborted()
      }
    }))
    const eligible = tasks.filter(Boolean).sort((a, b) => b.startedAt - a.startedAt || a.sessionId.localeCompare(b.sessionId))
    return eligible.map(({ task, ...item }) => {
      if (!eligible.some(other => other.sessionId !== item.sessionId &&
        other.material === item.material && other.workspaceTitle === item.workspaceTitle)) return item
      const briefPreview = Array.from(personalTaskBrief(task).replace(/\s+/gu, ' ')).slice(0, 120).join('')
      return { ...item, briefPreview }
    })
  }

  async function openHeroAlternateTask({ sessionId, token }, english, signal) {
    if (typeof sessionId !== 'string' || !heroAlternateSessionId.test(sessionId)) throw new Error(heroAlternateUnavailable)
    const launchId = createHash('sha256').update(JSON.stringify([planTaskOwner, 'hero-alternate', sessionId])).digest('hex').slice(0, 32)
    return openReviewedTask({ sessionId, token, launchId }, english, signal, 'alternate')
  }

  async function personalHeroPair(sessionId, current, signal) {
    const { alternateOf, source } = current.launch
    if (typeof alternateOf !== 'string' || !heroAlternateSessionId.test(alternateOf) ||
      !oppositePersonalHeroArm(source) || !current.target || current.evidence.status !== 'complete' ||
      current.evidence.materialState !== 'verified' || current.evidence.continuationReason) return
    const original = await observeLessonTask(alternateOf, signal, true)
    if (!original?.target || !original.presentBinding || !verifiedPresentHandoff(original.evidence) ||
      original.evidence.status !== 'complete' || original.launch.alternateOf ||
      source.comparisonId !== original.launch.source?.comparisonId ||
      source.arm !== oppositePersonalHeroArm(original.launch.source)) return
    const sameInput = ['workspaceId', 'cwd', 'digest', 'material', 'task'].every(key => original.target[key] === current.target[key])
    if (!sameInput) return
    return { material: current.target.material, original: { sessionId: alternateOf, result: original },
      alternate: { sessionId, result: current } }
  }

  function personalHeroPairResult({ material, original, alternate }) {
    function side({ sessionId, result }) {
      const tools = [...new Set(result.evidence.entries.filter(entry => entry.state === 'completed').map(entry => entry.name))]
      const originalAttached = Boolean(result.presentBinding)
      return { sessionId, arm: result.launch.source.arm, tools, originalAttached, ...(originalAttached && { canReview: true }) }
    }
    return { material, original: side(original), alternate: side(alternate) }
  }

  async function checkedPersonalRematchBaseline(selection, signal, original) {
    original ??= await personalRematchEvidence(selection, signal)
    if (!original || !original.canReuse) throw new Error('请选择一局已核验的实战作为原局。')
    const { target, hero, observed, sessionId, evidenceReplay, stockStandardTask, presentBinding } = original
    const { workspaceId, cwd, material, digest, task, presetId, identity } = target
    const workspace = ctx.get('workspaceRegistry')?.get(workspaceId)
    if (workspace?.path !== cwd) throw new Error('请选择一个现有的工作区。')
    const state = await personalTaskMaterialState(target, signal)
    if (state !== 'verified') throw new Error(state === 'changed' ? '材料已变化，请用现在的文件开始新的对照。'
      : '无法读取所选材料，请核对工作区内的文件路径。')
    const ecosystem = await discover()
    const heroId = hero.id
    const preset = ecosystem.presets.find(item => item.id === heroId && !item.broken)
    if (!preset) throw new Error('当前英雄的基础阵容不可用。')
    const { draft, candidate, identity: current } = await verifiedPlanComparisonArm({ presetId, heroId }, ecosystem)
    if (!matchesLessonIdentity(identity, current, draft, candidate, ecosystem) ||
      (presentBinding && !isDeepStrictEqual(presentBinding, retainedRematchTool({ ecosystem, draft, candidate }, candidate)))) {
      throw new Error('本机配置已变化，无法核对这局的原出装。')
    }
    const { kind, comparisonId, arm } = selection
    const baseline = { kind, comparisonId, arm, sessionId, presetId, heroId, heroName: hero.name, identity,
      ...(evidenceReplay && { evidenceReplay }) }
    const { title: workspaceTitle } = workspace
    const view = { workspaceId, workspaceTitle, material, task, baseline: { sessionId, heroName: hero.name } }
    const brief = task.split('\n').slice(2, -1).join('\n').trim()
    signal?.throwIfAborted()
    return { ecosystem, preset, draft, candidate, baseline, view, observed, stockStandardTask, presentBinding,
      fields: { workspaceId, workspaceTitle, cwd, digest, material, task, brief } }
  }

  async function checkedRematchBaseline(selection, signal) {
    if (selection.kind === 'personal') return checkedPersonalRematchBaseline(selection, signal)
    const { comparisons, record, arm } = rematchReference(selection)
    const publicEvidenceReplay = comparisons === workspaceComparisons && arm === 'evidence' &&
      record.lesson === evidenceLesson && record.scenario === 'gap'
    const personalReviewRematch = comparisons === rematchComparisons && arm === 'rematch' &&
      record.baseline?.kind === 'personal' && record.edit.addId === 'review' &&
      record.edit.removeId === undefined && record.edit.sourceId === undefined
    const [observed, saved] = await Promise.all([
      readComparisonArm(comparisons, record, arm, signal,
        { verifyPersonalDelivery: personalReviewRematch, linkedChoicesOnly: publicEvidenceReplay }),
      comparisons.readArm(record.id, arm),
    ])
    if (!saved?.opened || !(publicEvidenceReplay ? completedLighthouseChallenge(record, observed) : observed.canRematch)) {
      throw new Error('请选择一局已核验的实战作为原局。')
    }
    const { workspaceId, cwd, digest, material, task, workspaceTitle } = record
    const workspace = ctx.get('workspaceRegistry')?.get(workspaceId)
    if (workspace?.path !== cwd) throw new Error('请选择一个现有的工作区。')
    const materialState = await workspaceMaterialState(record, signal)
    if (materialState !== 'verified') throw new Error(materialState === 'changed' ? '材料已变化，请用现在的文件开始新的对照。'
      : '无法读取所选材料，请核对工作区内的文件路径。')
    const pinned = record.plans?.[arm] ?? record.loadout
    const heroId = pinned?.heroId ?? records.get(saved.presetId)?.baseId ?? saved.presetId
    const ecosystem = await discover()
    const preset = ecosystem.presets.find(item => item.id === heroId && !item.broken)
    if (!preset) throw new Error('当前英雄的基础阵容不可用。')
    const { draft, candidate, identity } = await verifiedPlanComparisonArm({ presetId: saved.presetId, heroId }, ecosystem)
    if (!identity || (pinned && (identity !== pinned.identity || pinned.presetId !== saved.presetId))) {
      throw new Error('本机配置已变化，无法核对这局的原出装。')
    }
    if (publicEvidenceReplay) {
      const standard = await plan(standardDeliveryDraft(ecosystem, ['present', 'evidence']), ecosystem)
      if (standard.id !== saved.presetId || heroId !== 'standard') throw new Error(challengeChanged)
    }
    const heroName = pinned?.heroName ?? matchHero(heroId, records.get(saved.presetId)).name
    const baseline = { kind: selection.kind, comparisonId: record.id, arm, sessionId: observed.sessionId,
      presetId: saved.presetId, heroId, heroName, identity, ...(pinned && { planName: pinned.planName }),
      ...(publicEvidenceReplay && { publicEvidenceReplay: true }) }
    const view = { workspaceId, workspaceTitle: workspace.title ?? workspaceTitle, material, task,
      baseline: { sessionId: baseline.sessionId, heroName, planName: baseline.planName, ...(record.change && { change: record.change }) } }
    const brief = record.brief ?? task.split('\n').slice(2, -1).join('\n').trim()
    return { ecosystem, preset, draft, candidate, baseline, view, lesson: record.lesson,
      ...(personalReviewRematch && { observed, personalReviewRematch: record }),
      ...(publicEvidenceReplay && { observed }),
      fields: { workspaceId, workspaceTitle, cwd, digest, material, task, brief,
        ...(record.lesson && !publicEvidenceReplay && { lesson: record.lesson }) } }
  }

  function evidenceReplayView(baseline) {
    if (baseline?.publicEvidenceReplay) return { evidenceReplay: true, publicEvidenceReplay: true }
    if (baseline?.evidenceReplay) return { evidenceReplay: true }
  }

  function rematchGear({ ecosystem, preset, draft, candidate }) {
    const builtIn = presetEquipment(ecosystem, preset.id)
    const removed = historicalRemovalIds(candidate)
    const equipped = draft.equipmentIds.map(id => {
      const item = equipmentById.get(id) ?? ecosystem.equipment.get(id)
      return { id, name: candidate.record?.equipmentLabels?.[id] ?? item?.name ?? id, sourceId: draft.equipmentSources[id],
        sourceName: candidate.record?.equipmentSourceLabels?.[id] }
    })
    for (const [id, gear] of Object.entries(builtIn)) {
      if (!gear.locked && !removed.has(id) && gear.linked.every(linked => removed.has(linked)) && !draft.equipmentIds.includes(id)) {
        equipped.push({ id, name: gear.name, included: true })
      }
    }
    return { builtIn, removed, equipped }
  }

  function retainedRematchTool({ ecosystem, draft, candidate: before }, after, name = 'present') {
    const module = standardTrialTools[name]
    const rows = build => flatten(build.record?.definition.plugins ?? ecosystem.definitions.get(draft.presetId) ?? [])
      .filter(row => row.disabled !== true && legacy.moduleName(row.name) === module)
    const original = rows(before)
    if (original.length !== 1 || !isDeepStrictEqual(original, rows(after))) return
    const tools = build => [...summarizeCapabilities(ecosystem, draft.presetId, build).values()]
      .filter(item => item.kind === 'tool' && item.name === name)
    const beforeTools = tools(before)
    const afterTools = tools(after)
    const [tool] = beforeTools
    if (beforeTools.length === 1 && !tool.timing && afterTools.length === 1 && afterTools[0].id === tool.id &&
      afterTools[0].timing === tool.timing && afterTools[0].sourceId === tool.sourceId) {
      return { tool: name, id: tool.id, sourceId: tool.sourceId }
    }
  }

  async function personalHandoffSuggestion(selection, checked, signal) {
    const { observed, ecosystem, draft, personalReviewRematch, stockStandardTask } = checked
    const stock = stockStandardTask && draft.equipmentIds.length === 0
    if (observed?.status !== 'complete' || !observed.materialDelivered || observed.continuationReason ||
      draft.presetId !== 'standard' || (!stock && !draft.equipmentIds.includes('present')) ||
      !observed.entries.some(item => item.name === 'present' && item.state === 'completed')) return
    const direct = (stock || draft.equipmentIds.length === 1) && !observed.entries.some(item => item.name === 'ask_user_question')
    const reviewed = draft.equipmentIds.length === 2 && draft.equipmentIds.includes('review') && comparisonChoices(observed).length > 0
    if (!direct && !reviewed) return
    const change = direct ? { addId: 'review' } : { removeId: 'review' }
    try {
      if (personalReviewRematch) {
        const original = await readRematchBaseline(personalReviewRematch, previousComparison(personalReviewRematch), signal)
        if (!original.canReuse || !original.materialDelivered) return
      }
      const { candidate } = await checkRematch(requestedRematch({ ...selection, change }), signal, checked)
      if (!retainedRematchTool(checked, candidate)) return
      const questions = [...summarizeCapabilities(ecosystem, draft.presetId, candidate).values()]
        .filter(item => item.kind === 'tool' && item.name === 'ask_user_question')
      if (reviewed || questions.length === 1 && !questions[0].timing) return change
    } catch {
      signal?.throwIfAborted()
    }
  }

  async function rematchOptions(selection, signal) {
    const checked = await checkedRematchBaseline(selection, signal)
    const { ecosystem, preset, view } = checked
    const { removed, equipped } = rematchGear(checked)
    const evidenceReplay = evidenceReplayView(checked.baseline)
    if (evidenceReplay) {
      await checkRematch(requestedRematch({ ...selection, change: { removeId: 'evidence' } }), signal, checked)
      const baseline = { ...view.baseline, choices: comparisonChoices(checked.observed), deliverables: checked.observed.deliverables }
      return { ...view, baseline, equipped, available: [], ...evidenceReplay }
    }
    const cards = [...equipment, ...visibleEquipment(ecosystem).values()]
    const available = cards.flatMap(item => {
      if (!validEquipmentIds([item.id])) return []
      const status = item.kind ? statusForEcosystem(item, preset, ecosystem, undefined, removed)
        : featuredStatus(item, preset, ecosystem, legacy.moduleName, removed)
      const options = status.sourceChoices ?? [status]
      const sources = options.filter(option => option.state === 'available' && option.sourceId)
        .map(option => ({ id: option.sourceId, name: option.sourceName }))
      if (item.kind === 'tool' ? !sources.length : status.state !== 'available') return []
      const terms = [item.name, item.summary, item.trigger, ...sources.map(source => source.name),
        ...(item.decisions ?? []).map(([label]) => label)]
      const searchTerms = [...new Set(terms.filter(term => typeof term === 'string' && term)
        .flatMap(term => [term, englishText(term)]))]
      return [{ id: item.id, name: item.name, kind: item.kind ?? 'featured', summary: item.summary, sources, searchTerms }]
    }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id))
    const reviewAvailable = available.some(item => item.id === 'review')
    const personalSuggestedChange = await personalHandoffSuggestion(selection, checked, signal)
    const baseline = personalSuggestedChange?.removeId
      ? { ...view.baseline, choices: comparisonChoices(checked.observed) } : view.baseline
    signal?.throwIfAborted()
    const guidedReview = checked.presentBinding && personalSuggestedChange?.addId === 'review'
      || checked.lesson === lighthouseLesson && checked.baseline.kind === 'workspace'
    return { ...view, baseline, equipped, available,
      ...(guidedReview && reviewAvailable && { suggestedGearId: 'review' }),
      ...(personalSuggestedChange && { personalSuggestedChange }) }
  }

  function requestedRematch(selection) {
    const { kind, comparisonId, arm } = selection
    const { removeId, addId, sourceId } = selection.change ?? {}
    if ((removeId === undefined && addId === undefined) || (removeId !== undefined && !validEquipmentIds([removeId])) ||
      (addId !== undefined && !validEquipmentIds([addId])) ||
      (sourceId !== undefined && (!addId || !validEquipmentSources({ [addId]: sourceId }, [addId])))) {
      throw new Error('请选择一项装备变更。')
    }
    const change = { ...(removeId !== undefined && { removeId }), ...(addId !== undefined && { addId }),
      ...(sourceId !== undefined && { sourceId }) }
    const input = { kind, comparisonId, arm, change }
    return { ...input, inputHash: createHash('sha256').update(JSON.stringify(input)).digest('hex') }
  }

  async function checkRematch(input, signal, baselineCheck) {
    const checked = baselineCheck ?? await checkedRematchBaseline(input, signal)
    const { ecosystem, baseline, fields, view, candidate: before } = checked
    const { removeId, addId, sourceId } = input.change
    const evidenceReplay = evidenceReplayView(baseline)
    if (evidenceReplay && (removeId !== 'evidence' || addId !== undefined)) {
      throw new Error('这次对照只能卸下证据核验。')
    }
    const { removed, equipped } = rematchGear(checked)
    const removedGear = equipped.find(item => item.id === removeId)
    if (removeId !== undefined && !removedGear) throw new Error('原局没有可单独卸下的这件装备。')
    if (addId !== undefined && !equipmentById.has(addId) && !visibleEquipment(ecosystem).has(addId)) {
      throw new Error('当前阵容无法提供这件装备。')
    }
    const equipmentIds = checked.draft.equipmentIds.filter(id => id !== removeId)
    const equipmentSources = { ...checked.draft.equipmentSources }
    if (removeId) delete equipmentSources[removeId]
    if (addId !== undefined) {
      if (equipmentIds.includes(addId)) throw new Error('请选择一项装备变更。')
      equipmentIds.push(addId)
      if (sourceId) equipmentSources[addId] = sourceId
    }
    const removedEquipmentIds = [...checked.draft.removedEquipmentIds, ...(removedGear?.included ? [removeId] : [])]
    const draft = { presetId: baseline.heroId, equipmentIds, equipmentSources, removedEquipmentIds }
    const candidate = await plan(draft, ecosystem)
    if (candidate.id === before.id) throw new Error('请选择一项装备变更。')
    const afterRemovals = historicalRemovalIds(candidate)
    if ([...afterRemovals].some(id => id !== removeId && !removed.has(id))) {
      throw new Error('这次变更还会卸下其他装备。请选择一件可单独调整的装备。')
    }
    if (sourceId && candidate.record?.equipmentSources?.[addId] !== sourceId) {
      throw new Error('当前阵容无法提供这件装备的原来源。')
    }
    if (removedGear?.included && !afterRemovals.has(removeId)) throw new Error('原局没有可单独卸下的这件装备。')
    const assembled = recordedLoadoutDraft(candidate.record, baseline.heroId, ecosystem)
    if (checked.draft.equipmentIds.some(id => id !== removeId &&
      (!assembled.equipmentIds.includes(id) || checked.draft.equipmentSources[id] !== assembled.equipmentSources[id]))) {
      throw new Error('这次变更还会影响其他已装备项目或来源。')
    }
    const stockReview = checked.stockStandardTask && addId === 'review' && removeId === undefined
    const retainedDelivery = (evidenceReplay || stockReview) && retainedRematchTool(checked, candidate)
    if ((evidenceReplay || stockReview) && !retainedDelivery) {
      throw new Error('原局的交付工具或来源已变化，请重新核对。')
    }
    const retainedReader = stockReview && retainedRematchTool(checked, candidate, 'read')
    if (stockReview && (!retainedReader?.sourceId || !retainedDelivery.sourceId)) {
      throw new Error('原局的读取或交付工具来源已变化，请重新核对。')
    }
    const identity = comparisonLoadoutIdentity(assembled, candidate, ecosystem)
    if (!identity) throw new Error('无法核对当前出装的配置。')
    const loadout = { presetId: candidate.id, heroId: baseline.heroId, heroName: baseline.heroName, identity }
    const change = { ...(removedGear && { removed: { id: removedGear.id, name: removedGear.name, sourceName: removedGear.sourceName } }),
      ...(addId && { added: { id: addId, name: candidate.record.equipmentLabels[addId], sourceName: candidate.record.equipmentSourceLabels?.[addId] } }) }
    const { inputHash } = input
    const token = createHash('sha256').update(JSON.stringify([inputHash, fields.cwd, fields.digest, baseline, loadout])).digest('hex')
    signal?.throwIfAborted()
    return { view: { ...view, change, token, ...evidenceReplay },
      record: { ...fields, baseline, loadout, change, edit: input.change, inputHash, token },
      draft, before, candidate, ecosystem, againstDraft: checked.draft,
      ...(stockReview && { stockReviewBindings: [retainedReader, retainedDelivery] }) }
  }

  async function previewRematch(selection, signal) {
    const { view, draft, before, candidate, againstDraft, ecosystem } = await checkRematch(requestedRematch(selection), signal)
    const comparison = await compare({ ...draft, againstDraft }, ecosystem, candidate, before)
    signal?.throwIfAborted()
    return { ...view, comparison }
  }

  async function checkLighthouseReviewSwap(source, next, signal) {
    if (!validReviewReplaySource(source, next)) throw new Error(reviewChallengeUnavailable)
    const checked = await checkedRematchBaseline(source, signal)
    const addReview = next === 'review'
    const input = requestedRematch({ ...source, change: addReview ? { addId: 'review' } : { removeId: 'review' } })
    const change = await checkRematch(input, signal, checked)
    const [before, after] = await Promise.all([addReview ? 'direct' : 'review', next]
      .map(style => plan(deliveryPlaybookDraft(checked.ecosystem, style), checked.ecosystem)))
    if (before.id !== change.before.id || after.id !== change.candidate.id ||
      !['read', 'present'].every(tool => retainedRematchTool(checked, change.candidate, tool))) {
      throw new Error(reviewRoutesUnavailable)
    }
    return change
  }

  async function checkLighthouseDirectRematch({ kind, comparisonId, arm }, signal) {
    const source = { kind, comparisonId, arm }
    if (!validReviewReplaySource(source, 'direct')) throw new Error(reviewChallengeUnavailable)
    const review = await requireReviewHandoff(source, signal)
    if (review.played !== 'review') throw new Error(reviewChallengeUnavailable)
    const change = await checkLighthouseReviewSwap(source, 'direct', signal)
    const token = createHash('sha256').update(JSON.stringify([planTaskOwner, 'solo-direct-rematch', change.view.token,
      review.language, review.choiceLabel, review.originalAttached])).digest('hex')
    const view = { ...change.view, token, baseline: { ...change.view.baseline, choice: review.choiceLabel,
      materialDelivered: review.originalAttached } }
    return { ...change, view, source, language: review.language }
  }

  async function previewLighthouseDirectRematch(selection, signal) {
    const { view, draft, before, candidate, againstDraft, ecosystem } = await checkLighthouseDirectRematch(selection, signal)
    const comparison = await compare({ ...draft, againstDraft }, ecosystem, candidate, before)
    signal?.throwIfAborted()
    return { ...view, comparison }
  }

  async function openLighthouseDirectRematch(selection, signal) {
    const { token, launchId } = selection
    if (!validOpeningId(launchId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error(challengeChanged)
    const { view, source, language, candidate } = await checkLighthouseDirectRematch(selection, signal)
    if (token !== view.token) throw new Error(challengeChanged)
    const id = createHash('sha256').update(JSON.stringify(['solo-direct-rematch', token, launchId])).digest('hex').slice(0, 32)
    return openLighthouseLesson({ launchId: id, reviewChallengeArm: 'direct', reviewReplaySource: source },
      language === 'en', signal, lighthouseLesson, candidate.id)
  }

  async function repeatLighthouseReview({ comparisonId, launchId }, english, signal) {
    if (!validOpeningId(launchId)) throw new Error('开局请求无效，请重试。')
    const record = rematchComparisons.read(comparisonId)
    const unavailable = '请先完成一局已核验的灯塔交付复核。'
    if (!record || !isLighthouseReviewRematch(record, previousComparison(record))) throw new Error(unavailable)
    const { publicReviewOutcome } = await readComparisonArms(rematchComparisons, record, signal)
    if (reviewedChoice(publicReviewOutcome)?.choices.length !== 1) throw new Error(unavailable)
    const { kind, comparisonId: original, arm } = record.baseline
    const id = createHash('sha256').update(JSON.stringify(['lighthouse-review-repeat', comparisonId, launchId])).digest('hex').slice(0, 32)
    const baselineSelection = { kind, comparisonId: original, arm, change: record.edit, token: record.token, launchId: id }
    return openComparisonArm(rematchComparisons, { arm: 'rematch', launchId: id, baselineSelection }, english, signal)
  }

  async function createRematch(selection, registry, signal) {
    const input = requestedRematch(selection)
    const { launchId, token } = selection
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('请先核对这次装备变更。')
    const mismatch = '材料、任务或出装已变化，请重新核对。'
    let work = openingRematches.get(launchId)
    if (!work) {
      work = rematchComparisons.create(launchId, async id => {
        const { record } = await checkRematch(input, signal)
        if (record.token !== token) throw new Error(mismatch)
        if (!record.baseline.publicEvidenceReplay) return record
        const workspace = await lighthouseEvidenceReplayWorkspace(directory, registry, id)
        if (workspace.id === record.workspaceId || workspace.path === record.cwd ||
          await digestWorkspaceMaterial(workspace.path, record.material, signal) !== record.digest) throw new Error(mismatch)
        signal?.throwIfAborted()
        return { ...record, workspaceId: workspace.id, workspaceTitle: workspace.title, cwd: workspace.path }
      }).finally(() => openingRematches.delete(launchId))
      openingRematches.set(launchId, work)
    }
    const record = await work
    if (record.inputHash !== input.inputHash || record.token !== token) throw new Error(mismatch)
    return record
  }

  async function prepareRematch(comparison, signal) {
    const { kind, comparisonId, arm } = comparison.baseline
    const selection = { kind, comparisonId, arm, change: comparison.edit }
    const checked = await checkRematch(requestedRematch(selection), signal)
    if (checked.record.token !== comparison.token) throw new Error('材料、任务或出装已变化，请重新核对。')
    const prepared = await prepare(checked.draft, checked.candidate)
    return { ...prepared, stockReviewBindings: checked.stockReviewBindings }
  }

  async function readComparisonArm(comparisons, comparison, arm, signal,
    { verifyPersonalDelivery = false, linkedChoicesOnly = false, includeFileCoordinates = false } = {}) {
    const { sessionId } = comparisons.identity(comparison.id, arm)
    const labels = comparison.loadout ? { heroName: comparison.loadout.heroName } : planComparisonLabels(comparison, arm)
    let saved
    let source
    try {
      saved = await comparisons.readArm(comparison.id, arm)
      const workspace = saved && ctx.get('workspaceRegistry')?.get(saved.workspaceId)
      if (!saved?.opened && (comparison.plans || comparison.loadout || !workspace?.sessionIds.includes(sessionId))) {
        return { id: arm, ...labels, status: 'unopened' }
      }
      source = await ctx.get('sessionQuery').observeSession(sessionId, { projectionMode: comparison.material ? 'all' : 'none', signal })
      const lesson = comparisons === workspaceComparisons && comparison.lesson === lighthouseLesson
      const lessonBaseline = lesson && arm === 'direct'
      const reviewChallenge = lesson && comparison.reviewChallengeArm !== undefined
      const evidencePractice = comparisons === workspaceComparisons && comparison.lesson === evidenceLesson
      const publicEvidenceReplay = comparison.baseline?.publicEvidenceReplay === true
      const evidenceReplay = Boolean(evidenceReplayView(comparison.baseline))
      const strictEvidence = evidenceReplay || comparison.evidenceRetest === true
      const result = await comparisonEvidence(source, { ...saved, task: comparison.task, material: comparison.material,
        verifyMaterialDelivery: lesson || verifyPersonalDelivery, includeFileCoordinates,
        ...((verifyPersonalDelivery || reviewChallenge || evidencePractice || strictEvidence) && { exactMessages: true }),
        linkedChoicesOnly: linkedChoicesOnly || reviewChallenge || strictEvidence || (evidencePractice && comparison.scenario === 'gap') }, receipts)
      if (lessonBaseline && result.status === 'complete' && !result.materialDelivered) {
        result.reason = '未交付本次练习的灯塔补给卡。请查看原会话或开始新的练习。'
      }
      const canReuse = evidencePractice
        ? result.status === 'complete' && (comparisonChoices(result).length > 0 ||
          (comparison.scenario === 'confirmed' && result.deliverables.length > 0))
        : !publicEvidenceReplay && (!lessonBaseline || result.materialDelivered === true) && (!strictEvidence || !result.continuationReason) &&
          reusableComparisonArm(arm, result)
      const canRematch = canReuse && !evidencePractice && !evidenceReplay && materialComparisonStores.includes(comparisons) &&
        (!comparison.baseline || Boolean(previousComparison(comparison)))
      const canTransfer = canReuse && saved?.opened && (comparison.lesson === lighthouseLesson ||
        (evidencePractice && !result.continuationReason))
      const lessonTaskSource = canTransfer
        ? { kind: lesson || evidencePractice ? 'workspace' : 'rematch', comparisonId: comparison.id, arm } : undefined
      return { id: arm, ...labels, sessionId, ...result, canReuse, ...(canRematch && { canRematch }),
        ...(lessonTaskSource && { lessonTaskSource }) }
    } catch {
      signal?.throwIfAborted()
      return { id: arm, ...labels, ...(saved?.opened && { sessionId }), status: 'unavailable', reason: 'session-unavailable' }
    } finally {
      source?.[Symbol.dispose]()
    }
  }

  function previousComparison(comparison) {
    if (!comparison.baseline) return
    const { kind, comparisonId, arm, sessionId, presetId, identity } = comparison.baseline
    if (kind === 'personal') return { personal: comparison.baseline }
    const comparisons = comparisonStores[kind]
    const original = comparisons.read(comparisonId)
    if (!original || original === comparison || !comparisons.armsFor(original).includes(arm) ||
      comparisons.identity(comparisonId, arm).sessionId !== sessionId || original.digest !== comparison.digest ||
      original.task !== comparison.task || original.material !== comparison.material) return
    if (comparison.baseline.publicEvidenceReplay) {
      if (original.lesson !== evidenceLesson || original.scenario !== 'gap' || original.workspaceId === comparison.workspaceId ||
        lighthouseEvidenceReplayDirectory(dirname(original.cwd), comparison.id) !== comparison.cwd) return
    } else if (original.cwd !== comparison.cwd || original.workspaceId !== comparison.workspaceId) return
    const pinned = original.loadout ?? original.plans?.[arm]
    if (pinned && (pinned.presetId !== presetId || pinned.identity !== identity)) return
    return { original, comparisons, view: { kind, comparisonId, arm, sessionId,
      ...(original.change && { change: original.change }), ...(original.lesson && { lesson: original.lesson }) } }
  }

  async function readRematchBaseline(comparison, previous, signal, { verifyPersonalDelivery = false, publicReview = false } = {}) {
    const { arm, sessionId, heroName, planName } = comparison.baseline
    const id = 'baseline'
    const missing = { id, sessionId, heroName, planName, status: 'unavailable', reason: 'session-unavailable' }
    if (!previous) return missing
    if (previous.personal) {
      const original = await personalRematchEvidence(previous.personal, signal)
      if (!original || original.sessionId !== sessionId || original.evidenceReplay !== previous.personal.evidenceReplay) return missing
      const { target, observed, canReuse, presentBinding } = original
      if (target.presetId !== previous.personal.presetId || target.identity !== previous.personal.identity ||
        target.workspaceId !== comparison.workspaceId || target.cwd !== comparison.cwd ||
        target.digest !== comparison.digest || target.material !== comparison.material || target.task !== comparison.task) return missing
      return { id, sessionId, heroName, planName, ...observed, canReuse, canRematch: false, ...(presentBinding && { armoryDelivery: true }) }
    }
    const { comparisons, original } = previous
    const publicReplay = comparison.baseline.publicEvidenceReplay
    const result = await readComparisonArm(comparisons, original, arm, signal,
      { verifyPersonalDelivery, linkedChoicesOnly: publicReplay, includeFileCoordinates: publicReplay || publicReview })
    if (sessionId !== result.sessionId) return missing
    const { lessonTaskSource, ...observed } = result
    return { ...observed, id, heroName, planName, canRematch: false,
      ...(publicReplay ? { canReuse: false } : lessonTaskSource && { lessonTaskSource }) }
  }

  function personalHandoffStyles(record, previous) {
    const { edit, baseline, loadout } = record
    if (baseline?.heroId !== 'standard' || loadout?.heroId !== 'standard' || edit.sourceId !== undefined || baseline.evidenceReplay) return
    const fromOwnTask = baseline.kind === 'personal'
    if (fromOwnTask && edit.addId === 'review' && edit.removeId === undefined) return ['direct', 'review']
    const parent = previous?.original
    const fromOwnReviewRematch = baseline.kind === 'rematch' && parent?.baseline?.kind === 'personal' &&
      parent.edit.addId === 'review' && parent.edit.removeId === undefined && parent.edit.sourceId === undefined
    if ((fromOwnTask || fromOwnReviewRematch) && edit.removeId === 'review' && edit.addId === undefined) return ['review', 'direct']
  }

  function isLighthouseReviewRematch(record, previous) {
    const { baseline, edit, loadout } = record
    return record.lesson === lighthouseLesson && previous?.comparisons === workspaceComparisons &&
      previous.original.lesson === lighthouseLesson && baseline.arm === 'direct' &&
      baseline.heroId === 'standard' && loadout.heroId === 'standard' &&
      edit.addId === 'review' && edit.removeId === undefined && edit.sourceId === undefined
  }

  function reviewedChoice(outcome) {
    return outcome?.arms.find(side => side.style === 'review')
  }

  async function compareReviewChoices(record, current, signal) {
    const normalize = choice => choice.normalize('NFKC').trim().toLowerCase()
    const currentChoice = normalize(current.choices[0])
    if (!currentChoice) return
    const candidates = Array.from(rematchComparisons.list()).filter(other =>
      other.id !== record.id && other.token === record.token && other.workspaceId === record.workspaceId &&
      other.cwd === record.cwd && other.digest === record.digest && other.material === record.material && other.task === record.task)
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    for (let index = 0; index < candidates.length; index += 4) {
      signal?.throwIfAborted()
      const observed = await Promise.all(candidates.slice(index, index + 4).map(candidate =>
        readComparisonArm(rematchComparisons, candidate, 'rematch', signal,
          { verifyPersonalDelivery: true, linkedChoicesOnly: true, includeFileCoordinates: true })))
      for (const arm of observed) {
        if (!verifiedEvidenceArm(arm) || typeof arm.materialDelivered !== 'boolean') continue
        const choices = comparisonChoices(arm)
        if (choices.length !== 1 || !normalize(choices[0]) || normalize(choices[0]) === currentChoice) continue
        const side = ({ sessionId, deliverables, materialDelivered }, choices) => ({ sessionId, deliverables, materialDelivered, choices })
        return { current: side(current, current.choices), other: side(arm, choices) }
      }
    }
  }

  function observedHandoffOutcome(material, arms, styles) {
    if (arms.length !== styles.length || arms.some(arm => arm.status !== 'complete' || arm.continuationReason ||
      typeof arm.materialDelivered !== 'boolean')) return
    const outcomes = arms.map((arm, index) => {
      const choices = comparisonChoices(arm)
      const style = styles[index]
      const { id, materialDelivered, deliverables, canReuse } = arm
      const canPreserve = canReuse && (materialDelivered || choices.length > 0)
      return { id, style, choices, materialDelivered, deliveredCount: deliverables.length, canPreserve: Boolean(canPreserve) }
    })
    if (outcomes.find(arm => arm.style === 'review').choices.length) return { material, arms: outcomes }
  }

  function verifiedEvidenceArm(arm) {
    return arm.status === 'complete' && arm.sessionId && arm.materialState === 'verified' && !arm.continuationReason
  }

  function completedPresentDelivery({ entries = [], deliverables = [] }) {
    return deliverables.length > 0 && entries.some(item => item.name === 'present' && item.state === 'completed')
  }

  function verifiedPresentHandoff(evidence) {
    return evidence.materialState === 'verified' && !evidence.continuationReason && completedPresentDelivery(evidence)
  }

  function observedEvidenceOutcome(arms, sources) {
    const [baseline, replay] = arms
    if (arms.length !== 2 || baseline.id !== 'baseline' || replay.id !== 'rematch' ||
      arms.some(arm => !verifiedEvidenceArm(arm)) ||
      baseline.sessionId === replay.sessionId || !comparisonChoices(baseline).length) return
    return { arms: arms.map(arm => {
      const { id, sessionId, deliverables, canReuse } = arm
      const choices = comparisonChoices(arm)
      const lessonTaskSource = sources?.[id] && (id === 'baseline' || completedPresentDelivery(arm)) ? sources[id] : undefined
      return { id, choices, deliverables, canPreserve: Boolean(canReuse && (choices.length || deliverables.length)),
        ...(sources && { sessionId }),
        ...(lessonTaskSource && { lessonTaskSource }) }
    }) }
  }

  async function readComparisonArms(comparisons, record, signal) {
    const previous = previousComparison(record)
    const styles = comparisons === rematchComparisons && personalHandoffStyles(record, previous)
    const publicReview = comparisons === rematchComparisons && isLighthouseReviewRematch(record, previous)
    const verifyPersonalDelivery = Boolean(styles || publicReview)
    const evidenceReplay = evidenceReplayView(record.baseline)
    const baseline = record.baseline && readRematchBaseline(record, previous, signal, { verifyPersonalDelivery, publicReview })
    const armoryDelivery = styles && previous?.personal && (await baseline)?.armoryDelivery
    const pending = comparisons.armsFor(record).map(arm => readComparisonArm(comparisons, record, arm, signal,
      { verifyPersonalDelivery, linkedChoicesOnly: publicReview || armoryDelivery,
        includeFileCoordinates: evidenceReplay?.publicEvidenceReplay || publicReview || armoryDelivery || Boolean(record.reviewReplaySource) }))
    if (baseline) pending.unshift(baseline)
    const arms = await Promise.all(pending)
    const handoffOutcome = styles && observedHandoffOutcome(record.material, arms, styles)
    const armoryHandoffOutcome = armoryDelivery && handoffOutcome && arms.every(verifiedEvidenceArm) &&
      arms[0].materialDelivered && { ...handoffOutcome, arms: handoffOutcome.arms.map((item, index) => {
        const { sessionId, deliverables } = arms[index]
        return { ...item, sessionId, deliverables }
      }) }
    const review = publicReview && arms.every(verifiedEvidenceArm) && arms[0].materialDelivered &&
      observedHandoffOutcome(record.material, arms, ['direct', 'review'])
    const carryHandoffPair = review && arms.every(arm => arm.lessonTaskSource) &&
      completedPresentDelivery(arms[0]) && singleReviewAnswer(arms[1])
    const publicReviewOutcome = review && { ...review, arms: review.arms.map((item, index) => {
      const { sessionId, deliverables, lessonTaskSource } = arms[index]
      return { ...item, sessionId, deliverables,
        ...(lessonTaskSource && { lessonTaskSource: carryHandoffPair ? { ...lessonTaskSource, handoffPairId: record.id } : lessonTaskSource }) }
    }) }
    const publicTaskSources = evidenceReplay?.publicEvidenceReplay && previous?.original && {
      baseline: { kind: 'workspace', comparisonId: previous.original.id, arm: 'evidence' },
      rematch: { kind: 'rematch', comparisonId: record.id, arm: 'rematch' },
    }
    const evidenceOutcome = evidenceReplay && observedEvidenceOutcome(arms, publicTaskSources)
    return { arms, ...(previous?.view && { previous: previous.view }), ...(handoffOutcome && { handoffOutcome }),
      ...(publicReviewOutcome && { publicReviewOutcome }), ...(armoryHandoffOutcome && { armoryHandoffOutcome }),
      ...evidenceReplay, ...(evidenceOutcome && { evidenceOutcome }) }
  }

  function comparisonChoices({ entries = [] }) {
    return [...new Set(entries.flatMap(entry => entry.name === 'ask_user_question' && entry.state === 'completed' ? entry.choices ?? [] : []))]
  }

  function reusableComparisonArm(arm, result) {
    if (result.status !== 'complete') return false
    if (arm === 'review') return comparisonChoices(result).length > 0
    if (arm === 'recon') return result.entries.some(entry => entry.name === 'glob' && entry.state === 'completed')
    if (arm === 'rematch' || planComparisonArms.includes(arm)) {
      return result.deliverables.length > 0 || result.entries.some(entry => entry.state === 'completed')
    }
    return result.deliverables.length > 0
  }

  function comparisonHistoryOrder(a, b) {
    return b.createdAt - a.createdAt || b.id.localeCompare(a.id) || b.kind.localeCompare(a.kind)
  }

  async function lighthouseRunList({ before, code }, signal, completed = false) {
    const sampleLanguage = completed && code !== undefined ? decodeLighthouseReviewReport(code).language : undefined
    const order = (a, b) => b.createdAt - a.createdAt || b.sessionId.localeCompare(a.sessionId)
    let previous
    if (before !== undefined) {
      const fields = typeof before === 'string' && /^(\d{1,16}):(session-[a-f0-9]{32})$/.exec(before)
      if (!fields || !Number.isSafeInteger(Number(fields[1]))) throw new Error(completed
        ? '找不到这页灯塔交接战报。' : '找不到这页待发送的灯塔对局。')
      previous = { createdAt: Number(fields[1]), sessionId: fields[2] }
    }
    const handoffCandidates = (sourceKind, store, defaultArm) => Array.from(store.list()).filter(record => {
      const language = lighthouseReviewLanguage(record)
      return language && (!sampleLanguage || language === sampleLanguage)
    })
      .map(record => ({ record, store, sourceKind, arm: record.reviewChallengeArm ?? defaultArm, kind: 'delivery-review' }))
    const candidates = (completed ? [
      ...handoffCandidates('workspace', workspaceComparisons, 'direct'),
      ...handoffCandidates('rematch', rematchComparisons, 'rematch'),
    ] : [
      ...Array.from(workspaceComparisons.list()).flatMap(record => {
        if (record.lesson === evidenceLesson) return [{ record, store: workspaceComparisons, arm: 'evidence', kind: 'evidence' }]
        if (record.reviewChallengeArm) return [{ record, store: workspaceComparisons, arm: record.reviewChallengeArm, kind: 'delivery-review' }]
        return []
      }),
      ...Array.from(heroTrials.list()).flatMap(record => lighthouseHeroArms.map(arm => ({
        record, store: heroTrials, arm, kind: 'hero',
      }))),
    ]).map(candidate => ({
      ...candidate, createdAt: candidate.record.createdAt,
      sessionId: candidate.store.identity(candidate.record.id, candidate.arm).sessionId,
    })).filter(candidate => !previous || order(candidate, previous) > 0).sort(order)
    const registry = ctx.get('workspaceRegistry')
    async function readRun({ record, store, arm, kind, sourceKind, sessionId, createdAt }) {
      try {
        const saved = await store.readArm(record.id, arm)
        const workspace = saved && registry?.get(saved.workspaceId)
        if (!workspace || saved.opened !== true || workspace.path !== saved.cwd || !workspace.sessionIds.includes(sessionId)) return
        if (kind !== 'hero' && (record.workspaceId !== saved.workspaceId || record.cwd !== saved.cwd)) return
        if (completed) {
          const result = await verifiedReviewHandoff(store, record, arm, signal)
          if (result) return { kind, sourceKind, comparisonId: record.id, arm, sessionId, createdAt,
            played: result.played, sampleLanguage: result.language, decision: result.decision, originalAttached: result.originalAttached }
          return
        }
        if (kind === 'delivery-review' && await workspaceMaterialState(record, signal) !== 'verified') return
        const result = kind === 'hero' ? await readHeroTrialArm(record, arm, signal)
          : await readComparisonArm(store, record, arm, signal)
        if (result.status === 'waiting') return { kind, sessionId, createdAt,
          ...(kind === 'evidence' ? { scenario: record.scenario }
            : kind === 'delivery-review' ? { arm, sampleLanguage: lighthouseReviewLanguage(record) } : { arm, need: record.need }),
          ...(result.presetChanged && { presetChanged: true }) }
      } catch {
        signal?.throwIfAborted()
      }
    }
    const items = []
    const pageSize = 12
    const scanLimit = completed ? Math.min(candidates.length, 48) : candidates.length
    let inspected = 0
    while (inspected < scanLimit && items.length < pageSize) {
      signal?.throwIfAborted()
      const batch = candidates.slice(inspected, inspected + Math.min(6, pageSize - items.length, scanLimit - inspected))
      const results = await Promise.all(batch.map(readRun))
      items.push(...results.filter(Boolean))
      inspected += batch.length
    }
    const last = candidates[inspected - 1]
    return { items, ...(sampleLanguage && { sampleLanguage }),
      ...(last && inspected < candidates.length && { before: `${last.createdAt}:${last.sessionId}` }) }
  }

  async function comparisonHistory({ query = '', kind = 'all', outcome = 'all', before, scope, probe = false }, signal) {
    const evidenceReplays = scope === 'evidence-replays'
    if (typeof query !== 'string' || query.length > 200 || !['all', ...Object.keys(comparisonStores)].includes(kind) ||
      !['all', 'delivered', 'decisions'].includes(outcome) || (scope !== undefined && !evidenceReplays) ||
      typeof probe !== 'boolean' || (probe && !evidenceReplays)) throw new Error('实战记录筛选无效，请重新选择。')
    let older
    if (before !== undefined) {
      const fields = typeof before === 'string' && /^(\d{1,16}):(workspace|lighthouse|plans|rematch):([a-f0-9]{32})$/.exec(before)
      if (!fields || !Number.isSafeInteger(Number(fields[1]))) throw new Error('找不到这页实战记录。')
      older = { createdAt: Number(fields[1]), kind: fields[2], id: fields[3] }
    }
    const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/u).filter(Boolean)
    const registry = ctx.get('workspaceRegistry')
    const groups = Object.entries(comparisonStores).filter(([category]) =>
      (kind === 'all' || kind === category) && (!evidenceReplays || category === 'rematch'))
    const headings = { lighthouse: '灯塔补给行动 Lighthouse Supply Run', workspace: '实战同题对照 Workspace comparison',
      plans: '方案同题对照 Saved plan comparison', rematch: '单件换装对照 换装复赛 One-gear rematch Gear rematch' }
    const matches = groups.flatMap(([category, store]) =>
      Array.from(store.list(), record => {
        const { createdAt, id, task, material, workspaceId } = record
        const workspaceTitle = registry?.get(workspaceId)?.title ?? record.workspaceTitle
        const title = category === 'lighthouse' ? '灯塔补给行动'
          : (record.brief ?? task.split('\n').slice(2, -1).join(' ')).trim().slice(0, 120) || headings[category].split(' ')[0]
        return { id, kind: category, createdAt, title, material, workspaceTitle, store, record, change: record.change, lesson: record.lesson,
          ...(record.lesson === evidenceLesson && { scenario: record.scenario }),
          ...(record.baseline?.evidenceReplay && { evidenceReplay: true }),
          ...(record.baseline?.publicEvidenceReplay && { publicEvidenceReplay: true }) }
      }).filter(item => {
        if (evidenceReplays && !item.evidenceReplay) return false
        if (older && comparisonHistoryOrder(item, older) <= 0) return false
        const workspaceName = item.workspaceTitle === 'default-workspace' ? 'default-workspace 默认工作区 Default workspace' : item.workspaceTitle
        const planLabels = item.record.plans && Object.values(item.record.plans).flatMap(({ planName, heroName }) => [planName, heroName])
        const searchable = [headings[item.kind], workspaceName, item.material, item.record.task, ...(planLabels ?? []),
          item.evidenceReplay ? '证据换装对照 Evidence gear comparison' : undefined,
          item.publicEvidenceReplay ? '灯塔证据换装对照 Lighthouse evidence replay' : undefined,
          item.lesson === lighthouseLesson ? '灯塔换装练习 Lighthouse rematch lesson' : undefined,
          item.scenario === 'gap' ? '灯塔证据取舍 Lighthouse evidence choices 关键证据缺失 Missing key evidence'
            : item.scenario === 'confirmed' ? '灯塔证据取舍 Lighthouse evidence choices 证据齐全 Evidence available' : undefined,
          item.record.baseline?.planName, item.record.baseline?.heroName, item.change?.added?.name, item.change?.removed?.name]
          .join('\n').normalize('NFKC').toLowerCase()
        return words.every(word => searchable.includes(word))
      })).sort(comparisonHistoryOrder)

    const pageSize = probe ? 1 : 12
    const scanLimit = evidenceReplays ? matches.length : Math.min(matches.length, outcome === 'all' ? pageSize : 48)
    const items = []
    let inspected = 0
    while (inspected < scanLimit && items.length < pageSize) {
      signal?.throwIfAborted()
      const group = matches.slice(inspected, inspected + Math.min(6, pageSize - items.length, scanLimit - inspected))
      const cards = await Promise.all(group.map(async ({ store, record, ...item }) => {
        const { arms: observed, previous, evidenceOutcome } = await readComparisonArms(store, record, signal)
        if (evidenceReplays && !evidenceOutcome) return null
        const arms = observed.map(arm => {
          const { id, status, sessionId, turn, deliverables, reason, continuationReason, canReuse, canRematch, planName, heroName, lessonTaskSource } = arm
          const choices = comparisonChoices(arm)
          return { id, status, sessionId, turn, deliverables, choices, reason, continuationReason, planName, heroName, canReuse: Boolean(canReuse),
            ...(canRematch && { canRematch }), ...(lessonTaskSource && { lessonTaskSource }), pending: Boolean(arm.pendingQuestions?.length) }
        })
        return { ...item, arms, ...(previous && { previous }) }
      }))
      inspected += cards.length
      items.push(...cards.filter(item => item && (outcome === 'all' || item.arms.some(arm =>
        (outcome === 'delivered' ? arm.deliverables : arm.choices)?.length))))
    }
    if (probe) return { available: items.length > 0 }
    const last = matches[inspected - 1]
    return { items, ...(last && inspected < matches.length && { before: `${last.createdAt}:${last.kind}:${last.id}` }) }
  }

  function recordedComparisonGear(original, draft, ecosystem, art, choices) {
    return (original?.equipmentIds ?? []).map(key => {
      const id = currentEquipmentId(key, ecosystem)
      const card = equipmentById.get(id) ?? ecosystem.equipment.get(id)
      const sourceId = draft.equipmentSources[id]
      return { id, name: original?.equipmentLabels?.[key] ?? card?.name ?? id, kind: card?.kind ?? 'featured',
        art: art('gear', id, sourceId), sourceName: original?.equipmentSourceLabels?.[key],
        evidence: (id === 'review' || id === 'evidence') && choices.length ? 'decision' : 'equipped' }
    })
  }

  async function observeLessonTask(sessionId, signal, strict = false) {
    const source = await observePlanTask(sessionId, signal, 'all')
    if (!source) return
    try {
      const { header, launch } = planTaskDetails(source)
      if (!launch || (launch.armory !== true && (!launch.source || !validLessonTaskReference(launch.source)))) return
      const ownHandoff = Boolean(launch.source?.handoffPairId)
      const verifyEvidence = launch.armory === true || ownHandoff ||
        isEvidenceLessonSource(launch.source) || isPublicEvidenceReplaySource(launch.source) ||
        isHeroTrialTaskSource(launch.source)
      const { cwd, agentPreset: presetId } = header
      const target = personalTaskTarget(launch, header)
      if ((strict || verifyEvidence) && !target) return
      const evidence = await comparisonEvidence(source, { cwd, presetId, task: launch.task, material: launch.material,
        verifyMaterialProof: strict || verifyEvidence, verifyMaterialDelivery: true, exactMessages: true,
        linkedChoicesOnly: verifyEvidence, includeWindows: !strict, includeFileCoordinates: launch.armory === true || ownHandoff }, receipts)
      const textBinding = launch.source && isMinimalTrialSource(launch.source) && target.textBinding
      if (textBinding?.tool === 'bash' && evidence.status === 'complete' && !evidence.continuationReason &&
        !evidence.deliverables.length && observedTextHandoff(source.events, evidence.turn, textBinding) &&
        await personalTaskMaterialState(target, signal) === 'verified') evidence.textHandoff = true
      const usesVerifiedDelivery = launch.armory === true ? presetId === 'standard' : isHeroTrialTaskSource(launch.source)
      const presentBinding = usesVerifiedDelivery && evidence.materialDelivered &&
        observedMaterialDelivery(source.events, evidence.turn, cwd, launch.material)
      return { launch, cwd, presetId, evidence, target, ...(presentBinding && { presentBinding }) }
    } finally {
      source[Symbol.dispose]()
    }
  }

  async function personalRematchEvidence(selection, signal) {
    if (selection.kind !== 'personal' || !validRematchReference(selection)) return
    const sessionId = 'session-' + selection.comparisonId
    const original = await observeLessonTask(sessionId, signal, true)
    if (!original) return
    const { target, evidence, presetId, presentBinding, launch } = original
    const record = records.get(presetId)
    const hero = matchHero(presetId, record)
    if (launch.armory === true) {
      const canReuse = evidence.status === 'complete' && Boolean(presentBinding) && verifiedPresentHandoff(evidence) &&
        !evidence.entries.some(item => item.name === 'ask_user_question')
      return { sessionId, target, hero, observed: evidence, canReuse, stockStandardTask: canReuse, presentBinding }
    }
    const evidenceReplay = isEvidenceLessonSource(launch.source)
    const choices = comparisonChoices(evidence)
    if (evidenceReplay && (original.launch.source.lesson !== evidenceLesson || hero.id !== 'standard' ||
      record?.equipmentIds.length !== 2 || !record.equipmentIds.includes('evidence') || !record.equipmentIds.includes('present'))) return
    const canReuse = evidence.status === 'complete' && (isHeroTrialTaskSource(original.launch.source)
      ? verifiedPresentHandoff(evidence) && evidence.materialDelivered
      : evidenceReplay ? !evidence.continuationReason && choices.length > 0 : evidence.materialDelivered || choices.length > 0)
    return { sessionId, target, hero, observed: evidence, canReuse, stockStandardTask: isStandardTrialSource(original.launch.source),
      ...(evidenceReplay && { evidenceReplay }) }
  }

  async function armoryReviewReference(sessionId, signal) {
    const reference = { kind: 'personal', comparisonId: sessionId.slice('session-'.length), arm: 'task' }
    try {
      const checked = await checkedPersonalRematchBaseline(reference, signal)
      if ((await personalHandoffSuggestion(reference, checked, signal))?.addId === 'review') return reference
    } catch {
      signal?.throwIfAborted()
    }
  }

  function completedPersonalHandoff(evidence, style) {
    return evidence.status === 'complete' && evidence.materialState === 'verified' && !evidence.continuationReason &&
      (style === 'direct' ? evidence.materialDelivered && completedPresentDelivery(evidence) : Boolean(singleReviewAnswer(evidence)))
  }

  const personalLoadoutUnavailable = '这局还没有可复用出装的实战记录。'

  async function personalHandoffAlternate(sessionId, { launch, target, evidence }, signal) {
    if (!launch.source?.handoffPairId || !target ||
      !ctx.get('workspaceRegistry')?.get(target.workspaceId)?.sessionIds.includes(sessionId)) return
    const brief = personalTaskBrief(launch.task)
    if (!brief || evidence.status !== 'complete') return
    const proof = await matchedHandoffTaskPair(launch.source, signal)
    if (!proof) return
    if (!completedPersonalHandoff(evidence, proof.selected.style) ||
      await personalTaskMaterialState(target, signal) !== 'verified') return
    return { source: proof.alternate.lessonTaskSource, style: proof.alternate.style,
      rebaseline: { workspaceId: target.workspaceId, material: target.material, brief } }
  }

  function sameHandoffTask(left, right) {
    return left && right && ['workspaceId', 'cwd', 'digest', 'material'].every(key => left[key] === right[key]) &&
      personalTaskBrief(left.task) === personalTaskBrief(right.task)
  }

  function sameHandoffSource(left, right) {
    return left && right && ['kind', 'comparisonId', 'arm', 'handoffPairId'].every(key => left[key] === right[key])
  }

  async function sameHandoffOrigin(sessionId, source, current, signal) {
    const original = await observeLessonTask(sessionId, signal, true)
    if (!sameHandoffTask(original?.target, current)) return
    const alternate = await personalHandoffAlternate(sessionId, original, signal)
    if (sameHandoffSource(alternate?.source, source)) return sessionId
  }

  async function personalHandoffPair(sessionId, current, alternate, signal) {
    const { launch, target } = current
    const sourceId = launch.handoffAlternateOf
    if (!alternate || typeof sourceId !== 'string' || !heroAlternateSessionId.test(sourceId) || sourceId === sessionId) return
    const original = await observeLessonTask(sourceId, signal, true)
    if (!sameHandoffTask(original?.target, target) || !sameHandoffSource(original.launch.source, alternate.source) ||
      !completedPersonalHandoff(original.evidence, alternate.style)) return
    return [{ sessionId: sourceId, style: alternate.style, result: original },
      { sessionId, style: alternate.style === 'direct' ? 'review' : 'direct', result: current }]
  }

  function personalHandoffPairResult(arms) {
    return { material: arms[0].result.target.material, arms: arms.map(({ sessionId, style, result }) => {
      const { materialDelivered, deliverables } = result.evidence
      return { id: style, style, sessionId, materialDelivered, deliverables, canPreserve: true,
        deliveredCount: deliverables.length, choices: comparisonChoices(result.evidence) }
    }) }
  }

  async function verifiedPersonalHandoffSelection(sessionId, result, pairSide, signal) {
    const alternate = result && await personalHandoffAlternate(sessionId, result, signal)
    let picked
    if (alternate && pairSide === 'current') {
      picked = { sessionId, style: alternate.style === 'direct' ? 'review' : 'direct', result }
    } else if (alternate) {
      const arms = await personalHandoffPair(sessionId, result, alternate, signal)
      picked = arms?.find(item => item.style === pairSide)
    }
    if (!picked) throw new Error(personalLoadoutUnavailable)
    const { launch, presetId, target, evidence } = picked.result
    const checked = await verifiedLessonTaskSource(launch.source, signal)
    if (checked.proof.presetId !== presetId || checked.proof.identity !== target.identity) {
      throw new Error('本机配置已变化，无法核对这局的原出装。')
    }
    const token = createHash('sha256').update(JSON.stringify([planTaskOwner, sessionId, pairSide, picked.sessionId,
      target.digest, target.identity, evidence.turn, evidence.materialDelivered, comparisonChoices(evidence), evidence.deliverables])).digest('hex')
    return { ...picked, checked, keep: { sessionId, pairSide, token } }
  }

  async function savePersonalHandoffPlan({ sessionId, pairSide, token, name, note }, signal) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    if (!['current', 'direct', 'review'].includes(pairSide) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error(personalLoadoutUnavailable)
    }
    const picked = await verifiedPersonalHandoffSelection(sessionId, await observeLessonTask(sessionId, signal), pairSide, signal)
    if (picked.keep.token !== token) throw new Error(personalLoadoutUnavailable)
    const { result, checked } = picked
    return buildPlans.write({ name, note }, checked.draft.presetId, async () => {
      if (await personalTaskMaterialState(result.target, signal) !== 'verified') throw new Error(personalLoadoutUnavailable)
      signal?.throwIfAborted()
      return { presetId: result.presetId, heroId: checked.draft.presetId, heroName: checked.view.heroName,
        handoffOrigin: { sessionId: picked.sessionId, style: picked.style } }
    })
  }

  async function readPlanHandoffOrigin({ id, revision }, signal) {
    const { presetId, handoffOrigin } = buildPlans.read(id, revision)
    const unavailable = '这份方案的实测来源已不可查看。'
    if (!handoffOrigin) throw new Error(unavailable)
    const { sessionId, style } = handoffOrigin
    const run = await observeLessonTask(sessionId, signal, true)
    const source = run?.launch.source
    const direct = source?.kind === 'workspace' && source.arm === 'direct'
    const workspace = run && ctx.get('workspaceRegistry')?.get(run.target.workspaceId)
    if (!source?.handoffPairId || direct !== (style === 'direct') || run.presetId !== presetId || !workspace ||
      workspace.path !== run.cwd || !workspace.sessionIds.includes(sessionId) || !completedPersonalHandoff(run.evidence, style)) {
      throw new Error(unavailable)
    }
    buildPlans.read(id, revision)
    signal?.throwIfAborted()
    const { materialDelivered, deliverables, entries } = run.evidence
    return { sessionId, style, materialDelivered, choices: comparisonChoices(run.evidence),
      tools: [...new Set(entries.filter(entry => entry.state === 'completed').map(entry => entry.name))],
      fileNames: deliverables.map(file => file.name) }
  }

  async function readLessonTaskResult({ sessionId, review, pairSide }, signal) {
    const pairReview = pairSide !== undefined
    const handoffReview = pairSide === 'direct' || pairSide === 'review'
    if (pairReview && (review !== true || (!handoffReview && pairSide !== 'original' && pairSide !== 'alternate'))) {
      throw new Error(personalLoadoutUnavailable)
    }
    let resultView = await observeLessonTask(sessionId, signal)
    let handoff
    if (handoffReview) {
      handoff = await verifiedPersonalHandoffSelection(sessionId, resultView, pairSide, signal)
      sessionId = handoff.sessionId
      resultView = handoff.result
    } else if (pairReview) {
      const pair = resultView && await personalHeroPair(sessionId, resultView, signal)
      const picked = pair?.[pairSide]
      if (!picked?.result.presentBinding) throw new Error(personalLoadoutUnavailable)
      sessionId = picked.sessionId
      resultView = picked.result
    }
    if (!resultView) return null
    const { launch, cwd, presetId, evidence: observed, target } = resultView
    const { windows = [], ...evidence } = observed
    const choices = comparisonChoices(evidence)
    const armory = launch.armory === true
    const evidenceSource = !armory && isEvidenceLessonSource(launch.source)
    const publicReplay = !armory && isPublicEvidenceReplaySource(launch.source)
    const heroDeliveryTrial = !armory && isHeroTrialTaskSource(launch.source)
    const delivered = evidenceSource ? evidence.deliverables?.length > 0 : evidence.materialDelivered
    const minimalText = !armory && isMinimalTrialSource(launch.source)
    const deliveryVerified = publicReplay || heroDeliveryTrial
      ? verifiedPresentHandoff(evidence) && (!heroDeliveryTrial || evidence.materialDelivered)
      : (delivered || choices.length > 0) && (!evidenceSource || !evidence.continuationReason)
    const canReview = evidence.status === 'complete' && (minimalText ? evidence.textHandoff === true : deliveryVerified)
    const receiptIds = windows.map(({ endSeq }) => sessionId + ':' + endSeq)
    const canContinue = canReview && (!publicReplay || evidence.materialDelivered)
    const reference = canContinue && target && !minimalText && (!evidenceSource || choices.length > 0) &&
      { kind: 'personal', comparisonId: sessionId.slice('session-'.length), arm: 'task' }
    const [settled, original, alternateTask, heroPair] = await Promise.all([
      growth.settlementAwards(sessionId, receiptIds),
      reference && personalRematchEvidence(reference, signal),
      canReview && review !== true && heroAlternateTaskOption(sessionId, resultView, signal),
      review !== true && personalHeroPair(sessionId, resultView, signal),
    ])
    const sourceTrial = !alternateTask && canReview && review !== true && await pendingStandardTrial(resultView, signal)
    const awards = settled.filter(item => item.kind)
      .map(({ id, name, kind, xp, sourceName }) => ({ id, name, kind, xp, ...(sourceName && { sourceName }) }))
    const workspace = canContinue && !evidenceSource && ctx.get('workspaceRegistry')?.list()
      .find(item => item.path === cwd && item.sessionIds.includes(sessionId))
    const brief = personalTaskBrief(launch.task)
    let rematchSource = original?.canReuse ? reference : undefined
    let rebaseline = !armory && workspace && brief ? { workspaceId: workspace.id, material: launch.material, brief } : undefined
    let armoryDraft, armoryReason
    if (armory && rematchSource) {
      const state = await personalTaskMaterialState(target, signal)
      if (state !== 'verified') {
        rematchSource = undefined
        armoryReason = state === 'changed' ? '材料已变化，请用现在的文件开始新的对照。'
          : '无法读取所选材料，请核对工作区内的文件路径。'
        if (workspace?.id === target.workspaceId && brief) {
          rebaseline = { workspaceId: workspace.id, material: launch.material, brief }
          armoryDraft = { draft: { presetId, equipmentIds: [], equipmentSources: {}, removedEquipmentIds: [] }, heroName: launch.planName }
        }
      } else {
        try {
          const checked = await checkedPersonalRematchBaseline(reference, signal, original)
          if ((await personalHandoffSuggestion(reference, checked, signal))?.addId !== 'review') rematchSource = undefined
        } catch (error) {
          signal?.throwIfAborted()
          rematchSource = undefined
          if (error instanceof Error) armoryReason = error.message
        }
      }
    }
    const handoffAlternate = canReview && review !== true && await personalHandoffAlternate(sessionId, resultView, signal)
    const handoffPair = handoffAlternate && await personalHandoffPair(sessionId, resultView, handoffAlternate, signal)
    signal?.throwIfAborted()
    const result = { source: launch.source, material: launch.material, ...evidence,
      receiptIds, ...(armory && { armory }), ...(awards.length && { awards }), ...(canReview && { canReview }),
      ...(rematchSource && { rematchSource }), ...(rebaseline && { rebaseline }),
      ...(alternateTask && { alternateTask }),
      ...(handoffAlternate && { handoffAlternate }),
      ...(handoffPair && { handoffPair: personalHandoffPairResult(handoffPair) }),
      ...(sourceTrial && { sourceTrial }),
      ...(heroPair && { heroPair: personalHeroPairResult(heroPair) }),
      ...(armoryDraft && { armoryDraft }), ...(armoryReason && { reason: armoryReason }) }
    if (review !== true || !canReview) return result
    try {
      const uploaded = await appearance.index()
      let checked, heroName
      if (!pairReview && launch.source?.handoffPairId) {
        handoff = await verifiedPersonalHandoffSelection(sessionId, resultView, 'current', signal)
      }
      if (handoff) {
        checked = handoff.checked
        heroName = checked.view.heroName
      } else if (armory) {
        const ecosystem = await discover()
        const native = matchHero(presetId, records.get(presetId))
        checked = { ...await verifiedPlanComparisonArm({ presetId, heroId: native.id }, ecosystem), ecosystem }
        if (!matchesLessonIdentity(target.identity, checked.identity, checked.draft, checked.candidate, ecosystem)) {
          throw new Error('本机配置已变化，无法核对这局的原出装。')
        }
        heroName = native.name
      } else {
        checked = await verifiedLessonTaskSource(launch.source, signal)
        const pinned = pairReview || isStockTrialSource(launch.source)
        const sourceChanged = pairReview && (checked.proof.sessionId !== launch.source.sessionId ||
          !isDeepStrictEqual(resultView.presentBinding, checked.deliveryBinding ??
            checked.stockBindings?.find(binding => binding.tool === 'present')))
        if (checked.proof.presetId !== presetId || (pinned && checked.proof.identity !== target?.identity) || sourceChanged) {
          throw new Error('本机配置已变化，无法核对这局的原出装。')
        }
        heroName = checked.view.heroName
      }
      const { draft, candidate, ecosystem } = checked
      const art = packageArt(uploaded, ecosystem)
      const hero = { id: draft.presetId, name: heroName, art: art('hero', draft.presetId) }
      const gear = recordedComparisonGear(records.get(presetId), draft, ecosystem, art, choices)
      const removed = historicalRemovals(candidate, presetEquipment(ecosystem, draft.presetId), ecosystem)
      const comparison = await compare(draft, ecosystem, candidate)
      signal?.throwIfAborted()
      return { ...result, sessionId, hero, draft, gear, removed, comparison,
        ...(handoff && { handoffKeep: handoff.keep, handoffStyle: handoff.style }) }
    } catch (error) {
      signal?.throwIfAborted()
      return { ...result, reason: error instanceof Error ? error.message : '本机配置已变化，无法核对这局的原出装。' }
    }
  }

  async function comparisonLoadout({ kind, comparisonId, arm }, signal) {
    const store = Object.hasOwn(comparisonStores, kind) ? comparisonStores[kind] : undefined
    const record = store?.read(comparisonId)
    if (record?.baseline && arm === 'baseline') {
      const observed = await readRematchBaseline(record, previousComparison(record), signal)
      if (!observed.canReuse) throw new Error('这局还没有可复用出装的实战记录。')
      if (record.baseline.kind === 'personal') return readLessonTaskResult({ sessionId: record.baseline.sessionId, review: true }, signal)
      return comparisonLoadout(record.baseline, signal)
    }
    if (!record || !store.armsFor(record).includes(arm)) throw new Error('找不到这局实战对照。')
    const observed = await readComparisonArm(store, record, arm, signal)
    if (!observed.canReuse) throw new Error('这局还没有可复用出装的实战记录。')
    const saved = await store.readArm(comparisonId, arm)
    const original = records.get(saved?.presetId)
    const pinned = record.plans?.[arm] ?? record.loadout
    const heroId = pinned?.heroId ?? original?.baseId ?? 'standard'
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const art = packageArt(uploaded, ecosystem)
    const hero = { id: heroId, name: pinned?.heroName ?? matchHero(heroId, original).name, art: art('hero', heroId) }
    const { sessionId, turn, entries, deliverables } = observed
    const choices = comparisonChoices(observed)
    const workspaceId = ctx.get('workspaceRegistry')?.get(saved?.workspaceId)?.id
    const result = { sessionId, workspaceId, ...planComparisonLabels(record, arm), hero, turn, entries, deliverables, choices, gear: [] }
    if (!saved?.presetId || (!original && saved.presetId !== heroId)) {
      return { ...result, reason: '实战中的原出装目前无法读取。' }
    }
    const draft = recordedLoadoutDraft(original, heroId, ecosystem)
    result.gear = recordedComparisonGear(original, draft, ecosystem, art, choices)
    try {
      signal?.throwIfAborted()
      const verified = pinned && await verifiedPlanComparisonArm(pinned, ecosystem)
      if (pinned && (pinned.presetId !== saved.presetId || verified.identity !== pinned.identity)) {
        throw new Error('本机配置已变化，无法核对这局的原出装。')
      }
      const candidate = verified?.candidate ?? await verifyRecordedLoadout(saved.presetId, draft, ecosystem)
      const comparison = await compare(draft, ecosystem, candidate)
      return { ...result, gear: result.gear.map(item => ({ ...item, available: true })), draft, comparison }
    } catch (error) {
      signal?.throwIfAborted()
      return { ...result, reason: error instanceof Error ? error.message : '本机配置已变化，无法核对这局的原出装。' }
    }
  }

  async function saveEvidenceReplayPlan({ comparisonId, arm, name, note }, signal) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    const record = rematchComparisons.read(comparisonId)
    const unavailable = '这组证据换装还没有可以保留的出装。'
    if (!record?.baseline?.evidenceReplay || (arm !== 'baseline' && arm !== 'rematch')) throw new Error(unavailable)
    const pinned = arm === 'baseline' ? record.baseline : record.loadout
    return buildPlans.write({ name, note }, pinned.heroId, async () => {
      const { evidenceOutcome } = await readComparisonArms(rematchComparisons, record, signal)
      if (!evidenceOutcome?.arms.some(item => item.id === arm && item.canPreserve)) throw new Error(unavailable)
      const ecosystem = await discover()
      const { draft, candidate, identity } = await verifiedPlanComparisonArm(pinned, ecosystem)
      const sameIdentity = arm === 'baseline'
        ? matchesLessonIdentity(pinned.identity, identity, draft, candidate, ecosystem) : pinned.identity === identity
      const saved = arm === 'rematch' && await rematchComparisons.readArm(comparisonId, arm)
      if (!sameIdentity || (arm === 'rematch' && saved?.presetId !== pinned.presetId)) {
        throw new Error('本机配置已变化，无法核对这局的原出装。')
      }
      signal?.throwIfAborted()
      return { presetId: pinned.presetId, heroId: pinned.heroId, heroName: pinned.heroName,
        evidenceOrigin: { comparisonId, arm } }
    })
  }

  function savedEvidenceComparison(plan) {
    if (!plan?.evidenceOrigin) return
    const { comparisonId, arm } = plan.evidenceOrigin
    const record = rematchComparisons.read(comparisonId)
    const pinned = arm === 'baseline' ? record?.baseline : record?.loadout
    if (record?.baseline?.evidenceReplay && pinned?.presetId === plan.presetId && pinned.heroId === plan.heroId) return record
  }

  function matchingEvidenceRetest(left, right) {
    const record = savedEvidenceComparison(left)
    if (record && savedEvidenceComparison(right) === record && left.evidenceOrigin.arm !== right.evidenceOrigin.arm) return record
  }

  function requireEvidenceRetest(plans) {
    const left = buildPlans.read(plans.left.id, plans.left.revision)
    const right = buildPlans.read(plans.right.id, plans.right.revision)
    const record = matchingEvidenceRetest(left, right)
    if (!record) throw new Error('请选择同一次证据换装两侧保存的方案。')
    return record
  }

  async function evidenceRetestOptions({ id, revision }, signal) {
    const selected = buildPlans.read(id, revision)
    const record = savedEvidenceComparison(selected)
    if (!record) return { alternatives: [], workspaceIds: [] }
    const alternatives = buildPlans.list().filter(plan => savedEvidenceComparison(plan) === record &&
      plan.evidenceOrigin.arm !== selected.evidenceOrigin.arm)
    if (!alternatives.length) return { alternatives: [], workspaceIds: [] }
    const [ecosystem, workspaceIds] = await Promise.all([discover(), personalWorkspaceIds(signal)])
    const unavailable = planAvailability(ecosystem)
    buildPlans.read(id, revision)
    signal?.throwIfAborted()
    return { alternatives: unavailable(selected.presetId) ? [] : alternatives.filter(plan => !unavailable(plan.presetId))
      .map(({ id, revision }) => ({ id, revision })), workspaceIds }
  }

  async function readPlanEvidenceOrigin({ id, revision }, signal) {
    const saved = buildPlans.read(id, revision)
    const unavailable = '这份方案的实测来源已不可查看。'
    const record = savedEvidenceComparison(saved)
    if (!record) throw new Error(unavailable)
    const { comparisonId, arm } = saved.evidenceOrigin
    const observed = arm === 'baseline' ? await readRematchBaseline(record, previousComparison(record), signal)
      : await readComparisonArm(rematchComparisons, record, arm, signal)
    if (!verifiedEvidenceArm(observed) || !(comparisonChoices(observed).length || observed.deliverables.length)) throw new Error(unavailable)
    if (arm === 'rematch' && (await rematchComparisons.readArm(comparisonId, arm))?.presetId !== saved.presetId) throw new Error(unavailable)
    buildPlans.read(id, revision)
    signal?.throwIfAborted()
    return { comparisonId, arm, sessionId: observed.sessionId }
  }

  function originalRetestPair(record) {
    let reference = record.evidenceRetestSource
    if (!reference) {
      // Older retests did not record this link. Recover it only while both saved origins still match.
      const plans = buildPlans.list()
      const left = plans.find(plan => plan.id === record.plans.left.id)
      const right = plans.find(plan => plan.id === record.plans.right.id)
      const source = matchingEvidenceRetest(left, right)
      if (!source) return
      reference = { comparisonId: source.id, left: left.evidenceOrigin.arm, right: right.evidenceOrigin.arm }
    }
    const source = rematchComparisons.read(reference.comparisonId)
    if (!source?.baseline?.evidenceReplay || !planComparisonArms.every(side => {
      const origin = reference[side] === 'baseline' ? source.baseline : source.loadout
      return origin.presetId === record.plans[side].presetId && origin.heroId === record.plans[side].heroId
    })) return
    return { source, reference }
  }

  async function verifiedEvidenceRetest(record, arms, signal) {
    if (arms.length !== 2 || arms.some(arm => !verifiedEvidenceArm(arm))) return
    const original = originalRetestPair(record)
    if (!original) return
    const { source, reference } = original
    const { evidenceOutcome } = await readComparisonArms(rematchComparisons, source, signal)
    if (!evidenceOutcome) return
    return { source, reference, evidenceOutcome }
  }

  function planForRetestNote(record, reference, arm, plans) {
    const pinned = record.plans[arm]
    return plans.find(plan => plan.id === pinned.id && plan.presetId === pinned.presetId && plan.heroId === pinned.heroId &&
      plan.evidenceOrigin?.comparisonId === reference.comparisonId && plan.evidenceOrigin.arm === reference[arm])
  }

  async function readEvidenceRetestOutcome(record, arms, signal) {
    const verified = await verifiedEvidenceRetest(record, arms, signal)
    if (!verified) return
    const { source, reference, evidenceOutcome } = verified
    const plans = buildPlans.list()
    return { source: { kind: 'rematch', comparisonId: source.id, arm: 'rematch', evidenceReplay: true },
      arms: arms.map(arm => {
        const { choices, deliverables } = evidenceOutcome.arms.find(item => item.id === reference[arm.id])
        const canEditPlanNote = planForRetestNote(record, reference, arm.id, plans)
        return { id: arm.id, original: { choices, deliverables }, retest: { choices: comparisonChoices(arm), deliverables: arm.deliverables },
          ...(canEditPlanNote && { canEditPlanNote: true }) }
      }) }
  }

  async function evidenceRetestNote({ comparisonId, arm, revision, note }, signal, save = false) {
    const record = planComparisons.read(comparisonId)
    const unavailable = '这份方案已变化，无法从本次复测修改适用情形。'
    if (!record?.evidenceRetest || !planComparisonArms.includes(arm)) throw new Error(unavailable)
    const { arms } = await readComparisonArms(planComparisons, record, signal)
    const verified = await verifiedEvidenceRetest(record, arms, signal)
    let plan = verified && planForRetestNote(record, verified.reference, arm, buildPlans.list())
    if (!plan) throw new Error(unavailable)
    signal?.throwIfAborted()
    if (save) {
      if (closed) throw new Error('配装服务正在关闭，请重试。')
      if (typeof note !== 'string') throw new Error('使用说明最多 240 字。')
      plan = await buildPlans.write({ id: plan.id, revision, name: plan.name, note })
      updates.notify()
    }
    const { id, revision: currentRevision, name, note: currentNote } = plan
    return { id, revision: currentRevision, name, note: currentNote }
  }

  async function readComparison(comparisons, { comparisonId, sessionId, prototype }, english, signal) {
    let record
    if (sessionId !== undefined) {
      const member = comparisons.member(sessionId)
      if (!member) return null
      record = comparisons.read(member.id)
    } else if (comparisonId !== undefined) {
      record = comparisons.read(comparisonId)
      if (!record) throw new Error('找不到这组同题对照。')
    } else if (prototype !== true) {
      record = comparisons === workspaceComparisons ? comparisons.latest(item => item.lesson === undefined) : comparisons.latest()
    }
    if (!record) return { ...(comparisons === workspaceComparisons && { defaultTask: workspaceComparisonDraft(english) }),
      ...(comparisons === lighthouseComparisons && { task: lighthouseComparisonTask(english) }),
      arms: (comparisons === workspaceComparisons ? workspaceComparisonArms : comparisons.arms).map(id => ({ id, status: 'unopened' })) }
    const { id, task, workspaceId, material } = record
    const workspace = material && ctx.get('workspaceRegistry')?.get(workspaceId)
    const [{ publicReviewOutcome, armoryHandoffOutcome, ...rounds }, materialState] = await Promise.all([
      readComparisonArms(comparisons, record, signal),
      material && (workspace?.path === record.cwd ? workspaceMaterialState(record, signal) : 'unavailable'),
    ])
    const evidenceRetestOutcome = record.evidenceRetest && await readEvidenceRetestOutcome(record, rounds.arms, signal)
    const practice = record.lesson === evidenceLesson && rounds.arms.find(arm => arm.id === 'evidence')
    const evidenceOpeningChoice = record.openingChoice && practice && verifiedEvidenceArm(practice)
      ? { choice: record.openingChoice, actualChoices: comparisonChoices(practice) } : undefined
    const canShareChallenge = completedLighthouseChallenge(record, practice)
    const canShareEvidenceReport = Boolean(observedLighthouseEvidenceReport(record, practice, materialState))
    if (canShareChallenge && materialState === 'verified') practice.canReplayLighthouseEvidence = true
    const currentReview = materialState === 'verified' ? reviewedChoice(publicReviewOutcome) : undefined
    const canRepeatLighthouseReview = currentReview?.choices.length === 1
    const currentReviewArm = record.reviewChallengeArm === 'review' && materialState === 'verified' &&
      rounds.arms.find(arm => arm.id === 'review')
    let directRematchArm = canRepeatLighthouseReview && (currentReview.materialDelivered || currentReview.deliveredCount === 0)
      ? 'rematch' : undefined
    if (currentReviewArm && await verifiedReviewHandoff(comparisons, record, 'review', signal, { observed: currentReviewArm })) {
      directRematchArm = 'review'
    }
    const reviewChoiceComparison = canRepeatLighthouseReview && await compareReviewChoices(record, currentReview, signal)
    const ownPair = record.reviewReplaySource && materialState === 'verified' &&
      await ownReviewPair(record, signal, rounds.arms.find(arm => arm.id === record.reviewChallengeArm))
    return { id, task, workspaceId, workspaceTitle: workspace?.title ?? record.workspaceTitle, material, materialState, ...rounds,
      ...(publicReviewOutcome && materialState === 'verified' && { publicReviewOutcome }),
      ...(record.reviewChallengeArm && { reviewChallengeArm: record.reviewChallengeArm }),
      ...(ownPair && { ownReviewPair: ownPair }),
      ...(armoryHandoffOutcome && materialState === 'verified' && { armoryHandoffOutcome }),
      ...(canRepeatLighthouseReview && { canRepeatLighthouseReview: true }),
      ...(directRematchArm && !ownPair && { directRematchArm }),
      ...(reviewChoiceComparison && { reviewChoiceComparison }),
      ...(record.change && { change: record.change }), ...(record.lesson && { lesson: record.lesson }),
      ...(record.lesson === evidenceLesson && { scenario: record.scenario }), ...(record.evidenceRetest && { evidenceRetest: true }),
      ...(evidenceRetestOutcome && { evidenceRetestOutcome }), ...(evidenceOpeningChoice && { evidenceOpeningChoice }),
      ...(canShareChallenge && { canShareChallenge: true }), ...(canShareEvidenceReport && { canShareEvidenceReport: true }) }
  }

  async function createWorkspaceComparison(comparisons, registry, selection, english, signal) {
    const { launchId, workspaceId } = selection
    const workspace = typeof workspaceId === 'string' && registry.get(workspaceId)
    if (!workspace) throw new Error('请选择一个现有的工作区。')
    const fields = workspaceComparisonTask(selection, english)
    const record = await comparisons.create(launchId, async () => {
      let digest
      try {
        digest = await digestWorkspaceMaterial(workspace.path, fields.material, signal)
      } catch {
        signal?.throwIfAborted()
        throw new Error('无法读取所选材料，请核对工作区内的文件路径。')
      }
      return { ...fields, workspaceId, workspaceTitle: workspace.title, cwd: workspace.path, digest }
    })
    if (record?.workspaceId !== workspaceId || record.material !== fields.material || record.task !== fields.task) {
      throw new Error('本次对照请求与原任务不同，请重新开始。')
    }
    return record
  }

  async function openLighthouseLesson({ launchId, scenario = 'gap', openingChoice, reviewChallengeArm, reviewReplaySource },
    english, signal, lesson = lighthouseLesson, requiredPresetId) {
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    if (!validOpeningId(launchId)) throw new Error('开局请求无效，请重试。')
    const evidence = lesson === evidenceLesson
    if ((evidence && !lighthouseEvidenceScenarios.includes(scenario)) || !validEvidenceOpeningChoice(lesson, scenario, openingChoice)) {
      throw new Error('开局请求无效，请重试。')
    }
    const registry = ctx.get('workspaceRegistry')
    if (!registry?.create || !ctx.get('sessionController')?.create || !ctx.get('sessionQuery')) {
      throw new Error('灯塔练习工作区不可用。')
    }
    const key = lesson + ':' + launchId
    let work = openingLighthouseLessons.get(key)
    if (!work) {
      work = workspaceComparisons.create(key, async () => {
        const { workspace, material, task } = evidence
          ? await lighthouseEvidenceLesson(directory, registry, launchId, english, scenario)
          : await lighthouseRematchLesson(directory, registry, launchId, english)
        const fields = workspaceComparisonTask({ material, task }, english)
        const digest = await digestWorkspaceMaterial(workspace.path, material, signal)
        signal?.throwIfAborted()
        return { ...fields, workspaceId: workspace.id, workspaceTitle: workspace.title, cwd: workspace.path, digest, lesson,
          ...(evidence && { scenario }), ...(openingChoice && { openingChoice }),
          ...(reviewChallengeArm && { reviewChallengeArm }), ...(reviewReplaySource && { reviewReplaySource }) }
      }).finally(() => openingLighthouseLessons.delete(key))
      openingLighthouseLessons.set(key, work)
    }
    const record = await work
    if ((evidence && (record.scenario !== scenario || record.openingChoice !== openingChoice)) ||
      (reviewChallengeArm && (record.reviewChallengeArm !== reviewChallengeArm || lighthouseReviewLanguage(record) !== (english ? 'en' : 'zh')))) {
      throw new Error('本次对照请求与原任务不同，请重新开始。')
    }
    if (reviewChallengeArm && await workspaceMaterialState(record, signal) !== 'verified') throw new Error(challengeChanged)
    const arm = evidence ? 'evidence' : reviewChallengeArm ?? 'direct'
    return openComparisonArm(workspaceComparisons, { comparisonId: record.id, arm }, english, signal, requiredPresetId)
  }

  async function createHeroTrial({ launchId, need }, english, signal) {
    if (!validOpeningId(launchId) || !lighthouseHeroNeeds.includes(need)) throw new Error('请选择这次交接需要什么。')
    const record = await heroTrials.create(launchId, async () => {
      if (!await heroTrialAvailable()) throw new Error(heroTrialUnavailable)
      signal?.throwIfAborted()
      return { need, task: lighthouseHeroTask(english) }
    })
    if (record.need !== need) throw new Error('本次试玩的交接要求已变化，请重新开始。')
    return readHeroTrial(record, signal)
  }

  async function readHeroTrialArm(record, arm, signal, includeBindings = false) {
    const opening = { id: arm, status: 'unopened' }
    const { sessionId } = heroTrials.identity(record.id, arm)
    const unavailable = { id: arm, sessionId, status: 'unavailable', reason: 'session-unavailable' }
    let source
    try {
      const saved = await heroTrials.readArm(record.id, arm)
      if (!saved?.opened) return opening
      const validPreset = arm === lighthouseHeroDelivery ? /^loadout-[a-f0-9]{24}$/.test(saved.presetId) && /^[a-f0-9]{64}$/.test(saved.token)
        : saved.presetId === arm
      if (!validPreset || saved.digest !== heroTrialDigest ||
        ctx.get('workspaceRegistry')?.get(saved.workspaceId)?.path !== saved.cwd) return unavailable
      const material = lighthouseHeroMaterial
      source = await ctx.get('sessionQuery').observeSession(sessionId, { projectionMode: 'all', signal })
      const [result, currentMaterialState] = await Promise.all([
        comparisonEvidence(source, { ...saved, task: record.task, material, exactMessages: true, verifyMaterialDelivery: true }, receipts),
        workspaceMaterialState({ ...saved, material }, signal),
      ])
      const materialState = result.materialState === 'verified' ? currentMaterialState : (result.materialState ?? currentMaterialState)
      const details = { id: arm, sessionId, workspaceId: saved.workspaceId, ...result, materialState }
      if (result.status !== 'complete' || result.continuationReason) return details
      const proof = observedHeroHandoff(source.events, result.turn, saved.cwd, material, lighthouseHeroContents,
        includeBindings ? arm : undefined)
      const meetsNeed = materialState === 'verified' && proof.materialRead && Boolean(proof.summary) &&
        (record.need === 'summary' || proof.originalAttached)
      const { originalFile, ...handoff } = proof
      const deliveryBinding = includeBindings && arm === lighthouseHeroDelivery && meetsNeed &&
        observedMaterialDelivery(source.events, result.turn, saved.cwd, material)
      return { ...details, ...handoff, meetsNeed,
        ...(deliveryBinding && { deliveryBinding }),
        ...(arm === lighthouseHeroDelivery && meetsNeed && originalFile && { originalFile }) }
    } catch {
      signal?.throwIfAborted()
      return unavailable
    } finally {
      source?.[Symbol.dispose]()
    }
  }

  function canReplayHeroDelivery(record, original) {
    return record.need === 'original' && original.status === 'complete' && original.materialState === 'verified' &&
      original.materialRead === true && Boolean(original.summary) && original.originalAttached === false
  }

  function heroDeliveryLessonSource(record, original, replay) {
    if (canReplayHeroDelivery(record, original) && replay.status === 'complete' && replay.materialState === 'verified' &&
      replay.meetsNeed === true && replay.originalAttached === true) {
      return { kind: 'hero-trial', comparisonId: record.id, arm: lighthouseHeroDelivery }
    }
  }

  async function verifiedHeroDeliveryLesson(comparisonId, signal) {
    const record = heroTrials.read(comparisonId)
    const unavailable = '请从已经核验的灯塔练习开始。'
    if (!record) throw new Error(unavailable)
    const [original, replay, saved] = await Promise.all([
      readHeroTrialArm(record, 'minimal', signal), readHeroTrialArm(record, lighthouseHeroDelivery, signal, true),
      heroTrials.readArm(record.id, lighthouseHeroDelivery),
    ])
    const source = heroDeliveryLessonSource(record, original, replay)
    if (!source || !saved?.opened) throw new Error(unavailable)
    const { candidate, ecosystem, identity, token, view } = await checkHeroDeliveryReplay(record, signal, original)
    if (token !== saved.token || candidate.id !== saved.presetId) throw new Error('本机配置已变化，无法核对这局的原出装。')
    const draft = recordedLoadoutDraft(candidate.record, 'minimal', ecosystem)
    const anchor = { ...source, sessionId: replay.sessionId, heroDeliveryTrial: true, gearSource: view.source }
    return { draft, candidate, ecosystem, deliveryBinding: replay.deliveryBinding, proof: { ...anchor, presetId: saved.presetId, identity },
      view: { ...anchor, heroName: presetLabels.get('minimal')?.[0] ?? 'Minimal' } }
  }

  async function verifiedStockTrialLesson(record, observed, signal) {
    const arm = observed.id
    if (!observed.bindings || !verifiedHeroHandoff(observed) || (arm === 'standard'
      ? !observed.originalAttached : record.need !== 'summary' || observed.originalAttached || observed.deliverables.length)) return
    const { ecosystem, sources } = await shareEnvironment()
    if (sources.hero(arm)?.owner.package !== '@deepseek-ai/dsh-web-app') return
    const capabilities = summarizeCapabilities(ecosystem, arm, {})
    const gearSources = observed.bindings.map(({ tool, id, sourceId }) => {
      const current = capabilities.get(id)
      const module = stockTrialTools[arm][tool]
      if (current?.name !== tool || current.sourceId !== sourceId ||
        !ecosystem.unitsByPreset.get(arm)?.some(unit => unit.active && unit.id === sourceId && unit.modules.includes(module))) return
      const provider = sources.packageFor(module)
      if (provider?.package === module) return { tool, name: module, version: provider.version }
    })
    if (!gearSources.every(Boolean)) return
    const { draft, candidate, identity } = await verifiedPlanComparisonArm({ presetId: arm, heroId: arm }, ecosystem)
    signal?.throwIfAborted()
    const stockBindings = observed.bindings
    const reference = { kind: 'hero-trial', comparisonId: record.id, arm }
    const source = { ...reference, sessionId: observed.sessionId }
    return { reference, draft, candidate, ecosystem, stockBindings,
      proof: { ...source, presetId: arm, identity, stockBindings, gearSources },
      view: { ...source, heroName: presetLabels.get(arm)?.[0] ?? arm, gearSources } }
  }

  async function stockTrialTaskReference(record, observed, signal) {
    try {
      return (await verifiedStockTrialLesson(record, observed, signal))?.reference
    } catch {
      signal?.throwIfAborted()
    }
  }

  async function readHeroTrial(record, signal) {
    if (!record) return { arms: lighthouseHeroArms.map(id => ({ id, status: 'unopened' })) }
    const { id, need, task } = record
    const [standard, minimal, replay] = await Promise.all(heroTrials.arms.map(arm => readHeroTrialArm(record, arm, signal,
      arm === 'standard' || arm === 'minimal' && need === 'summary')))
    const arms = await Promise.all([standard, minimal].map(async observed => {
      const lessonTaskSource = await stockTrialTaskReference(record, observed, signal)
      const { bindings, ...view } = observed
      return { ...view, ...(lessonTaskSource && { lessonTaskSource }) }
    }))
    const lessonTaskSource = heroDeliveryLessonSource(record, minimal, replay)
    const { originalFile, ...replayView } = replay
    return { id, need, task, material: lighthouseHeroMaterial, arms,
      ...([standard, minimal].some(verifiedHeroHandoff) && { canShareHeroChallenge: true }),
      ...(lessonTaskSource && { deliveryReplay: { sessionId: replay.sessionId, originalFile } }),
      ...(replay.status !== 'unopened' ? { minimalReplay: { ...replayView, ...(lessonTaskSource && { lessonTaskSource }) } }
        : canReplayHeroDelivery(record, minimal) && { canReplayMinimalDelivery: true }) }
  }

  async function checkHeroDeliveryReplay(record, signal, observedOriginal) {
    if (!record) throw new Error(heroDeliveryUnavailable)
    const original = observedOriginal ?? await readHeroTrialArm(record, 'minimal', signal)
    if (!canReplayHeroDelivery(record, original)) throw new Error(heroDeliveryUnavailable)
    const ecosystem = await discover()
    if (!await heroTrialAvailable(ecosystem, ['minimal'])) throw new Error(heroDeliveryChanged)
    const againstDraft = { presetId: 'minimal', equipmentIds: [] }
    const draft = { ...againstDraft, equipmentIds: ['present'] }
    const [candidate, baseline] = await Promise.all([plan(draft, ecosystem), plan(againstDraft, ecosystem)])
    const comparison = await compare({ ...draft, againstDraft }, ecosystem, candidate, baseline)
    const gainedTools = comparison.gained.filter(item => item.kind === 'tool').map(item => item.name)
    if (candidate.id === 'minimal' || !isDeepStrictEqual(gainedTools, ['present']) || comparison.lost.length ||
      comparison.timingChanges.length || comparison.sourceChanges.length) throw new Error(heroDeliveryChanged)
    const provider = ctx.pluginPackages.packageOf(equipmentById.get('present').module, ctx.baseUrl)
    if (!provider || provider.name !== equipmentById.get('present').module) throw new Error(heroDeliveryChanged)
    const source = { name: provider.name, version: provider.version ?? provider.manifest?.version }
    const identity = loadoutIdentity(draft, candidate, ecosystem)
    const token = createHash('sha256').update(JSON.stringify([record.id, record.task, original.sessionId,
      original.workspaceId, heroTrialDigest, identity, source])).digest('hex')
    signal?.throwIfAborted()
    return { draft, candidate, ecosystem, identity, token, view: { task: record.task, material: lighthouseHeroMaterial, comparison, source, token } }
  }

  async function openHeroDeliveryReplay({ comparisonId, token }, english, signal) {
    const record = heroTrials.read(comparisonId)
    if (!record || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error(heroDeliveryChanged)
    const saved = await heroTrials.readArm(comparisonId, lighthouseHeroDelivery)
    const checked = saved?.opened ? { token: saved.token } : await checkHeroDeliveryReplay(record, signal)
    if (token !== checked.token) throw new Error(heroDeliveryChanged)
    return openComparisonArm(heroTrials, { comparisonId, arm: lighthouseHeroDelivery }, english, signal, undefined, checked)
  }

  async function openComparisonArm(comparisons, selection, english, signal, requiredPresetId, heroReplay) {
    const { comparisonId, arm, launchId } = selection
    const heroTrial = comparisons === heroTrials
    const heroDelivery = heroTrial && arm === lighthouseHeroDelivery
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    if (!comparisons.arms.includes(arm) || heroDelivery !== Boolean(heroReplay) || (comparisonId === undefined
      ? heroTrial || !validOpeningId(launchId) || (comparisons === workspaceComparisons && !workspaceComparisonArms.includes(arm))
      : !comparisonIdValid(comparisonId))) {
      throw new Error('开局请求无效，请重试。')
    }
    const registry = ctx.get('workspaceRegistry')
    const controller = ctx.get('sessionController')
    const query = ctx.get('sessionQuery')
    if (!registry?.create || !controller?.create || !query) throw new Error('当前 DSH 无法打开同题对照。')
    let comparison
    if (comparisonId !== undefined) comparison = comparisons.read(comparisonId)
    else if (comparisons === planComparisons) comparison = await createPlanComparison(selection, english, signal)
    else if (comparisons === rematchComparisons) comparison = await createRematch(selection.baselineSelection, registry, signal)
    else if (comparisons === workspaceComparisons) comparison = await createWorkspaceComparison(comparisons, registry, selection, english, signal)
    else comparison = await comparisons.create(launchId, () => ({ task: lighthouseComparisonTask(english) }))
    if (!comparison) throw new Error('找不到这组同题对照。')
    if (!comparisons.armsFor(comparison).includes(arm)) {
      throw new Error(comparison.lesson === lighthouseLesson ? '灯塔换装练习从直接交付开局。' : '开局请求无效，请重试。')
    }
    const { id, task } = comparison
    const { sessionId, requestId } = comparisons.identity(id, arm)
    const response = { id, task, sessionId, requestId }
    if (openingMatches.has(sessionId)) {
      const opened = await openingMatches.get(sessionId)
      if (requiredPresetId && (await comparisons.readArm(id, arm))?.presetId !== requiredPresetId) throw new Error(challengeChanged)
      return opened
    }

    const open = async () => {
      let saved = await comparisons.readArm(id, arm)
      if (requiredPresetId && saved && saved.presetId !== requiredPresetId) throw new Error(challengeChanged)
      if (heroDelivery && saved && saved.token !== heroReplay.token) throw new Error(heroDeliveryChanged)
      if (saved?.opened) return heroTrial ? { ...response, workspaceId: saved.workspaceId } : response
      const pinned = comparison.plans?.[arm]
      let workspace = comparison.workspaceId && registry.get(comparison.workspaceId)
      let verify
      let stockReviewBindings
      if (heroTrial) {
        const prepared = heroDelivery ? await prepare(heroReplay.draft, heroReplay.candidate) : undefined
        if (!heroDelivery && !await heroTrialAvailable()) throw new Error(heroTrialUnavailable)
        if (heroDelivery) {
          const original = await heroTrials.readArm(id, 'minimal')
          if (await workspaceMaterialState({ ...original, material: lighthouseHeroMaterial }, signal) !== 'verified') {
            throw new Error(heroDeliveryChanged)
          }
        }
        workspace = await lighthouseHeroWorkspace(comparisons.armDirectory(id), arm, registry)
        const contentDigest = await digestWorkspaceMaterial(workspace.path, lighthouseHeroMaterial, signal)
        if (contentDigest !== heroTrialDigest) throw new Error('示例材料已修改，请另开一组同题对照。')
        const current = { workspaceId: workspace.id, cwd: workspace.path, presetId: prepared?.presetId ?? arm, digest: heroTrialDigest,
          ...(heroDelivery && { token: heroReplay.token }) }
        if (saved && !isDeepStrictEqual(saved, current)) throw new Error('这场会话与原对照阵容不一致。')
        if (!saved) await comparisons.writeArm(id, arm, current)
        saved = current
      }
      if (comparison.material) {
        if (workspace?.path !== comparison.cwd) throw new Error('请选择一个现有的工作区。')
        // Check again after resolving the plan. A file can change while its tools are being checked.
        let prepared
        if (pinned) prepared = await preparePlanComparison(comparison, arm)
        else if (comparison.loadout) prepared = await prepareRematch(comparison, signal)
        const state = await workspaceMaterialState(comparison, signal)
        if (state !== 'verified') throw new Error(state === 'changed' ? '材料已变化，请用现在的文件开始新的对照。'
          : '无法读取所选材料，请核对工作区内的文件路径。')
        if (prepared) {
          if (pinned) buildPlans.read(pinned.id, pinned.revision)
          workspace = registry.get(comparison.workspaceId)
          if (workspace?.path !== comparison.cwd) throw new Error('请选择一个现有的工作区。')
          const current = { workspaceId: workspace.id, cwd: workspace.path, presetId: prepared.presetId }
          if (saved && !isDeepStrictEqual(saved, current)) throw new Error('这场会话与原对照阵容不一致。')
          if (!saved) await comparisons.writeArm(id, arm, current)
          saved = current
          verify = prepared.verifyLive
          stockReviewBindings = prepared.stockReviewBindings
        }
      }
      if (saved) {
        workspace = registry.get(saved.workspaceId)
        if (!workspace || workspace.path !== saved.cwd) throw new Error('这场对照的工作区已不可用。')
      } else {
        const delivery = arm === 'delivery'
        const ecosystem = await discover()
        const draft = arm === 'evidence' ? standardDeliveryDraft(ecosystem, ['present', 'evidence'])
          : comparison.material ? deliveryPlaybookDraft(ecosystem, arm)
          : standardDeliveryDraft(ecosystem, delivery ? ['present'] : [])
        const { candidate, choices } = await plannedGrowth(draft, { ecosystem })
        const hasTool = name => choices.some(item => item.kind === 'tool' && item.name === name && !item.timing)
        const ready = comparison.material ? hasTool('present') && (!['review', 'evidence'].includes(arm) || hasTool('ask_user_question'))
          : hasTool('glob') && hasTool('present') === delivery
        if (!ready) throw new Error('标准模式的对照阵容无法装配。')
        if (requiredPresetId && candidate.id !== requiredPresetId) throw new Error(challengeChanged)
        const { presetId } = await prepare(draft, candidate)
        signal?.throwIfAborted()
        workspace ??= await lighthouseComparisonWorkspace(comparisons.armDirectory(id), arm, registry)
        saved = { workspaceId: workspace.id, cwd: workspace.path, presetId }
        await comparisons.writeArm(id, arm, saved)
      }
      signal?.throwIfAborted()
      if (closed) throw new Error('配装服务正在关闭，请重试。')
      const existing = await query.observeSession(sessionId, { projectionMode: 'none', signal }).catch(error => {
        if (error.code !== 'SESSION_QUERY_SESSION_NOT_FOUND') throw error
      })
      if (existing) {
        try {
          const header = existing.header
          if (header.cwd !== saved.cwd || header.agentPreset !== saved.presetId || header.isSeeded || existing.inheritedEventCount) {
            throw new Error('这场会话与原对照阵容不一致。')
          }
          if (!workspace.sessionIds.includes(sessionId)) await workspace.attachSession(sessionId)
        } finally {
          existing[Symbol.dispose]()
        }
      } else {
        const created = await controller.create({ sessionId, workspaceId: workspace.id, agentPreset: saved.presetId })
        if (created.sessionId !== sessionId) throw new Error('新对局的会话标识已变化，请重新开局。')
      }
      if (verify || heroTrial || stockReviewBindings) {
        if (!ctx.get('agents')?.get(sessionId)) {
          const result = await controller.resolveAgent(sessionId)
          if (!result.agent) throw new Error(result.error?.message ?? '无法打开新对局。')
        }
        if (heroTrial) {
          const agent = ctx.get('agents')?.get(sessionId)
          if (!heroTrialLive(arm, saved.presetId, agent)) throw new Error(heroTrialUnavailable)
        } else if (verify) verifyLive({ presetId: saved.presetId, sessionId })
        if (stockReviewBindings && !stockTrialLive('standard', saved.presetId, ctx.get('agents')?.get(sessionId), stockReviewBindings)) {
          throw new Error('原局的读取或交付工具来源已变化，请重新核对。')
        }
      }
      await comparisons.writeArm(id, arm, { ...saved, opened: true })
      updates.notify(sessionId)
      return heroTrial ? { ...response, workspaceId: saved.workspaceId } : response
    }
    const work = open().finally(() => openingMatches.delete(sessionId))
    openingMatches.set(sessionId, work)
    return work
  }

  async function matchPlans({ sessionId }) {
    requireMatch(sessionId)
    if (!buildPlans.size) return []
    const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
    const active = requireMatch(sessionId)
    const art = packageArt(uploaded, ecosystem)
    const unavailable = planAvailability(ecosystem)
    const catalog = visibleEquipment(ecosystem)
    const classes = catalogRoles(ctx, ecosystem, catalog, equipmentToolLinks(ecosystem, catalog))
    return buildPlans.list().map(plan => {
      const record = records.get(plan.presetId)
      const sources = record && savedToolSources(record, ecosystem)
      const items = (record?.equipmentIds ?? []).map(id => {
        const current = currentEquipmentId(id, ecosystem)
        const gear = catalog.get(current) ?? equipmentById.get(id)
        return { id: current, name: record.equipmentLabels?.[id] ?? gear?.name ?? id,
          art: art('gear', current, sources[id]) ?? uploaded('gear', id), sourceId: sources[id], sourceName: record.equipmentSourceLabels?.[id],
          roles: gear?.kind === 'tool' ? classes.tool(gear, sources[id]) : classes.byId.get(current) }
      })
      return { ...planCard(plan, art, unavailable), current: plan.presetId === active.presetId,
        items, removed: Object.values(record?.removedEquipmentLabels ?? {}), removedIds: Object.keys(record?.removedEquipmentLabels ?? {}) }
    })
  }

  function matchPlan({ sessionId, id, revision }) {
    const active = requireMatch(sessionId)
    const plan = buildPlans.read(id, revision)
    if (plan.presetId === active.presetId) throw new Error('当前会话已经使用这个阵容。')
    return plan
  }

  async function previewMatchPlan(selection) {
    const { presetId } = matchPlan(selection)
    const result = await compare({ presetId, equipmentIds: [], sourceSessionId: selection.sessionId })
    matchPlan(selection)
    if (!result.live) throw new Error('当前会话已关闭，请重新打开后再对照。')
    return result
  }

  async function continueMatchPlan(selection) {
    const { presetId, name } = matchPlan(selection)
    await prepare({ presetId, equipmentIds: [] })
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    matchPlan(selection)
    const sourceSessionId = selection.sessionId
    const anchor = queue.capture(sourceSessionId)
    return queue.schedule({ sourceSessionId, presetId, title: name }, anchor)
  }

  function matchToolSources({ agent, runtime, scope, record }, schemas, standingPlugins, activePlugins, transport) {
    const tools = registeredToolDetails(ctx, scope, schemas, standingPlugins, activePlugins, transport)
    const origins = ctx.get('agentLoadoutToolOrigins')
    const team = ctx.get('agentTeams')
    if (typeof team?.isEnabled === 'function') {
      for (const item of tools.values()) {
        if (!item.conditional || origins?.get(ctx.tools.get(item.name, scope), scope)?.moduleName !== teamToolsModule) continue
        try {
          item.activation = team.isEnabled(agent) ? 'enabled' : 'disabled'
          item.activationHint = '在 DSH 模型菜单中切换队伍模式。'
        } catch {
          // The native host owns admission when the Team mode is unavailable here.
        }
      }
    }
    const requirements = equippedToolBindings(record)
    const standingScope = runtime.scopeParentOf(scope)
    const profileSources = requirements.some(tool => tool.profileSourceId) ? profileToolSources(ctx) : undefined
    const states = new Map()
    for (const binding of requirements) {
      const { id } = binding
      const state = boundToolState(ctx, scope, standingScope, record, binding, profileSources)
      states.set(id, state)
      const details = tools.get(id)
      if (state !== 'ready' || !details) continue
      details.sourceId = record.equipmentSources?.[id] ?? details.sourceId
      details.sourceName = record.equipmentSourceLabels?.[id] ?? details.sourceName
    }
    return { tools, requirements, states }
  }

  function equipmentInspection(active, schemas, gear, text) {
    const { agent, record, scope } = active
    const standing = activePresetUnits(ctx, agent.ctx, record?.definition.plugins)
    const session = activeAgentUnits(ctx, scope)
    const executor = executorTools(ctx, scope, schemas)
    const { tools, requirements, states } = matchToolSources(active, schemas, standing, session, executor)
    const selectedNames = new Set(requirements.map(item => item.name))
    const available = [...tools.values()].filter(tool => tool.activation !== 'disabled' &&
      (!selectedNames.has(tool.name) || states.get(tool.id) === 'ready'))
    const origins = ctx.get('agentLoadoutToolOrigins')
    const linked = available.filter(tool => {
      if (!gear.profileEntries) return tool.sourceId === gear.id || tool.artSourceId === gear.id
      const origin = tool.transport ? executor.origin : origins?.get(ctx.tools.get(tool.name, scope), scope)
      return profileProviderActive(origin?.profileEntry)
        && (gear.profileEntries.includes(origin.profileEntry.id) || gear.profileEntries.includes(origin.unitEntry.id))
    }).map(tool => JSON.stringify(tool.name))
    return [
      linked.length ? text('当前可核验的工具包括 ') + linked.slice(0, 12).join(text('、')) + text('。请在任务需要时用这些工具取得依据。')
        : text('当前没有可归属到该装备的工具记录。请依据可核对的配置、实际产出或我提供的资料。'),
      available.some(tool => tool.name === 'ask_user_question')
        && text('核验后使用 ask_user_question 给出「继续当前方案」「补齐条件」「回城换装」三个选项，让我决定下一步。'),
    ].filter(Boolean).join('\n')
  }

  function waitingEquipment(active, requirements = equippedToolBindings(active.record)) {
    const { scope, runtime, record } = active
    const standingScope = runtime.scopeParentOf(scope)
    const profileSources = requirements.some(tool => tool.deferred && tool.profileSourceId) ? profileToolSources(ctx) : undefined
    return requirements.filter(tool => tool.deferred && boundToolState(ctx, scope, standingScope, record, tool, profileSources) === 'waiting')
      .map(tool => ({ ...tool, profileEntry: profileSources?.get(tool.profileSourceId)?.entry }))
  }

  async function availableActions(active, schemas, featured, activePlugins, standingPlugins, bundles) {
    const configured = actions.entries()
    if (!configured.length) return configured
    const { agent, scope, presetId, record } = active
    const heroId = record?.baseId ?? presetId
    const gear = new Set([...schemas.map(toolKey), ...featured.filter(item => item.ready).map(item => item.id)])
    if (configured.some(item => item.kind === 'gear' && item.id.startsWith('tool:'))) {
      for (const tool of waitingEquipment(active)) gear.add(tool.id)
    }
    if (configured.some(item => item.kind === 'gear' && item.id.startsWith('plugin:'))) {
      for (const unit of [
        ...(standingPlugins ?? activePresetUnits(ctx, agent.ctx, record?.definition.plugins)),
        ...(activePlugins ?? activeAgentUnits(ctx, scope)),
      ]) {
        gear.add(unit.id)
        if (unit.row.config?.sourceUnitId) gear.add(unit.row.config.sourceUnitId)
      }
    }
    if (configured.some(item => item.kind === 'gear' && item.id.startsWith('host:'))) {
      for (const id of profileGrowthEntries().keys()) gear.add('host:' + id)
    }
    if (configured.some(item => item.kind === 'gear' && item.id.startsWith('bundle:'))) {
      for (const bundle of await (bundles ?? profileBundles())) {
        if (bundle.enabled && !bundle.error && bundle.availability !== 'missing') gear.add('bundle:' + bundle.name)
      }
    }
    return configured.filter(item => item.kind === 'hero' ? item.id === heroId : gear.has(item.id))
  }

  function packageToolProvider(scope, schema, executor) {
    const id = toolKey(schema)
    const definition = ctx.tools.get(schema.name, scope)
    if (definition ? registeredToolKey(definition) !== id : !executor.schemas.some(item => toolKey(item) === id)) return
    const identity = definition ?? executor.executor
    const origin = definition ? ctx.get('agentLoadoutToolOrigins')?.get(definition, scope) : executor.origin
    if (!identity || !origin?.moduleName || (origin.profileEntry && !profileProviderActive(origin.profileEntry))) return
    return { identity, origin, transport: !definition }
  }

  function waitingToolSources(active, tool, mounted) {
    if (tool.profileEntry) return [{ key: tool.profileSourceId, module: moduleReference(tool.profileEntry) }]
    return waitingScopedToolSources(ctx, discoveries, active, tool, mounted.get(tool.equipId),
      [...(active.record.sessionGear ?? []), ...collection.values()])
  }

  async function availablePackageActions(active, schemas, { executor, activePlugins, standingPlugins, bundles = profileBundles() }) {
    const reader = packageActions(ctx)
    const { agent, runtime, scope, presetId, record } = active
    const heroId = record?.baseId ?? presetId
    const heroName = record?.baseName ?? ctx.agentPresets.definitions?.get(heroId)?.config.name
      ?? presetLabels.get(heroId)?.[0] ?? heroId
    const targets = []
    const add = (kind, id, name, moves, source) => {
      if (moves.length) targets.push(packageActionRecord(kind, id, name, moves, source))
    }
    function revisionOf(object) {
      if (!actionOrigins.has(object)) actionOrigins.set(object, randomUUID())
      return actionOrigins.get(object)
    }
    const compositions = record ? ctx.agentPresets.inspectCompositions() : ctx.agentPresets.inspectCompositions(agent.ctx)
    add('hero', heroId, heroName, reader.hero(heroId, compositions.find(item => item.id === heroId)?.modules), heroId)
    const units = [
      ...(standingPlugins ?? activePresetUnits(ctx, agent.ctx, record?.definition.plugins)),
      ...(activePlugins ?? activeAgentUnits(ctx, scope)),
    ]
    const mounted = new Map(units.map(unit => [unit.row.config?.sourceUnitId ?? unit.id, unit]))
    const loaded = new Map([...mounted, ...units.map(unit => [unit.id, unit])])
    const deferred = new Set(equippedToolBindings(record).filter(tool => tool.deferred).map(tool => tool.id))
    for (const [id, unit] of mounted) {
      const name = record?.equipmentLabels?.[id] ?? unit.row.id ?? moduleLabel(unit.row.name)
      add('gear', id, name, reader.equipment(actionModules(unit)), unit.id)
    }
    for (const schema of schemas) {
      const provider = packageToolProvider(scope, schema, executor)
      if (!provider) continue
      const { origin, identity } = provider
      const modules = [{ moduleName: origin.moduleName, baseUrl: origin.moduleBaseUrl }]
      const moves = reader.tool(schema.name, modules)
      if (!moves.length) continue
      const id = toolKey(schema)
      const binding = deferred.has(id) && shortcuts.source(scope, schema.name, executor)
      add('gear', id, schema.name, moves, binding ? ['turn', binding.key] : [origin.profileSourceId ?? origin.entryId, revisionOf(identity)])
    }
    for (const tool of waitingEquipment(active)) {
      const sources = waitingToolSources(active, tool, loaded)
      for (const { key, moves } of publishedToolActions(reader, tool.name, sources)) {
        const target = packageActionRecord('gear', tool.id, tool.name, moves, ['turn', key])
        const sourceBinding = { id: tool.id, name: tool.name, key, deferred: true,
          sourceId: record.equipmentSources?.[tool.id], sourceName: record.equipmentSourceLabels?.[tool.id],
          ...(tool.transport && { transport: true }) }
        targets.push({ ...target, toolName: tool.name, sourceBinding })
      }
    }
    for (const entry of ctx.loader.entries()) {
      if (runtime.scopeOf(entry.ctx) || entry.options.group || entry.disabled || entry.fiber?.state !== 2) continue
      const id = 'host:' + entry.id
      const moves = reader.equipment([moduleReference(entry)])
      if (moves.length) add('gear', id, moduleLabel(entry.options.name), moves, profileProviderId(entry) ?? revisionOf(entry.fiber))
    }
    for (const bundle of await bundles) {
      if (bundle.enabled && !bundle.error && bundle.availability !== 'missing') {
        add('gear', 'bundle:' + bundle.name, bundle.name, reader.bundle(bundle.name), bundle.name)
      }
    }
    return targets
  }

  async function matchPrompt(selection) {
    const { sessionId, questId } = selection
    const text = selection.language === 'en' ? englishText : value => value
    let questShortcut
    let questBindings = []
    if (questId !== undefined) {
      const active = requireMatch(sessionId)
      const task = currentQuestTask(sessionId, matchHero(active.presetId, active.record).id)
      if (!task || task.quest.id !== questId) throw new Error('当前委托已变化，请重新打开任务。')
      questShortcut = questTaskShortcut(task)
      questBindings = requireQuestBindings(active, task)
      const hasTarget = selection.targetKind !== undefined || selection.equipmentId !== undefined || selection.toolId !== undefined
      if (!task.target) {
        if (hasTarget) throw new Error('当前委托的任务操作已变化，请重新打开任务。')
        if (questShortcut) {
          const submission = await prepareMatchPrompt({ ...selection, toolId: questShortcut.id }, questShortcut)
          submission.move.questId = questId
          return submission
        }
        const submission = questPrompt(task.quest, selection.input, task.support, selection.language)
        if (questBindings.length) submission.move.sourceBindings = questBindings
        return submission
      }
      if (questShortcut && !hasTarget) {
        selection = { ...selection, targetKind: 'gear', targetId: task.target.id, moveId: equipmentTaskId }
      }
      if (questShortcut && (selection.targetKind !== 'gear' || selection.targetId !== questShortcut.id || selection.moveId !== equipmentTaskId)) {
        throw new Error('委托指定的操作已变化，请重新打开任务。')
      }
      if (selection.targetKind === undefined && selection.equipmentId === undefined) {
        throw new Error('请打开委托指定的操作，再发送任务。')
      }
    }
    const profileShortcut = selection.shortcutKey !== undefined && selection.targetKind === 'gear' && isProfileShortcut(selection.targetId)
    const shortcutMatch = profileShortcut && requireMatch(sessionId)
    const submission = await prepareMatchPrompt(profileShortcut ? { ...selection, shortcutKey: undefined } : selection, questShortcut)
    if (profileShortcut) {
      const { targetId, shortcutKey } = selection
      const [{ pins: saved }, current] = await Promise.all([pins.read(sessionId), profileGrowthGear()])
      if (!saved.some(pin => pin.id === targetId && pin.key === shortcutKey) ||
        !current.some(item => item.id === targetId && item.shortcutKey === shortcutKey) ||
        match(sessionId)?.agent !== shortcutMatch.agent) throw new Error('快捷槽选定的 Profile 装备当前不可用。')
      submission.move.profileShortcutKey = shortcutKey
    }
    const quest = growth.questForAction(sessionId, submission.move)
    if (questId !== undefined && quest?.id !== questId) throw new Error('委托指定的操作已变化，请重新打开任务。')
    if (quest) {
      submission.move.questId = quest.id
      if (questId === undefined) {
        const active = requireMatch(sessionId)
        const task = currentQuestTask(sessionId, matchHero(active.presetId, active.record).id)
        if (task?.quest.id === quest.id) questBindings = requireQuestBindings(active, task)
      }
    }
    const additionalBindings = questBindings.filter(pin => pin.id !== submission.move.sourceBinding?.id)
    if (additionalBindings.length) submission.move.sourceBindings = additionalBindings
    if (quest?.comboAction?.staged) {
      const instruction = quest.comboFirst
        ? '基于第一阶段已经取得的结果和我补充的要求执行该操作。遇到证据缺口时请说明。'
        : '完成本阶段的准备操作并展示结果，列出待确认事项。停在这里等我查看，再决定是否进入下一阶段。'
      submission.text += text('\n\n连携目标\n') + quest.title + '\n' + text(instruction)
    } else if (quest?.comboAction) {
      const support = quest.pair.find(item => item.id !== quest.comboAction.gearId)
      submission.text += text('\n\n连携目标\n') + quest.title
        + text('\n请先使用当前会话的工具 ') + JSON.stringify(support.name)
        + text(' 取得依据，再执行上面选择的装备操作。辅助工具不可用或调用失败时，请说明缺少的条件。')
    }
    return submission
  }

  async function prepareMatchPrompt(selection, pin) {
    if (!pin && selection.shortcutKey !== undefined) {
      if (typeof selection.sessionId !== 'string' || !selection.sessionId || selection.sessionId.length > 512
        || typeof selection.toolId !== 'string' || !selection.toolId.startsWith('tool:') || selection.targetKind !== undefined) {
        throw new Error('找不到该快捷装备。')
      }
      const { pins: saved } = await pins.read(selection.sessionId)
      pin = saved.find(item => item.id === selection.toolId && item.key === selection.shortcutKey)
      if (!pin) throw new Error('快捷装备已变化，请重新打开快捷槽。')
    }
    const active = match(selection.sessionId)
    if (!active) throw new Error('请先打开会话，再使用对局装备。')
    const task = selection.targetKind === 'gear' && selection.moveId === equipmentTaskId
    const toolId = selection.targetKind === 'gear' ? selection.targetId : selection.toolId
    const registered = ctx.tools.schemas(active.scope)
    const transport = executorTools(ctx, active.scope, registered)
    const schemas = [...registered, ...transport.schemas]
    if (pin) {
      if (pin.id !== toolId || !shortcutToolAvailable(active, pin, transport)) {
        throw new Error('快捷槽选定的工具来源当前不可用。')
      }
      if (task) {
        const submission = actionPrompt({ kind: 'gear', id: pin.id, title: pin.name, toolName: pin.name,
          actions: [equipmentTask({ kind: 'tool' })], builtIn: true }, schemas, selection)
        submission.move.sourceBinding = pin
        return submission
      }
      return equipmentPrompt(active.record, schemas, selection, pin)
    }
    const requested = toolId && schemas.find(schema => toolKey(schema) === toolId)
    const bindings = equippedToolBindings(active.record)
    const expected = bindings.find(tool => tool.id === toolId) ?? bindings.find(tool => tool.name === requested?.name)
    const state = expected && boundToolState(ctx, active.scope, active.runtime.scopeParentOf(active.scope), active.record, expected)
    const waiting = selection.targetKind === 'gear' && state === 'waiting'
    if (expected && (expected.id !== toolId || (state !== 'ready' && !waiting))) {
      throw new Error('所选装备来源当前尚未注册此工具。')
    }
    if (selection.targetKind === undefined) return equipmentPrompt(active.record, schemas, selection)
    if (task) {
      const tool = requested ?? (waiting ? expected : undefined)
      let item = tool && { id: toolId, kind: 'tool', name: tool.name }
      if (!item && typeof toolId === 'string') {
        const profile = toolId.startsWith('host:') || toolId.startsWith('bundle:')
        const gear = profile ? await profileGrowthGear() : pluginGrowthGear(active)
        item = gear.find(gear => gear.id === toolId)
      }
      const move = equipmentTask(item)
      const current = match(selection.sessionId)
      if (!move || current?.agent !== active.agent || current.presetId !== active.presetId) {
        throw new Error('这件装备当前不可用，请刷新对局装备。')
      }
      const context = item.kind === 'plugin' ? equipmentInspection(active, registered, item, selection.language === 'en' ? englishText : value => value) : undefined
      return actionPrompt({ kind: 'gear', id: item.id, title: item.name, toolName: tool?.name, context, actions: [move], builtIn: true }, schemas, selection)
    }
    if (selection.targetKind === 'hero' && typeof selection.moveId === 'string' && selection.moveId.startsWith('hero:')) {
      const hero = matchHero(active.presetId, active.record)
      if (hero.id !== selection.targetId) throw new Error('当前英雄已变化，请重新选择操作。')
      return actionPrompt({ kind: 'hero', id: hero.id, title: hero.name, actions: builtInHeroActions(hero.id), builtIn: true }, schemas, selection)
    }
    if (typeof selection.moveId === 'string' && selection.moveId.startsWith('package:')) {
      const { agent, scope, record } = active
      const provider = requested && packageToolProvider(scope, requested, transport)
      const allowed = await availablePackageActions(active, schemas, { executor: transport })
      const target = allowed.find(item => item.kind === selection.targetKind && item.id === selection.targetId &&
        item.revision === selection.revision && item.actions.some(move => move.id === selection.moveId))
      const changed = () => new Error('插件操作或来源已变化，请返回对局装备重新选择。')
      if (!target) throw changed()
      const current = match(selection.sessionId)
      if (current?.agent !== agent || current.scope !== scope || current.presetId !== active.presetId ||
        (waiting && (!target.sourceBinding || !shortcutToolAvailable(current, target.sourceBinding)))) throw changed()
      const submission = actionPrompt(target, schemas, selection)
      if (requested) {
        const executor = executorTools(ctx, scope)
        const actual = packageToolProvider(scope, requested, executor)
        if (!provider || provider.identity !== actual?.identity || provider.origin !== actual.origin) throw changed()
        const binding = shortcuts.source(scope, requested.name, executor)
        if (binding?.id !== toolId) throw changed()
        const native = actual.transport ? [] : [requested]
        const transportSchemas = actual.transport ? [requested] : []
        const item = registeredToolDetails(ctx, scope, native, activePresetUnits(ctx, agent.ctx, record?.definition.plugins),
          activeAgentUnits(ctx, scope), { ...executor, schemas: transportSchemas }).get(toolId)
        submission.move.sourceBinding = { ...binding, name: requested.name, sourceId: item?.artSourceId, sourceName: item?.sourceName }
      } else if (target.sourceBinding) {
        submission.move.sourceBinding = target.sourceBinding
      }
      return submission
    }
    const allowed = await availableActions(active, schemas, equippedActions(active.record, schemas))
    const target = allowed.find(item => item.kind === selection.targetKind && item.id === selection.targetId)
    if (!target) throw new Error('这项自定义操作的英雄或装备当前未就绪。')
    const current = actions.read(target.kind, target.id)
    if (current.revision !== selection.revision) throw new Error('自定义操作刚更新，请返回对局装备重新选择。')
    const latest = match(selection.sessionId)
    if (latest?.agent !== active.agent || latest.scope !== active.scope || latest.presetId !== active.presetId ||
      (waiting && !waitingEquipment(latest, [expected]).length)) throw new Error('自定义操作的英雄或装备已变化。')
    return actionPrompt({ ...target, actions: current.actions, ...(waiting && { toolName: expected.name }) }, schemas, selection)
  }

  async function personalWebReport(source) {
    const { cwd, origin } = source.header
    return typeof cwd === 'string' && cwd && origin !== 'subagent' && !planTaskDetails(source).launch?.webSourcePractice &&
      await personalTaskPathFilter().then(includesPath => includesPath(cwd)).catch(() => false)
  }

  const webDecisionDirectory = join(directory, 'web-recovery-decisions')
  const webDecisionKey = (sessionId, seq) => createHash('sha256').update(JSON.stringify([sessionId, seq])).digest('hex')
  async function readWebDecision(key) {
    try {
      return JSON.parse(await readFile(join(webDecisionDirectory, key + '.json'), 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
  }

  async function readMatchReport({ sessionId, before }, signal, webOnly = false) {
    const query = ctx.get('sessionQuery')
    if (!query || typeof sessionId !== 'string' || !sessionId || sessionId.length > 512) {
      throw new Error('无法读取对局记录。')
    }
    const source = await query.observeSession(sessionId, { projectionMode: 'none', signal })
    try {
      let scope
      const personal = () => scope ??= personalWebReport(source)
      const value = await matchReport(source, before, receipts, async seq => {
        if (await personal()) return readWebDecision(webDecisionKey(sessionId, seq)).catch(() => undefined)
      })
      if ((value.webRecovery !== undefined || value.webRecoveryOutcome) && !await personal()) {
        delete value.webRecovery
        delete value.webRecoveryRepeat
        delete value.webRecoveryOutcome
      }
      if (webOnly) return value
      const endSeqs = value.turns.filter(turn => !turn.inherited && Number.isSafeInteger(turn.endSeq)).map(turn => turn.endSeq)
      await growth.settle()
      const followUps = await growth.reportFollowUps(sessionId, endSeqs).catch(() => {
        if (!warnings.includes('progress.json')) warnings.push('progress.json')
        return new Map()
      })
      const art = await matchHistoryArt(await appearance.index(), match(sessionId))
      for (const turn of value.turns) {
        const followUp = followUps.get(turn.endSeq)
        delete turn.endSeq
        if (!turn.inherited && followUp) turn.followUp = { ...followUp, followUpGear: flagGear(followUp.followUpGear, art) }
        for (const entry of turn.entries) {
          if (entry.type === 'tool') entry.id ??= 'call:' + entry.name
          if (entry.kind !== 'quest') entry.art = art(entry.kind === 'hero' ? 'hero' : 'gear', entry.id, entry.sourceId,
            entry.type === 'tool' ? entry.name : undefined)
        }
      }
      return value
    } finally {
      source[Symbol.dispose]()
    }
  }

  async function chooseWebRecovery({ sessionId, seq, choice }, signal) {
    const changed = '这条换源记录已变化，请刷新战报。'
    if (!Number.isSafeInteger(seq) || seq < 0 || !['use-source', 'pending'].includes(choice)) throw new Error(changed)
    const { webRecoveryOutcome: outcome, turns } = await readMatchReport({ sessionId }, signal, true)
    const entry = turns[0]?.entries.find(entry => entry.seq === seq)
    if (outcome?.seq !== seq || !entry?.webRead?.url) throw new Error(changed)
    if (closed) throw new Error('配装服务正在关闭，请重试。')
    signal?.throwIfAborted()
    const key = webDecisionKey(sessionId, seq)
    const fingerprint = webRecoveryFingerprint(outcome, entry.webRead.url)
    try {
      await saveEntry(webDecisionDirectory, key, { fingerprint, choice }, { exclusive: true })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const stored = await readWebDecision(key)
      if (stored?.fingerprint !== fingerprint || !['use-source', 'pending'].includes(stored.choice)) throw new Error(changed)
      choice = stored.choice
    }
    return { seq, choice }
  }

  function matchArtContext(active, uploaded, entries = profileGrowthEntries(), bundles = []) {
    const { agent, record, scope } = active
    const activePlugins = activeAgentUnits(ctx, scope)
    const standingPlugins = activePresetUnits(ctx, agent.ctx, record?.definition.plugins)
    const loadedPlugins = new Map()
    for (const unit of [...standingPlugins, ...activePlugins]) {
      loadedPlugins.set(unit.id, unit)
      if (unit.row.config?.sourceUnitId) loadedPlugins.set(unit.row.config.sourceUnitId, unit)
    }
    const profileArtwork = new Map()
    for (const [id, entry] of entries) {
      const source = { modules: [{ moduleName: entry.module, baseUrl: entry.baseUrl }],
        get icon() { return equipmentMetadata(ctx, entry.module, entry.baseUrl)?.icon } }
      profileArtwork.set('host:' + id, source)
      if (entry.shortcutKey) profileArtwork.set(entry.shortcutKey, source)
    }
    for (const bundle of bundles) {
      if (bundle.enabled && bundle.availability !== 'missing') {
        profileArtwork.set('bundle:' + bundle.name, { modules: [{ moduleName: bundle.name }], icon: bundle.meta?.icon })
      }
    }
    return { activePlugins, standingPlugins, loadedPlugins, art: packageArt(uploaded, undefined, active, loadedPlugins, profileArtwork) }
  }

  async function matchHistoryArt(uploaded, active, { useCurrentTool = false } = {}) {
    if (!active) return packageArt(uploaded, await discover())
    const { scope, record, presetId } = active
    const { standingPlugins, activePlugins, art } = matchArtContext(active, uploaded)
    const current = registeredToolDetails(ctx, scope, ctx.tools.schemas(scope), standingPlugins, activePlugins)
    const heroId = record?.baseId ?? presetId
    const archive = packageArt(uploaded)
    return (kind, id, sourceId, name) => {
      if (kind === 'hero') return (id === heroId ? art : archive)(kind, id)
      const tool = current.get(id)
      const currentSource = tool?.artSourceId ?? tool?.sourceId
      const sameSource = sourceId ? sourceId === currentSource : useCurrentTool
      return art(kind, id, sourceId ?? (sameSource ? currentSource : undefined), name ?? tool?.name,
        sameSource ? tool?.nativeIcon : undefined, sameSource ? tool?.artModule : undefined)
    }
  }

  async function sessionEquipment(sessionId, bundleRows, profileGear, nativeTrials) {
    const active = match(sessionId)
    if (!active) return { active: false, continuation: queue.status(sessionId) }
    const { agent, runtime, scope, presetId, record } = active
    const bundles = bundleRows ?? profileBundles()
    const profileEntries = profileGrowthEntries()
    const [uploaded, { pins: pinned, carry = [] }, profile, loadedBundles] = await Promise.all([
      appearance.index(), pins.read(sessionId), profileGear ?? profileGrowthGear(profileEntries, bundles), bundles,
    ])
    const selected = new Set(record?.equipmentIds)
    const { activePlugins, standingPlugins, loadedPlugins, art } = matchArtContext(active, uploaded, profileEntries, loadedBundles)
    const schemas = ctx.tools.schemas(scope)
    const transport = executorTools(ctx, scope, schemas)
    const { tools, requirements, states } = matchToolSources(active, schemas, standingPlugins, activePlugins, transport)
    const roleReader = packageRoleReader(ctx)
    const profileBySource = new Map([...profileEntries.values()].map(entry => [entry.shortcutKey, entry]))
    function rolesForTool(item, sourceId, module) {
      const entry = sourceId && profileBySource.get(sourceId)
      const modules = module ? [module] : entry ? [{ moduleName: entry.module, baseUrl: entry.baseUrl }]
        : actionModules(loadedPlugins.get(sourceId))
      return equipmentRoles({ ...item, kind: 'tool' }, [], roleReader.tool(item.name, modules))
    }
    const toolsByProvider = new Map()
    for (const tool of tools.values()) {
      const sourceId = tool.artSourceId ?? tool.sourceId
      if (!sourceId || sourceId === 'profile') continue
      if (!toolsByProvider.has(sourceId)) toolsByProvider.set(sourceId, [])
      toolsByProvider.get(sourceId).push({ roles: rolesForTool(tool, sourceId, tool.artModule) })
    }
    const unitRoles = (unit, id = unit?.row.config?.sourceUnitId ?? unit?.id) =>
      equipmentRoles({ id, modules: unit?.modules }, toolsByProvider.get(id), roleReader.gear(actionModules(unit)))
    const expected = new Set(requirements.map(tool => tool.name))
    const registeredByName = new Map(Array.from(tools.values(), tool => [tool.name, tool]))
    const activePluginIds = new Set(activePlugins.map(unit => unit.id))
    const missingPlugins = configuredAgentUnits(record?.definition.plugins ?? []).filter(unit => !activePluginIds.has(unit.id))
    const configured = record?.definition.plugins.filter(row => isConfiguredEquipment(row.name)) ?? []
    const activeConfigured = new Set()
    if (configured.length) {
      for (const entry of ctx.get('agentLoadoutToolOrigins')?.units(runtime.scopeParentOf(scope)) ?? []) {
        if (isConfiguredEquipment(entry.options.name)) {
          activeConfigured.add('plugin:' + unitFingerprint({ ...declaredIsolation(entry.options), name: configuredEquipmentModule }))
        }
      }
    }
    const liveTools = [
      ...requirements.map(tool => {
        const current = tools.get(tool.id)
        const state = states.get(tool.id)
        return { id: tool.id, name: tool.name, summary: current?.summary ?? tool.summary, selected: true,
          ...(tool.transport && { transport: true }), ...(tool.deferred && { deferred: true }),
          state, sourceName: record?.equipmentSourceLabels?.[tool.id] ?? (state === 'ready' ? current?.sourceName : undefined),
          registeredSourceName: state === 'conflict' ? registeredByName.get(tool.name)?.sourceName : undefined,
          ...(state === 'ready' && current?.conditional && {
            conditional: true, activation: current.activation, activationHint: current.activationHint,
          }) }
      }),
      ...Array.from(tools.values()).filter(tool => !expected.has(tool.name)).map(tool => ({
        ...tool, selected: selected.has(tool.id), state: 'ready',
      })),
    ].map(({ nativeIcon, artModule: _artModule, ...tool }) => {
      const binding = tool.state === 'ready' && shortcuts.source(scope, tool.name, transport)
      const selectedSource = record?.equipmentSources?.[tool.id]
      const current = tools.get(tool.id)
      const artSourceId = selectedSource && selectedSource !== 'profile' ? selectedSource
        : tool.state === 'ready' ? current?.artSourceId ?? current?.sourceId ?? selectedSource : selectedSource
      return { ...tool, roles: rolesForTool(tool, artSourceId, tool.state === 'ready' ? current?.artModule : undefined),
        artSourceId, sourceRank: growth.toolSourceRank(tool.id, artSourceId), art: art('gear', tool.id, artSourceId, tool.name,
          tool.state === 'ready' ? nativeIcon ?? current?.nativeIcon : undefined,
          tool.state === 'ready' ? current?.artModule : undefined),
      ...(binding?.id === tool.id ? { shortcutKey: binding.key } : {}) }
    })
      .sort((a, b) => Number(b.selected) - Number(a.selected) || a.name.localeCompare(b.name))
    const featured = equippedActions(record, schemas)
    const featuredById = new Map(featured.map(item => [item.id, item]))
    const toolsById = new Map(liveTools.map(tool => [tool.id, tool]))
    const outfit = [...selected].map(id => {
      const item = featuredById.get(id) ?? toolsById.get(id)
      const plugin = loadedPlugins.get(id)
      const kind = featuredById.has(id) ? 'featured' : id.startsWith('tool:') ? 'tool' : 'plugin'
      const state = item?.state ?? ((item?.ready || plugin) ? 'ready' : 'missing')
      const name = record.equipmentLabels?.[id] ?? item?.name ?? equipmentById.get(id)?.name ?? id
      const roles = item?.roles ?? (kind === 'plugin' ? unitRoles(plugin, id) : equipmentRoles({ id, kind, name }))
      return { id, kind, state, selected: true, name, roles,
        sourceId: record.equipmentSources?.[id],
        artSourceId: item?.artSourceId, sourceName: item?.sourceName, sourceRank: item?.sourceRank, registeredSourceName: item?.registeredSourceName,
        ...(item?.conditional && { conditional: true, activation: item.activation, activationHint: item.activationHint }),
        summary: item?.summary ?? (plugin && '已加载 ' + plugin.modules.map(moduleLabel).join('、')),
        art: item?.art ?? art('gear', id) }
    })
    const hero = matchHero(presetId, record)
    const roleModules = (record ? ctx.agentPresets.inspectCompositions() : ctx.agentPresets.inspectCompositions(agent.ctx))
      .find(composition => composition.id === hero.id)?.modules
    const heroRoles = presetRoles(hero.id, standingPlugins.filter(unit => !isConfiguredEquipment(unit.row.name) && !selected.has(unit.id))
      .map(unit => unitRoles(unit)), roleReader.hero(hero.id, roleModules))
    const skills = featured.map(item => ({ ...item, kind: 'gear', art: art('gear', item.id) }))
    if (hero.id) skills.push({ ...hero, kind: 'hero', ready: true, art: art('hero', hero.id),
      actions: builtInHeroActions(hero.id).map(({ instruction: _instruction, ...move }) => move) })
    const actionSchemas = [...schemas, ...transport.schemas].filter(schema => {
      return !expected.has(schema.name) || states.get(toolKey(schema)) === 'ready'
    })
    const [localActions, published] = await Promise.all([
      availableActions(active, actionSchemas, featured, activePlugins, standingPlugins, bundles),
      availablePackageActions(active, actionSchemas, { executor: transport, activePlugins, standingPlugins, bundles }),
    ])
    for (const item of [...localActions, ...published]) {
      const revision = item.revision ?? actions.read(item.kind, item.id).revision
      const moves = item.actions.map(({ id, name, detail, requiresInput, publisher, instruction }) => ({
        id, name, detail, requiresInput, custom: true,
        proofKey: actionKey(item.id, { id, name, instruction, requiresInput }),
        ...(item.published ? { publisher, instruction, revision } : {}),
      }))
      const skill = skills.find(skill => skill.kind === item.kind && skill.id === item.id)
      if (skill) {
        skill.actions.push(...moves)
        if (!item.published) skill.revision = revision
      } else {
        const tool = item.kind === 'gear' ? toolsById.get(item.id) : undefined
        skills.push({ id: item.id, kind: item.kind, name: item.title,
          art: tool?.art ?? art(item.kind, item.id), summary: tool?.summary, artSourceId: tool?.artSourceId, sourceName: tool?.sourceName,
          ...(tool?.state === 'waiting' && { waiting: true }),
          ready: true, revision, actions: moves })
      }
    }
    const taskGear = [
      ...liveTools.filter(item => item.state === 'ready' || item.state === 'waiting').map(item => ({ ...item, kind: 'tool' })),
      ...pluginGrowthGear(active, standingPlugins, activePlugins), ...profile,
    ]
    const skillsById = new Map(skills.filter(skill => skill.kind === 'gear').map(skill => [skill.id, skill]))
    for (const item of taskGear) {
      const { instruction, ...move } = equipmentTask(item)
      let skill = skillsById.get(item.id)
      if (!skill) {
        skill = { id: item.id, name: item.name, kind: 'gear', ready: true, actions: [],
          art: item.art ?? art('gear', item.id), artSourceId: item.artSourceId, sourceName: item.sourceName,
          waiting: item.state === 'waiting', summary: item.summary }
        skillsById.set(item.id, skill)
        skills.push(skill)
      }
      if (!skill.actions.some(action => action.id === equipmentTaskId)) {
        skill.actions.push({ ...move, custom: true, builtIn: true, proofKey: actionKey(item.id, { ...move, instruction }) })
      }
    }
    const pluginCards = new Map()
    const configuredRankIds = new Map()
    for (const row of configured) {
      const id = 'plugin:' + unitFingerprint(row)
      const source = row.config?.sourceUnitId ?? id
      configuredRankIds.set(id, source)
      pluginCards.set(id, {
        id, name: record?.equipmentLabels?.[source] ?? childModules(row).map(moduleLabel).join('、'),
        roles: equipmentRoles({ id: source, modules: childModules(row) }, toolsByProvider.get(source),
          roleReader.gear(declaredModules(row, ctx.baseUrl))),
        art: art('gear', source) ?? art('gear', id), configured: true, selected: selected.has(source),
        ...(id !== source && { actionId: source }),
        state: activeConfigured.has(id) ? 'ready' : 'missing',
      })
    }
    for (const unit of [...standingPlugins.filter(unit => !isConfiguredEquipment(unit.row.name)), ...activePlugins, ...missingPlugins]) {
      if (pluginCards.has(unit.id)) continue
      pluginCards.set(unit.id, { id: unit.id, art: art('gear', unit.id),
        roles: unitRoles(unit),
        name: record?.equipmentLabels?.[unit.id] ?? (unit.row.group && unit.row.id ? unit.row.id : moduleLabel(unit.row.name)),
        ...(unit.row.config?.sourceUnitId && { actionId: unit.row.config.sourceUnitId }),
        selected: selected.has(unit.id), state: unit.sessionRecipe ? activePluginIds.has(unit.id) ? 'ready' : 'missing' : 'ready' })
    }
    const commands = equipmentCommands(active, standingPlugins, activePlugins, profile, nativeTrials)
    const compactionActivities = equipmentCompactionActivities(profile, nativeTrials, active)
    const plugins = [...pluginCards.values()].map(item => item.state === 'ready'
      ? { ...item, shortcutKey: item.id, commands: commands.get(item.actionId ?? item.id),
        compactionActivities: compactionActivities.get(item.actionId ?? item.id) } : item)
    const panelActivities = profilePanelActivities(profile, nativeTrials)
    const profileEquipment = profile.map(({ id, name, shortcutKey, profileEntries: entryIds }) => {
      const entries = entryIds.map(id => profileEntries.get(id)).filter(Boolean)
      const members = entries.map(entry => ({ moduleName: entry.module, baseUrl: entry.baseUrl }))
      const bundle = id.startsWith('bundle:') ? roleReader.gear([{ moduleName: id.slice('bundle:'.length) }], 'bundle') : []
      return { id, name, shortcutKey, state: 'ready', art: art('gear', id),
        roles: equipmentRoles({ id, modules: entries.map(entry => entry.module) },
          entries.flatMap(entry => toolsByProvider.get(entry.shortcutKey) ?? []), [...bundle, ...roleReader.gear(members)]),
        commands: commands.get(id), panelActivities: panelActivities.get(id), compactionActivities: compactionActivities.get(id) }
    })
    const profileById = new Map(profileEquipment.map(item => [item.id, item]))
    const outfitById = new Map(outfit.map(item => [item.id, item]))
    const equipmentForAction = new Map([...plugins, ...profileEquipment, ...liveTools, ...outfit].map(item => [item.actionId ?? item.id, item]))
    for (const skill of skills) {
      const item = equipmentForAction.get(skill.id)
      skill.roles = skill.kind === 'hero' ? heroRoles : item?.roles ?? equipmentRoles(skill)
      if (item?.art) skill.art = item.art
    }
    const toolAvailability = shortcuts.toolAvailability(scope, transport)
    function shortcutState(pin) {
      const isTool = pin.id.startsWith('tool:')
      const isProfile = isProfileShortcut(pin.id)
      const item = isTool ? toolsById.get(pin.id) : isProfile ? profileById.get(pin.id) : pluginCards.get(pin.id)
      let state = item?.state ?? 'missing'
      if (isProfile && item) state = item.shortcutKey === pin.key ? 'ready' : 'conflict'
      if (isTool) {
        state = toolAvailability(pin)
        if (state === 'ready' && item?.state !== 'ready') state = 'conflict'
      }
      const artSourceId = pin.sourceId ?? (state === 'ready' ? item?.artSourceId : undefined)
      return { id: pin.id, name: pin.name, summary: pin.summary, sourceName: pin.sourceName,
        roles: (state === 'ready' ? item?.roles : undefined) ?? (isTool
          ? rolesForTool(pin, pin.sourceId) : outfitById.get(pin.id)?.roles ?? equipmentRoles(pin)),
        ...(pin.transport && { transport: true }), ...(pin.deferred && { deferred: true }),
        ...(item?.actionId && { actionId: item.actionId }),
        ...(state === 'ready' && item?.conditional && { conditional: true, activation: item.activation, activationHint: item.activationHint }),
        artSourceId, sourceRank: isTool ? growth.toolSourceRank(pin.id, artSourceId) : undefined,
        registeredSourceName: isTool && state === 'conflict' ? registeredByName.get(pin.name)?.sourceName : undefined,
        state, art: (state === 'ready' && item?.art) || art('gear', pin.id, pin.sourceId, isTool ? pin.name : undefined), shortcutKey: pin.key,
        kind: isTool ? 'tool' : 'plugin' }
    }
    const pinnedGear = pinned.map(pin => ({ ...shortcutState(pin), pinned: true }))
    const pinnedIds = new Set(pinned.map(item => item.id))
    const shortcutCarry = carry.map(pin => {
      const item = shortcutState(pin)
      const placement = selected.has(pin.id) ? 'outfit' : pinnedIds.has(pin.id) ? 'pinned' : undefined
      return { ...item, placement, canCarry: !placement && (item.state === 'ready' || item.state === 'waiting') }
    })
    const offer = questContinuationOffer(active, transport)
    const gearRanks = new Map()
    for (const item of [...outfit, ...pinnedGear, ...liveTools, ...plugins, ...profileEquipment, ...skills.filter(item => item.kind === 'gear')]) {
      if (!gearRanks.has(item.id)) gearRanks.set(item.id, growth.gearRank(configuredRankIds.get(item.id) ?? item.id))
    }
    const board = teamBoard(active)
    await refreshTeamTask(active, board)
    const teamQuest = growth.teamQuest(sessionId)
    const settlement = growth.notice(sessionId)
    if (settlement?.receipt?.usedGear) settlement.receipt.usedGear = flagGear(settlement.receipt.usedGear, art)
    const { count: activeToolCount, calls } = toolRecords.activity(agent.session)
    const activity = calls.map(({ provider, profile: origin, finishedAt: _finishedAt, ...call }) => ({
      ...call, providers: [
        ...(provider ? [{ id: provider }] : []),
        ...(origin && profileEntries.get(origin.id)?.shortcutKey === call.sourceId
          ? profile.filter(item => item.profileEntries.includes(origin.id) || item.profileEntries.includes(origin.unitId))
          .map(({ id, shortcutKey }) => ({ id, shortcutKey })) : []),
      ],
    }))
    const teammates = toolRecords.teammateActivity(sessionId).flatMap(({ session, hero, count, call, address }) => {
      const child = match(session.id)
      if (child?.agent.session !== session) return []
      const { art: childArt } = matchArtContext(child, uploaded, profileEntries, loadedBundles)
      const { id, name, sourceId, sourceName } = call
      return [{ hero: { ...hero, art: childArt('hero', hero.id) }, address, count,
        tool: { id, name, sourceId, sourceName, art: childArt('gear', id, sourceId, name) } }]
    })
    return {
      active: true,
      ...(activity.length && { activity, activeToolCount }),
      ...(teammates.length && { teammateActivity: teammates }),
      continuation: queue.status(sessionId),
      hasPlans: buildPlans.size > 0,
      canDispatchTeammate: Boolean(teammateRuntime(agent)),
      teamDispatchTasks: teamDispatchOptions(board),
      teamFlagChallenge: teamQuest && { taskId: teamQuest.teamTask.id, leaderId: teamQuest.hero.id,
        partners: growth.flags(teamQuest.hero.id).filter(flag => flag.teamwork)
          .map(flag => flag.hero.id === teamQuest.hero.id ? flag.teamwork.hero.id : flag.hero.id) },
      growthVersion: growth.version,
      teamBoardVersion: board && JSON.stringify([board.enabled, board.tasks.map(task => [task.id, task.revision])]),
      settlement: !board && settlement?.ready && teamQuest ? { ...settlement, ready: undefined } : settlement,
      openingQuest: growth.openingQuest(sessionId),
      questTask: questTaskSummary(sessionId, hero.id, active),
      relayOffer: offer?.mode === 'relay' ? { ...offer, gear: offer.gear && flagGear(offer.gear, art) } : undefined,
      questOffer: offer?.mode !== 'relay' ? offer : undefined,
      heroRank: growth.heroRank(hero.id),
      heroFlag: displayFlagFor(hero.id, art),
      heroSignature: displaySignatureFor(hero.id, art),
      gearRanks: Object.fromEntries(gearRanks),
      running: agent.status === 'running',
      presetId,
      heroId: hero.id,
      heroName: hero.name,
      heroRoles,
      roles,
      heroArt: art('hero', hero.id),
      removedEquipmentLabels: record?.removedEquipmentLabels,
      outfit,
      pinned: pinnedGear,
      ...(shortcutCarry.length && { shortcutCarry }),
      skills,
      plugins,
      profileEquipment,
      tools: liveTools,
    }
  }

  async function changeShortcut({ sessionId, itemId, shortcutKey, remove }) {
    if (closed || typeof sessionId !== 'string' || !sessionId || sessionId.length > 512
      || typeof remove !== 'boolean' || !validShortcut({ id: itemId, key: shortcutKey, name: 'shortcut' })) {
      throw new Error('找不到该快捷装备。')
    }
    const active = match(sessionId)
    if (!active) throw new Error('请先打开装备所在的会话。')
    let pin
    if (!remove) {
      const snapshot = await sessionEquipment(sessionId)
      const item = snapshot.active && [...snapshot.tools, ...snapshot.plugins, ...snapshot.profileEquipment].find(item => item.id === itemId)
      if (item?.state !== 'ready' || item.shortcutKey !== shortcutKey || snapshot.outfit.some(gear => gear.id === itemId)) {
        throw new Error('装备当前无法加入快捷栏，请重新查看对局装备。')
      }
      const isTool = itemId.startsWith('tool:')
      const binding = isTool && shortcuts.source(active.scope, item.name)
      if (isTool && (binding?.id !== item.id || binding.key !== shortcutKey || binding.transport !== item.transport)) {
        throw new Error('工具来源已变化，请重新查看对局装备。')
      }
      pin = { id: itemId, key: shortcutKey, name: item.name, sourceName: item.sourceName,
        summary: item.summary, sourceId: item.artSourceId ?? item.sourceId,
        deferred: Boolean(binding?.deferred), ...(binding?.transport && { transport: true }) }
    }
    await pins.update(sessionId, itemId, shortcutKey, pin)
    updates.notify(sessionId)
    return sessionEquipment(sessionId)
  }

  async function resolveShortcutCarry({ sessionId, selected }) {
    if (closed || typeof sessionId !== 'string' || !sessionId || sessionId.length > 512 || !Array.isArray(selected) ||
      new Set(selected).size !== selected.length || !selected.every(id => typeof id === 'string' && id && id.length <= 512)) {
      throw new Error('请选择当前续战中的快捷槽。')
    }
    const snapshot = await sessionEquipment(sessionId)
    if (!snapshot.shortcutCarry?.length) throw new Error('原对局快捷槽已处理，请刷新装备。')
    const chosen = new Map(snapshot.shortcutCarry.filter(item => item.canCarry && selected.includes(item.id))
      .map(item => [item.id, item.shortcutKey]))
    if (chosen.size !== selected.length) throw new Error('有快捷槽的来源当前不可用，请重新核对。')
    await pins.resolveCarry(sessionId, chosen)
    updates.notify(sessionId)
    return sessionEquipment(sessionId)
  }

  async function enableProfileItem(id) {
    const manager = ctx.get('pluginManager')
    if (!manager || typeof id !== 'string') throw new Error('当前 Profile 无法管理插件。')
    const ecosystem = await discover()
    const item = ecosystem.equipment.get(id)
    if (!item?.manageable || (item.kind !== 'host' && item.kind !== 'bundle')) {
      throw new Error('这项装备需要通过 DSH 插件管理配置。')
    }
    if (item.enabled) return { application: 'applied' }
    const result = item.kind === 'host'
      ? await manager.setPluginEnabled(item.target, true)
      : await manager.setBundleEnabled(item.target, true)
    if (result.application !== 'applied' && result.application !== 'restart-required') {
      throw new Error(result.error?.diagnostic ?? 'DSH 未能启用此插件。')
    }
    return { application: result.application }
  }

  if (closed) return
  for (const asset of ['heroes', 'equipment', 'guest-heroes', 'gear-collection']) {
    const body = await readFile(new URL('./art/' + asset + '.webp', import.meta.url))
    ctx.effect(() => ctx.connection.fetch.register({
      path: route + '/' + asset + '.webp',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => new Response(body, {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400' },
      }),
    }))
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: artRoute,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: request => appearance.image(request),
  }))
  ctx.effect(() => ctx.connection.fetch.register({
    path: artRoute + '/upload',
    methods: ['POST'],
    requestBody: 'streaming',
    async fetch(request) {
      const query = new URL(request.url).searchParams
      const kind = query.get('kind')
      const id = query.get('id')
      const headers = { 'Cache-Control': 'no-store' }
      try {
        const signal = AbortSignal.any([lifetime.signal, request.signal])
        const image = await readArtwork(request, signal)
        await catalogTitle(kind, id)
        await appearance.save(kind, id, image, signal)
        updates.notify()
        return Response.json({ ok: true }, { headers })
      } catch (error) {
        const message = error instanceof Error ? error.message : '无法保存图片。'
        return Response.json({ ok: false, error: { message } }, { status: 422, headers })
      }
    },
  }))
  ctx.effect(() => ctx.connection.fetch.register({
    path: route + '/locale/en', methods: ['GET'], requestBody: 'buffered',
    fetch: () => Response.json(englishStrings, { headers: { 'Cache-Control': 'no-cache' } }),
  }))
  ctx.effect(() => {
    async function readSession(request) {
      const sessionId = new URL(request.url).searchParams.get('sessionId')
      const [value, savedTask, webPersonal] = await Promise.all([
        sessionEquipment(sessionId), planTaskSession(sessionId, request.signal).catch(() => undefined),
        webPilotPersonalSession(sessionId, request.signal).catch(() => undefined),
      ])
      if (webPersonal) value.webPilotPersonal = true
      const comparison = lighthouseComparisons.member(sessionId)
      if (comparison) value.lighthouseComparison = comparison
      const workspaceComparison = workspaceComparisons.member(sessionId)
      if (workspaceComparison) {
        const record = workspaceComparisons.read(workspaceComparison.id)
        const { lesson, scenario, reviewChallengeArm } = record
        const evidence = lesson === evidenceLesson
        const deliveryLesson = lesson === lighthouseLesson && workspaceComparison.arm === 'direct'
        const observed = (evidence || deliveryLesson || reviewChallengeArm) && !value.running &&
          await readComparisonArm(workspaceComparisons, record, workspaceComparison.arm, request.signal, {
            verifyPersonalDelivery: deliveryLesson, linkedChoicesOnly: deliveryLesson,
            includeFileCoordinates: Boolean(record.reviewReplaySource),
          })
        const evidenceReplay = completedLighthouseChallenge(record, observed)
        const deliveryReview = deliveryLesson && observed?.canRematch === true && observed.materialDelivered === true
        const materialState = (evidenceReplay || deliveryReview) &&
          ctx.get('workspaceRegistry')?.get(record.workspaceId)?.path === record.cwd &&
          await workspaceMaterialState(record, request.signal)
        const report = observedLighthouseEvidenceReport(record, observed, materialState)
        const reviewResult = observed?.status === 'complete' &&
          await verifiedReviewHandoff(workspaceComparisons, record, workspaceComparison.arm, request.signal, { observed })
        const canCompareOwnReview = record.reviewReplaySource && reviewResult &&
          Boolean(await ownReviewPair(record, request.signal, observed))
        value.workspaceComparison = { ...workspaceComparison, ...(lesson && { lesson }), ...(evidence && { scenario }),
          ...(reviewChallengeArm && { reviewChallengeArm }),
          ...((evidence || reviewChallengeArm) && observed?.status === 'waiting' && { firstTaskPending: true }),
          ...((evidence || reviewChallengeArm) && observed?.presetChanged && { presetChanged: true }),
          ...(evidence && observed?.lessonTaskSource && { lessonTaskSource: observed.lessonTaskSource }),
          ...(evidenceReplay && materialState === 'verified' && { canReplayLighthouseEvidence: true }),
          ...(deliveryReview && materialState === 'verified' && { canTryDeliveryReview: true }),
          ...(reviewResult && { reviewInvitation: reviewResult.played }),
          ...(reviewResult?.played === 'review' && !canCompareOwnReview && { canTryDirectDelivery: true }),
          ...(canCompareOwnReview && { canCompareOwnReview: true }),
          ...(report && { evidenceReportCode: encodeLighthouseEvidenceReport(report.choice, report.delivered) }) }
      }
      const planComparison = planComparisons.member(sessionId)
      if (planComparison) {
        value.planComparison = { ...planComparison, ...planComparisonLabels(planComparisons.read(planComparison.id), planComparison.arm) }
      }
      const rematch = rematchComparisons.member(sessionId)
      if (rematch) {
        const record = rematchComparisons.read(rematch.id)
        const { lesson, loadout, baseline } = record
        const reviewResult = !value.running && lesson === lighthouseLesson &&
          await verifiedReviewHandoff(rematchComparisons, record, rematch.arm, request.signal)
        value.rematchComparison = { ...rematch, heroName: loadout.heroName, ...(lesson && { lesson }),
          ...(reviewResult && { reviewInvitation: reviewResult.played }),
          ...(reviewResult?.played === 'review' && { canTryDirectDelivery: true }),
          ...evidenceReplayView(baseline) }
      }
      const heroMember = heroTrials.member(sessionId)
      if (heroMember && (await heroTrials.readArm(heroMember.id, heroMember.arm))?.opened) {
        const record = heroTrials.read(heroMember.id)
        const heroTrial = { ...heroMember, need: record.need }
        value.heroTrial = heroTrial
        if (!value.running) {
          let observed
          if (heroTrial.arm === lighthouseHeroDelivery) {
            const [original, replay] = await Promise.all([
              readHeroTrialArm(record, 'minimal', request.signal), readHeroTrialArm(record, lighthouseHeroDelivery, request.signal),
            ])
            observed = replay
            const lessonTaskSource = heroDeliveryLessonSource(record, original, replay)
            value.heroTrial = { ...heroTrial, ...(replay.status === 'waiting' && { firstTaskPending: true }),
              ...(replay.presetChanged && { presetChanged: true }),
              ...(lessonTaskSource && { verifiedDeliveryReplay: true, lessonTaskSource }) }
          } else {
            const stockTask = heroTrial.arm === 'standard' || record.need === 'summary'
            observed = await readHeroTrialArm(record, heroTrial.arm, request.signal, stockTask)
            if (observed.status === 'waiting') {
              value.heroTrial = { ...heroTrial, firstTaskPending: true, ...(observed.presetChanged && { presetChanged: true }) }
            } else if (stockTask) {
              const lessonTaskSource = await stockTrialTaskReference(record, observed, request.signal)
              if (lessonTaskSource) {
                const returnTasks = heroTrial.arm === 'standard' && record.need === 'original'
                  ? await standardReturnTasks(record, request.signal) : []
                value.heroTrial = { ...heroTrial, lessonTaskSource, ...(returnTasks.length && { returnTasks }) }
              }
            } else if (canReplayHeroDelivery(record, observed) && !(await heroTrials.readArm(heroTrial.id, lighthouseHeroDelivery))?.opened) {
              value.heroTrial = { ...heroTrial, canReplayMinimalDelivery: true }
            }
          }
          if (heroHandoffLanguage(record) && verifiedHeroHandoff(observed)) {
            value.heroTrial = { ...value.heroTrial, canCopyHeroReport: true }
          }
        }
      }
      if (savedTask?.launch) {
        const { planName, material, task, source, armory, webSourcePractice } = savedTask.launch
        const webPilotPractice = webSourcePractice?.arm
        const webPractice = webPilotPractice ? { webPilotPractice } : webSourcePractice ? { webSourcePractice: true } : {}
        if (savedTask.started) Object.assign(value, webPractice)
        if (!savedTask.started) value.planTask = { planName, material, task, ...webPractice,
          ...(source && { source }), ...(armory === true && { armory }), ...(savedTask.presetChanged && { presetChanged: true }) }
        else if (source) value.lessonTaskResult = true
        else if (armory === true && personalTaskTarget(savedTask.launch, savedTask.header)) {
          value.armoryTaskResult = true
          if (savedTask.header.agentPreset === 'standard' && !savedTask.presetChanged) {
            const reference = await armoryReviewReference(sessionId, request.signal)
            if (reference) value.armoryReview = reference
          }
        }
      }
      return Response.json({ ok: true, value: englishRequest(request) ? localizeDisplay(value) : value },
        { headers: { 'Cache-Control': 'no-store' } })
    }
    return ctx.connection.fetch.register({
      path: route + '/session',
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          return await readSession(request)
        } catch (error) {
          if (!request.signal.aborted) throw error
          return new Response(null, { status: 204 })
        }
      },
    })
  })
  ctx.on('tools/change', () => updates.notify(), { global: true })
  ctx.on('agent-loadout/executor-changed', scope => {
    if (!scope) return updates.notify()
    for (const agent of ctx.get('agents')?.list() ?? []) {
      if (toolRuntime.scopeChainOf(toolRuntime.scopeOf(agent.ctx)).includes(scope)) updates.notify(agent.id)
    }
  }, { global: true })
  ctx.on('commands/change', () => updates.notify(), { global: true })
  ctx.on('loader/config-update', () => updates.notify(), { global: true })
  // A provider that only registers during a turn can change without a tools/change event.
  ctx.on('loader/partial-dispose', entry => {
    if (toolRuntime && !toolRuntime.scopeOf(entry.ctx)) updates.notify()
  }, { global: true })
  ctx.on('internal/status', (fiber, previous) => {
    const entry = fiber.entry
    if (toolRuntime && entry && fiber.parent === entry.ctx && (fiber.state === 2 || previous === 2) &&
      !toolRuntime.scopeOf(entry.ctx)) updates.notify()
  }, { global: true })
  ctx.on('plugin-manager/changed', () => updates.notify(), { global: true })
  ctx.on('agent-preset/selected', sessionId => updates.notify(sessionId), { global: true })
  ctx.on('agent-loadout/panel-activity', (entry, sessionId, activity, occurredAt) => {
    if (ctx.get('agentLoadoutPanelActivities')?.owns(entry, activity)) recordPanelActivity(entry, sessionId, activity, occurredAt)
  }, { global: true })
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const admission = teamLaunchAdmissions.get(agent.id)
    if (!admission || agent.session.header.origin !== 'subagent' || agent.session.header.parentSession !== admission.parentId) return next()
    return await admission.ready && !signal.aborted ? next() : { kind: 'reject' }
  }, { global: true })
  ctx.on('agent/pre-step', async ({ agent, turn, messages, signal }, next) => {
    const heroTrial = heroTrials.member(agent.id)
    const comparisonStore = heroTrial ? heroTrials : materialComparisonStores.find(store => store.member(agent.id))
    if (!comparisonStore && !agent.id.startsWith(planTaskSessionPrefix)) return next()
    const submissions = messages.filter(message => message.source?.kind === 'user')
    const item = turn === 1 && submissions.length === 1 ? submissions[0] : undefined
    const replies = messages.filter(message => message.source?.kind === 'user-question-reply').map(message => message.source.callId)
    if (!item && !replies.length) return next()
    const member = comparisonStore?.member(agent.id)
    let target
    if (!member) {
      const { header, inheritedEventCount } = agent.session
      const { launch } = planTaskDetails({ header, inheritedEventCount, events: agent.session.snapshotEvents() })
      target = personalTaskTarget(launch, header)
      if (!target) return next()
    }
    const task = item?.content.length === 1 && item.content[0]?.type === 'text' && item.content[0].text === (member ?? target).task
    if (task || replies.length) {
      try {
        const material = heroTrial
          ? { ...await heroTrials.readArm(heroTrial.id, heroTrial.arm), material: lighthouseHeroMaterial }
          : member && comparisonStore.read(member.id)
        const state = member ? await workspaceMaterialState(material, signal) : await personalTaskMaterialState(target, signal)
        if (!signal.aborted) appendPluginRecord(agent.session, materialProofRecord, {
          turn, state, ...(task && { requestId: item.source.rpcId ?? null }), ...(replies.length && { replies }),
        })
      } catch {
        // Failure to record comparison evidence does not change the native turn.
      }
    }
    return next()
  }, { global: true })
  const reportEvents = new Set(['turn/start', 'turn/end', 'user/message', 'tool/call', 'tool/result',
    'tool/ptc-dispatch-start', 'tool/ptc-dispatch', 'command/run', 'command/done', 'compaction/end', toolSourceRecord, panelActivityRecord])
  ctx.on('session/event', (session, event) => {
    toolRecords.observe(session, event)
    shortcuts.observe(session, event)
    if (!closed) {
      try {
        if (event.type === 'turn/start') {
          const active = match(session.id)
          if (active?.agent.session === session) {
            const hero = matchHero(active.presetId, active.record)
            const delegation = delegatedWork(active.agent)
            toolRecords.share(session, hero, delegation)
            growth.begin(session, event, hero, growthLoadout(active), delegation)
          }
        } else if (event.type === 'command/done') {
          observeCommand(session, event)
        } else if (event.type === 'compaction/start' || event.type === 'compaction/summary' || event.type === 'compaction/end') {
          recordCompaction(session, event)
        } else {
          const executorCall = event.type === 'tool/call' ? observeExecutorCall(session, event) : undefined
          growth.observe(session, event, (heroId, needsProfile) => {
            const active = match(session.id)
            return { ready: active?.agent.session === session && matchHero(active.presetId, active.record).id === heroId
              ? growthLoadout(active) : [], profile: needsProfile ? profileGrowthEntries() : undefined }
          }, executorCall, rememberRuntimeUse)
        }
      } catch {
        if (!warnings.includes('progress.json')) warnings.push('progress.json')
      }
    }
    if (reportEvents.has(event.type)) updates.notify(session.id, 'report')
    if (event.type === 'team/mode') updates.notify()
    if (event.type === 'team/task' && event.data.teamId === session.id) {
      noteTeamCompletion(session, event)
      updates.notify(session.id)
      if (growth.teamQuest(session.id)?.teamTask.id === event.data.task?.id) queueMicrotask(() => {
        if (closed) return
        void refreshTeamTask(match(session.id)).catch(() => {
          if (!warnings.includes('progress.json')) warnings.push('progress.json')
        })
      })
    }
  }, { global: true })
  for (const event of ['agent/created', 'agent/disposed', 'agent/status']) {
    ctx.on(event, ({ agent }) => {
      if (event === 'agent/disposed') toolRecords.end(agent.session)
      updates.notify(agent.id)
    }, { global: true })
  }
  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: route + '/session-events', methods: ['GET'], requestBody: 'buffered', fetch: updates.connect,
    })
    return async () => { updates.close(); await dispose() }
  })
  ctx.effect(() => ctx.connection.fetch.register({
    path: route,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const headers = { 'Cache-Control': 'no-store' }
      const english = englishRequest(request)
      const success = value => Response.json({ ok: true, value: english ? localizeDisplay(value) : value }, { headers })
      try {
        if (request.method === 'GET') return success(await list())
        const selection = await readSelection(request)
        let value
        if (selection?.action === 'enable-profile') value = await enableProfileItem(selection.itemId)
        else if (selection?.action === 'legacy-presets') value = await legacy.list()
        else if (selection?.action === 'legacy-preset-preview') value = await legacy.preview(selection.id)
        else if (selection?.action === 'legacy-preset-attach' || selection?.action === 'legacy-preset-refresh') {
          value = await legacy.attach(selection.id, selection.revision, selection.skipMissing, selection.action === 'legacy-preset-refresh')
          updates.notify()
        }
        else if (selection?.action === 'verify-live') value = verifyLive(selection)
        else if (selection?.action === 'match-prompt') value = { text: (await matchPrompt({ ...selection, language: english ? 'en' : 'zh' })).text }
        else if (selection?.action === 'match-shortcut') value = await changeShortcut(selection)
        else if (selection?.action === 'match-shortcut-carry') value = await resolveShortcutCarry(selection)
        else if (selection?.action === 'match-plans') value = await matchPlans(selection)
        else if (selection?.action === 'teammate-roster') value = await teammateRoster(selection)
        else if (selection?.action === 'teammate-launch') value = await launchTeammate(selection, request.signal)
        else if (selection?.action === 'match-plan-preview') value = await previewMatchPlan(selection)
        else if (selection?.action === 'match-plan-continue') value = await continueMatchPlan(selection)
        else if (selection?.action === 'match-growth') value = await matchGrowth(selection)
        else if (selection?.action === 'growth-opening-choices') {
          value = await openingChoices(selection.draft, selection.restoreGear, selection.describe === true)
        }
        else if (selection?.action === 'growth-combo-preview') value = await previewQuestCombo(selection)
        else if (selection?.action === 'growth-open') value = await startWithQuest(selection, request.signal)
        else if (selection?.action === 'growth-starter-open') value = await startLighthouse(selection, english, request.signal)
        else if (selection?.action === 'web-source-preview') value = await previewWebSourcePractice(selection, english, request.signal)
        else if (selection?.action === 'web-source-open') value = await openReviewedTask(selection, english, request.signal, 'web-source')
        else if (selection?.action === 'web-pilot-preview') value = await previewWebPilot(selection, english, request.signal)
        else if (selection?.action === 'web-pilot-open') value = await openReviewedTask(selection, english, request.signal, 'web-pilot')
        else if (selection?.action === 'web-pilot-pending') value = await webPilotPending(selection, request.signal)
        else if (selection?.action === 'web-pilot-resume') value = await resumeFirstWebPilotDraft(selection, request.signal)
        else if (selection?.action === 'web-pilot-result') value = await readWebPilot(selection, request.signal)
        else if (selection?.action === 'web-pilot-challenge-share') value = await shareWebPilotChallenge(selection, request.signal)
        else if (selection?.action === 'web-pilot-handoff-report') value = await shareWebPilotReport(selection, request.signal)
        else if (selection?.action === 'web-pilot-handoff-compare') value = await compareWebPilotReport(selection, request.signal)
        else if (selection?.action === 'web-pilot-handoff-received') value = await compareReceivedWebPilotReport(selection, request.signal)
        else if (selection?.action === 'web-pilot-handoff-find') value = await findWebPilotReports(selection, request.signal)
        else if (selection?.action === 'web-pilot-handoff-trial-preview') value = await previewWebPilotReportTrial(selection, request.signal)
        else if (selection?.action === 'web-pilot-replays') value = await webPilotReplays(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-options') value = await webPilotPersonalOptions(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-open') value = await openWebSourcePersonal(selection, request.signal, 'web-pilot-personal')
        else if (selection?.action === 'web-pilot-personal-result') value = await webPilotPersonalResult(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-comparison') value = await webPilotPersonalComparison(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-pair') value = await webPilotPersonalPair(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-replay-preview') value = await previewWebPilotPersonalReplay(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-replay-open') value = await openWebPilotPersonalReplay(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-replays') value = await webPilotPersonalReplays(selection, request.signal)
        else if (selection?.action === 'web-pilot-personal-replay-resume') value = await resumeWebPilotPersonalReplay(selection, request.signal)
        else if (selection?.action === 'web-pilot-plan-save') {
          value = publicBuildPlan(await saveWebPilotPlan(selection, request.signal))
          updates.notify()
        }
        else if (selection?.action === 'web-source-result') value = await readWebSourcePractice(selection, request.signal)
        else if (selection?.action === 'web-source-choice') value = await chooseWebSourcePractice(selection, request.signal)
        else if (selection?.action === 'web-source-personal-options') value = await webSourcePersonalOptions(selection, request.signal)
        else if (selection?.action === 'web-source-personal-open') value = await openWebSourcePersonal(selection, request.signal)
        else if (selection?.action === 'hero-trial-create') value = await createHeroTrial(selection, english, request.signal)
        else if (selection?.action === 'hero-trial-open') value = await openComparisonArm(heroTrials, selection, english, request.signal)
        else if (selection?.action === 'hero-trial-open-from-task') value = await openStandardFromPersonal(selection, english, request.signal)
        else if (selection?.action === 'hero-trial-replay-preview') value = (await checkHeroDeliveryReplay(heroTrials.read(selection.comparisonId), request.signal)).view
        else if (selection?.action === 'hero-trial-replay-open') value = await openHeroDeliveryReplay(selection, english, request.signal)
        else if (selection?.action === 'hero-trial') {
          const record = selection.comparisonId === undefined ? heroTrials.latest() : heroTrials.read(selection.comparisonId)
          if (selection.comparisonId !== undefined && !record) throw new Error('找不到这组同题对照。')
          value = await readHeroTrial(record, request.signal)
        }
        else if (selection?.action === 'lighthouse-rematch-open') {
          value = await openLighthouseLesson({ launchId: selection.launchId }, english, request.signal)
        } else if (selection?.action === 'lighthouse-evidence-open') {
          const { launchId, scenario, openingChoice } = selection
          value = await openLighthouseLesson({ launchId, scenario, openingChoice }, english, request.signal, evidenceLesson)
        }
        else if (selection?.action === 'lighthouse-challenge-share') value = await shareLighthouseChallenge(selection, request.signal)
        else if (selection?.action === 'lighthouse-evidence-report') value = await evidenceHandoffReport(selection, request.signal)
        else if (selection?.action === 'lighthouse-evidence-report-compare') value = await evidenceHandoffReport(selection, request.signal, true)
        else if (selection?.action === 'lighthouse-evidence-repeat') value = await repeatLighthouseEvidence(selection, request.signal)
        else if (selection?.action === 'lighthouse-review-repeat') value = await repeatLighthouseReview(selection, english, request.signal)
        else if (selection?.action === 'lighthouse-review-start-preview') value = (await checkReviewStart(english, request.signal)).preview
        else if (selection?.action === 'lighthouse-review-start-open') value = await openReviewStart(selection, english, request.signal)
        else if (selection?.action === 'lighthouse-review-direct-preview') value = await previewLighthouseDirectRematch(selection, request.signal)
        else if (selection?.action === 'lighthouse-review-direct-open') value = await openLighthouseDirectRematch(selection, request.signal)
        else if (selection?.action === 'lighthouse-review-challenge-share') value = await shareReviewChallenge(selection, request.signal)
        else if (selection?.action === 'lighthouse-review-report') value = await reviewHandoffReport(selection, request.signal)
        else if (selection?.action === 'lighthouse-review-report-compare') value = await reviewHandoffReport(selection, request.signal, true)
        else if (selection?.action === 'lighthouse-review-report-replay') value = await replayReviewReport(selection, request.signal)
        else if (selection?.action === 'hero-trial-challenge-share') value = await shareHeroChallenge(selection, request.signal)
        else if (selection?.action === 'hero-trial-handoff-report') value = await heroHandoffReport(selection, request.signal)
        else if (selection?.action === 'hero-trial-handoff-compare') value = await heroHandoffReport(selection, request.signal, true)
        else if (selection?.action === 'lighthouse-challenge-preview') {
          value = isWebPilotChallenge(selection.code) ? await previewWebPilotChallenge(selection, request.signal)
            : isLighthouseHeroChallenge(selection.code) ? await previewHeroChallenge(selection.code, request.signal)
            : isLighthouseReviewChallenge(selection.code) ? (await checkReviewChallenge(selection.code, request.signal)).preview
            : (await checkLighthouseChallenge(selection.code, request.signal, selection.useLocal === true)).preview
        } else if (selection?.action === 'lighthouse-challenge-open') {
          value = isWebPilotChallenge(selection.code) ? await openReviewedTask(selection, english, request.signal, 'web-pilot-challenge')
            : isLighthouseHeroChallenge(selection.code) ? await openHeroChallenge(selection, request.signal)
            : isLighthouseReviewChallenge(selection.code) ? await openReviewChallenge(selection, request.signal)
            : await openLighthouseChallenge(selection, english, request.signal)
        }
        else if (selection?.action === 'lighthouse-pending-runs') value = await lighthouseRunList(selection, request.signal)
        else if (selection?.action === 'lighthouse-handoff-history') value = await lighthouseRunList(selection, request.signal, true)
        else if (selection?.action === 'lighthouse-comparison') value = await readComparison(lighthouseComparisons, selection, english, request.signal)
        else if (selection?.action === 'lighthouse-comparison-open') value = await openComparisonArm(lighthouseComparisons, selection, english, request.signal)
        else if (selection?.action === 'workspace-comparison') value = await readComparison(workspaceComparisons, selection, english, request.signal)
        else if (selection?.action === 'workspace-comparison-open') value = await openComparisonArm(workspaceComparisons, selection, english, request.signal)
        else if (selection?.action === 'plan-comparison') value = await readComparison(planComparisons, selection, english, request.signal)
        else if (selection?.action === 'plan-comparison-preview') value = await previewPlanComparison(selection, english, request.signal)
        else if (selection?.action === 'plan-comparison-open') value = await openComparisonArm(planComparisons, selection, english, request.signal)
        else if (selection?.action === 'rematch-comparison-options') value = await rematchOptions(selection, request.signal)
        else if (selection?.action === 'rematch-comparison-preview') value = await previewRematch(selection, request.signal)
        else if (selection?.action === 'rematch-comparison-open') {
          value = await openComparisonArm(rematchComparisons, { arm: 'rematch', launchId: selection.launchId,
            baselineSelection: selection }, english, request.signal)
        }
        else if (selection?.action === 'rematch-comparison') value = await readComparison(rematchComparisons, selection, english, request.signal)
        else if (selection?.action === 'comparison-history') value = await comparisonHistory(selection, request.signal)
        else if (selection?.action === 'comparison-loadout-preview') value = await comparisonLoadout(selection, request.signal)
        else if (selection?.action === 'evidence-replay-plan-save') {
          value = publicBuildPlan(await saveEvidenceReplayPlan(selection, request.signal))
          updates.notify()
        }
        else if (selection?.action === 'handoff-pair-plan-save') {
          value = publicBuildPlan(await savePersonalHandoffPlan(selection, request.signal))
          updates.notify()
        }
        else if (selection?.action === 'lesson-task-options') value = await lessonTaskOptions(selection, request.signal)
        else if (selection?.action === 'field-playbook-preview') value = await previewFieldPlaybook(selection)
        else if (selection?.action === 'match-settlements' || selection?.action === 'match-settlements-page') value = await matchSettlements(selection)
        else if (selection?.action === 'match-follow-up' || selection?.action === 'match-follow-up-preview') value = await matchFollowUp(selection)
        else if (selection?.action === 'match-proven-loadout') value = await previewProvenLoadout(selection, request.signal)
        else if (selection?.action === 'settlement-dismiss') {
          requireMatch(selection.sessionId)
          if (closed) throw new Error('配装服务正在关闭，请重试。')
          value = await growth.dismissReceipt(selection.sessionId, selection.id)
        }
        else if (selection?.action === 'growth-flags') value = await growthFlags()
        else if (selection?.action === 'hero-field-equipment') value = await heroFieldEquipment(selection)
        else if (selection?.action === 'equipment-field-heroes') value = await equipmentFieldHeroes(selection)
        else if (selection?.action === 'equipment-field-review') value = await equipmentFieldReview(selection)
        else if (selection?.action === 'equipment-pairing-preview') value = await previewEquipmentPairing(selection)
        else if (selection?.action === 'equipment-fitting-preview') value = await previewEquipmentFitting(selection)
        else if (selection?.action === 'relay-loadout-preview') value = await previewRelayLoadout(selection)
        else if (selection?.action === 'hero-round-history') value = await heroRoundHistory(selection)
        else if (selection?.action === 'growth-flag-loadout') value = await previewFlagLoadout(selection)
        else if (selection?.action === 'growth-journal') value = await growthJournal()
        else if (selection?.action === 'growth-frame') {
          if (closed) throw new Error('成长记录正在关闭，请重试。')
          value = await growth.setFrame(selection.kind, selection.id, selection.frame)
        }
        else if (selection?.action === 'growth-display') {
          if (closed) throw new Error('配装服务正在关闭，请重试。')
          value = await growth.displayFlag(selection.heroId, selection.id)
        }
        else if (selection?.action === 'growth-signature') {
          if (closed) throw new Error('成长记录正在关闭，请重试。')
          const [ecosystem, uploaded] = await Promise.all([discover(), appearance.index()])
          if (closed) throw new Error('成长记录正在关闭，请重试。')
          await growth.setSignature(selection.heroId, selection.id, selection.sourceId)
          value = displaySignatureFor(selection.heroId, packageArt(uploaded, ecosystem)) ?? null
        }
        else if (selection?.action === 'growth-accept') value = await acceptGrowthQuest(selection)
        else if (selection?.action === 'growth-handoff') value = await handoffGrowthQuest(selection, request.signal)
        else if (selection?.action === 'growth-claim' || selection?.action === 'growth-abandon') {
          const active = requireMatch(selection.sessionId)
          if (closed) throw new Error('配装服务正在关闭，请重试。')
          const claim = selection.action === 'growth-claim'
          if (claim) await refreshTeamTask(active)
          value = await growth.settleQuest(selection.sessionId, selection.id, claim, selection.rewardGear,
            quest => verifyTeamDelivery(active, quest))
        }
        else if (selection?.action === 'match-record') {
          if (closed) throw new Error('备战大厅正在关闭，请重试。')
          const submission = await matchPrompt({ ...selection, language: english ? 'en' : 'zh' })
          await receipts.record(selection.sessionId, selection.requestId, submission)
          value = { text: submission.text }
        } else if (selection?.action === 'match-report') {
          value = await readMatchReport(selection, request.signal)
        } else if (selection?.action === 'web-recovery-choice') {
          value = await chooseWebRecovery(selection, request.signal)
        }
        else if (selection?.action === 'actions-read') {
          await catalogTitle(selection.kind, selection.id)
          value = actions.read(selection.kind, selection.id)
        } else if (selection?.action === 'actions-save') {
          const title = await catalogTitle(selection.kind, selection.id)
          if (closed) throw new Error('备战大厅正在关闭，请重试。')
          value = await actions.write(selection, title)
          updates.notify()
        }
        else if (selection?.action === 'plan-save') {
          value = publicBuildPlan(await saveBuildPlan(selection))
          updates.notify()
        } else if (selection?.action === 'plan-evidence-origin') {
          value = await readPlanEvidenceOrigin(selection, request.signal)
        } else if (selection?.action === 'plan-handoff-origin') {
          value = await readPlanHandoffOrigin(selection, request.signal)
        } else if (selection?.action === 'plan-web-pilot-origin') {
          value = await readPlanWebPilotOrigin(selection, request.signal)
        } else if (selection?.action === 'plan-web-pilot-comparison') {
          value = await readPlanWebPilotComparison(selection, request.signal)
        } else if (selection?.action === 'plan-web-pilot-tested-options') {
          value = await webPilotTestedPlanOptions(selection, request.signal)
        } else if (selection?.action === 'plan-web-pilot-tested-compare') {
          value = await compareTestedWebPilotPlans(selection, request.signal)
        } else if (selection?.action === 'plan-web-pilot-options') {
          value = await webPilotPlanOptions(selection, request.signal)
        } else if (selection?.action === 'plan-web-pilot-open') {
          value = await openWebPilotPlan(selection, request.signal)
        } else if (selection?.action === 'evidence-retest-options') {
          value = await evidenceRetestOptions(selection, request.signal)
        } else if (selection?.action === 'evidence-retest-note') {
          value = await evidenceRetestNote(selection, request.signal)
        } else if (selection?.action === 'evidence-retest-note-save') {
          value = await evidenceRetestNote(selection, request.signal, true)
        } else if (selection?.action === 'workspace-materials') {
          value = await workspaceMaterials(selection, request.signal)
        } else if (selection?.action === 'lesson-task-materials') {
          value = await personalTaskMaterials(selection, request.signal)
        } else if (selection?.action === 'plan-task-preview') {
          value = await previewReviewedTask(await checkPlanTask(requestedPlanTask(selection, english), request.signal), request.signal)
        } else if (selection?.action === 'plan-task-open') {
          value = await openReviewedTask(selection, english, request.signal)
        } else if (selection?.action === 'plan-task-draft-restore') {
          value = await restorePlanTaskDraft(selection.sessionId, request.signal)
        } else if (selection?.action === 'lesson-task-preview') {
          value = await previewReviewedTask(await checkLessonTask(requestedLessonTask(selection, english), request.signal), request.signal)
        } else if (selection?.action === 'lesson-task-open') {
          value = await openReviewedTask(selection, english, request.signal, 'lesson')
        } else if (selection?.action === 'lesson-task-alternate-preview') {
          const input = await requestedHeroAlternateTask(selection, english, request.signal)
          value = await previewReviewedTask(await checkHeroAlternateTask(input, request.signal), request.signal)
        } else if (selection?.action === 'lesson-task-alternate-open') {
          value = await openHeroAlternateTask(selection, english, request.signal)
        } else if (selection?.action === 'armory-task-options') {
          value = { workspaceIds: await personalWorkspaceIds(request.signal) }
        } else if (selection?.action === 'armory-task-preview') {
          value = await previewReviewedTask(await checkArmoryTask(requestedArmoryTask(selection, english), request.signal), request.signal)
        } else if (selection?.action === 'armory-task-open') {
          value = await openReviewedTask(selection, english, request.signal, 'armory')
        } else if (selection?.action === 'lesson-task-result') {
          value = await readLessonTaskResult(selection, request.signal)
        } else if (selection?.action === 'plan-share-export') {
          value = await exportBuildShare(selection)
        } else if (selection?.action === 'plan-share-preview') {
          value = await previewBuildShare(selection)
        } else if (selection?.action === 'plan-share-options') {
          value = await shareOptions(selection, english)
        } else if (selection?.action === 'plan-share-adapt') {
          value = await adaptBuildShare(selection, english)
        } else if (selection?.action === 'plan-remove') {
          if (closed) throw new Error('配装服务正在关闭，请重试。')
          value = await buildPlans.remove(selection)
          updates.notify()
        }
        else if (selection?.action === 'compare') value = await compare(selection)
        else if (selection?.action === 'continue') {
          value = await continueLoadout(ctx, selection, verifyContinuation, request.signal)
        } else if (selection?.action === 'continue-queue') {
          const { sourceSessionId } = selection
          const anchor = queue.capture(sourceSessionId)
          const { presetId } = selection.equipmentIds === undefined ? selection : await prepare(selection)
          const title = records.get(presetId)?.definition.name ?? ctx.agentPresets.definitions?.get(presetId)?.config.name
            ?? presetLabels.get(presetId)?.[0] ?? presetId
          value = await queue.schedule({ sourceSessionId, presetId, title }, anchor)
        } else if (selection?.action === 'continue-cancel') {
          value = await queue.cancel(selection)
        } else if (selection?.action === 'continue-requeue') {
          value = await queue.requeue(selection)
        }
        else if (selection?.action === 'market-indexes') value = await market.indexes()
        else if (selection?.action === 'market-add') value = await market.add(selection)
        else if (selection?.action === 'market-search') value = await market.search(selection)
        else if (selection?.action === 'market-install') value = await market.install(selection, request.signal)
        else if (selection?.action === 'plan-review-activities') {
          value = [...planReviews.sources().values()].map(({ packageName, activity }) =>
            ({ packageName, id: activity.id, component: activity.component }))
        } else if (selection?.action === 'plan-review-record') value = recordPlanReview(selection)
        else if (selection?.action === 'plugin-review') value = await market.reviewSource(selection, request.signal)
        else if (selection?.action === 'plugin-import') value = await market.importPlugin(selection, request.signal)
        else if (selection?.action === 'equipment-review') value = customEquipmentPreview(await reviewEquipment(selection))
        else if (selection?.action === 'equipment-save') value = await addCustomEquipment(selection)
        else if (selection?.action === 'equipment-collection') value = await updateCollection(selection)
        else if (selection?.action === 'art-reset') {
          await catalogTitle(selection.kind, selection.id)
          await appearance.reset(selection.kind, selection.id)
          updates.notify()
        }
        else value = await prepare(selection)
        return success(value)
      } catch (error) {
        const message = error instanceof Error ? error.message : '配装暂时不可用。'
        return Response.json({ ok: false, error: { message: english ? englishText(message) : message } }, { status: 422, headers })
      }
    },
  }))
}
