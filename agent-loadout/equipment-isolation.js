import { isConfiguredEquipment } from './configured-equipment.js'

export const agentPluginModule = 'dsh-agent-loadout/agent-plugins'
export const agentPluginUrl = new URL('./agent-plugins.js', import.meta.url).href

const scopePrefix = /^dsh-agent-loadout:loadout-[a-f0-9]{24}:/

export function isAgentPlugin(name) {
  return name === agentPluginModule || name === agentPluginUrl
}

export function declaredRealm(label) {
  return typeof label === 'string' ? label.replace(scopePrefix, '') : label
}

function mapRow(row, realm) {
  let result = row
  if (row.isolate && typeof row.isolate === 'object') {
    result = { ...result, isolate: Object.fromEntries(Object.entries(row.isolate)
      .map(([name, label]) => [name, realm(name, label)])) }
  }
  if (row.group === true && Array.isArray(row.config)) {
    return { ...result, config: row.config.map(child => mapRow(child, realm)) }
  }
  if (isConfiguredEquipment(row.name) && Array.isArray(row.config?.plugins)) {
    return { ...result, config: { ...row.config, plugins: row.config.plugins.map(child => mapRow(child, realm)) } }
  }
  if (isAgentPlugin(row.name) && Array.isArray(row.config?.units)) {
    return { ...result, config: { ...row.config, units: row.config.units.map(unit => ({ ...unit, row: mapRow(unit.row, realm) })) } }
  }
  return result
}

export function declaredIsolation(row) {
  return mapRow(row, (_, label) => declaredRealm(label))
}

export function composeIsolation(rows, realms, presetId) {
  if (!realms?.length) return rows
  const owned = new Set(realms.map(realm => JSON.stringify(realm)))
  return rows.map(row => mapRow(row, (name, label) => owned.has(JSON.stringify([name, label]))
    ? 'dsh-agent-loadout:' + presetId + ':' + label : label))
}
