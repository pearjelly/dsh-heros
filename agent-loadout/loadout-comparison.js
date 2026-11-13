import { equipment } from './catalog.js'
import { moduleLabel, profileToolSource, stockToolNames, toolSource } from './ecosystem.js'
import { equippedToolBindings } from './tool-bindings.js'

function sourceFor(ecosystem, id) {
  if (id === 'profile') return profileToolSource
  const profile = ecosystem.profileSources.get(id)
  if (profile?.sourceName) return { sourceId: id, sourceName: profile.sourceName }
  return toolSource(ecosystem.equipment.get(id))
}

function sharedSource(ecosystem, providers) {
  const sources = new Map()
  for (const id of providers) {
    const source = sourceFor(ecosystem, id)
    if (source) sources.set(source.sourceId, source)
  }
  if (sources.size === 1) return sources.values().next().value
}

export function summarizeCapabilities(ecosystem, presetId, { record, units, removed, runtime, questGear }) {
  const replaced = new Set(removed)
  for (const unit of units?.values() ?? []) if (unit.replaceId) replaced.add(unit.replaceId)
  const plugins = new Map()
  for (const unit of runtime?.presetPlugins ?? ecosystem.unitsByPreset.get(presetId) ?? []) {
    if (unit.active && !replaced.has(unit.id) && !(runtime && unit.sessionRecipe)) plugins.set(unit.id, unit)
  }
  for (const unit of runtime?.plugins ?? []) plugins.set(unit.id, unit)
  for (const [id, unit] of units ?? []) plugins.set(id, unit)

  const cards = new Map()
  const add = card => cards.set(card.id, card)
  for (const unit of plugins.values()) {
    if (questGear && (unit.persona || unit.boundTool)) continue
    const source = unit.row.config?.sourceUnitId ?? unit.id
    const item = ecosystem.equipment.get(source) ?? ecosystem.equipment.get(unit.id)
    add({ id: source, name: item?.name ?? unit.row.id ?? moduleLabel(unit.row.name),
      summary: item?.summary === unit.row.name ? undefined : item?.summary,
      kind: 'plugin', ...(unit.sessionRecipe && !runtime ? { timing: 'startup' } : {}) })
  }
  const featured = equipment.filter(item => record?.equipmentIds.includes(item.id))
  for (const item of featured) {
    add({ id: item.id, name: item.name, kind: 'effect', summary: item.summary, decisions: item.decisions,
      toolNames: stockToolNames(item.module ?? item.requires) })
  }

  function tool(id, item, timing, source, conditional) {
    if (!item) return
    const gated = conditional ?? (item.conditional || item.conditionalSources?.has(source?.sourceId))
    add({ id, name: item.name, kind: 'tool', summary: item.summary, timing: gated && timing !== 'turn' ? 'condition' : timing,
      transport: item.transport, ...source })
  }
  if (runtime) {
    for (const item of runtime.tools.values()) tool(item.id, item, undefined,
      { sourceId: item.sourceId, sourceName: item.sourceName })
    return cards
  }
  const executor = ecosystem.executorByPreset.get(presetId)
  const chosenExecutor = Array.from(units?.keys() ?? []).find(id => ecosystem.executorUnits.has(id))
  for (const [id, provider] of ecosystem.standingByPreset.get(presetId) ?? []) {
    const item = ecosystem.equipment.get(id)
    if (!replaced.has(provider) && !(item?.transport && chosenExecutor && chosenExecutor !== executor)) {
      tool(id, item, undefined, sourceFor(ecosystem, provider), item?.conditionalPresets?.has(presetId))
    }
  }
  if (replaced.has(executor) && !chosenExecutor) {
    for (const [id, sourceId] of ecosystem.hostTransports) {
      tool(id, ecosystem.equipment.get(id), undefined, sourceFor(ecosystem, sourceId))
    }
  }
  const featuredModules = new Set(units && featured.map(item => item.module ?? item.requires))
  for (const item of ecosystem.equipment.values()) {
    if (item.kind !== 'tool' || cards.has(item.id)) continue
    const standing = item.providers.filter(id => units?.has(id))
    if (standing.length) {
      tool(item.id, item, undefined, sharedSource(ecosystem, standing))
      continue
    }
    if (item.providers.some(id => ecosystem.equipment.get(id)?.modules.some(module => featuredModules.has(module)))) {
      tool(item.id, item)
      continue
    }
    const live = [...item.liveProviders].filter(([id]) => plugins.has(id))
    if (live.length) tool(item.id, item, live.every(([, deferred]) => deferred) ? 'turn' : 'startup',
      sharedSource(ecosystem, live.map(([id]) => id)))
  }
  for (const binding of equippedToolBindings(record)) {
    const observed = sourceFor(ecosystem, binding.profile ? binding.profileSourceId ?? 'profile' : binding.equipId)
    const sourceId = record.equipmentSources?.[binding.id] ?? observed?.sourceId
    const sourceName = record.equipmentSourceLabels?.[binding.id] ?? observed?.sourceName
    tool(binding.id, ecosystem.equipment.get(binding.id) ?? binding,
      binding.standing ? undefined : binding.deferred ? 'turn' : 'startup', { sourceId, sourceName })
  }
  if (replaced.size) {
    const standing = ecosystem.standingNamesByPreset.get(presetId)
    const names = new Set([...cards.values()].filter(card => card.kind === 'tool').map(card => card.name))
    for (const [id, sourceId] of ecosystem.hostTools) {
      const item = ecosystem.equipment.get(id)
      if (replaced.has(standing?.get(item.name)) && !names.has(item.name)) tool(id, item, undefined, sourceFor(ecosystem, sourceId))
    }
  }
  return cards
}

function changedDecisions(card, reference) {
  const existing = new Set(reference.decisionKeys ?? reference.decisions?.map(move => JSON.stringify(move)))
  return card.decisions?.flatMap((move, index) => existing.has(card.decisionKeys?.[index] ?? JSON.stringify(move))
    ? [] : [{ move, trial: card.decisionTrials?.[index] ?? null }]) ?? []
}

export function compareCapabilities(before, after, art) {
  function ordered(cards) {
    const rank = { effect: 0, tool: 1, plugin: 2 }
    return cards.sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name, 'zh-CN'))
      .map(({ decisionKeys, ...card }) => ({ ...card, art: art('gear', card.id, card.sourceId) }))
  }
  const gained = [...after.values()].filter(card => !before.has(card.id))
  const lost = [...before.values()].filter(card => !after.has(card.id))
  const timingChanges = [...after.values()].filter(card => before.has(card.id) && before.get(card.id).timing !== card.timing)
    .map(card => ({ ...card, fromTiming: before.get(card.id).timing }))
  const sourceChanges = [...after.values()].flatMap(card => {
    const previous = before.get(card.id)
    if (card.kind !== 'tool' || !card.sourceId || !previous?.sourceId || card.sourceId === previous.sourceId) return []
    const from = previous.sourceName ?? previous.sourceId.slice(-6)
    const to = card.sourceName ?? card.sourceId.slice(-6)
    const added = changedDecisions(card, previous)
    const removed = changedDecisions(previous, card)
    return [{ ...card, fromSourceId: previous.sourceId, fromSourceName: from === to ? from + ' · ' + previous.sourceId.slice(-6) : from,
      sourceName: from === to ? to + ' · ' + card.sourceId.slice(-6) : to,
      ...(added.length && { gainedDecisions: added.map(item => item.move), gainedDecisionTrials: added.map(item => item.trial) }),
      ...(removed.length && { lostDecisions: removed.map(item => item.move) }) }]
  })
  return { gained: ordered(gained), lost: ordered(lost), timingChanges: ordered(timingChanges), sourceChanges: ordered(sourceChanges) }
}
