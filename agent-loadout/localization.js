import { readFileSync } from 'node:fs'

export const englishStrings = JSON.parse(readFileSync(new URL('./strings.en.json', import.meta.url), 'utf8'))
export const englishText = text => Object.hasOwn(englishStrings, text) ? englishStrings[text] : text

// Keep IDs, configuration, source bindings, and user-supplied instructions intact.
const displayFields = new Set([
  'activationHint', 'badge', 'baseName', 'detail', 'description', 'hero', 'heroName',
  'label', 'message', 'name', 'profileError', 'questError', 'reason', 'sourceName', 'summary', 'title', 'trigger',
])
const displayLists = new Set(['decisions', 'heroMoves', 'labels', 'packageMoves', 'removed', 'restored', 'sourceNames', 'taskMove'])
const displayMaps = new Set(['equipmentLabels', 'equipmentSourceLabels', 'removedEquipmentLabels'])

function localizeBuild(value, result) {
  const prefix = value.baseName + ' · '
  if (typeof value.name !== 'string' || !value.name.startsWith(prefix)) return
  const gear = Object.values(value.equipmentLabels ?? {}).filter(label => typeof label === 'string')
  let name = result.baseName + value.name.slice(value.baseName.length)
  for (const label of gear) name = name.replace(label, englishText(label))
  result.name = name
}

export function localizeDisplay(value, field) {
  if (typeof value === 'string') {
    return displayFields.has(field) || displayLists.has(field) ? englishText(value) : value
  }
  if (Array.isArray(value)) return value.map(item => localizeDisplay(item, field))
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key, (key === 'roles' && !Array.isArray(item)) || displayMaps.has(key)
      ? Object.fromEntries(Object.entries(item ?? {}).map(([id, label]) => [id, typeof label === 'string' ? englishText(label) : label]))
      : localizeDisplay(item, key),
  ]))
  if (value.baseName && value.equipmentIds && value.equipmentLabels) localizeBuild(value, result)
  return result
}
