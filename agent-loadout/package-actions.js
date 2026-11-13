import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isConfiguredEquipment } from './configured-equipment.js'

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)
}

export function moduleReference(entry) {
  return entry && { moduleName: entry.options.name, baseUrl: entry.parent?.tree.ctx.baseUrl }
}

export function presetDeclarer(ctx, id) {
  return moduleReference(ctx.agentPresets.definitions?.get(id)?.context?.fiber?.entry)
}

export function declaredModules(row, baseUrl) {
  if (!row || row.disabled === true) return []
  if (isConfiguredEquipment(row.name) && Array.isArray(row.config?.plugins)) {
    return row.config.plugins.flatMap(child => declaredModules(child, row.config.baseUrl ?? baseUrl))
  }
  if (row.group === true && Array.isArray(row.config)) {
    return row.config.flatMap(child => declaredModules(child, baseUrl))
  }
  return [{ moduleName: row.name, baseUrl }]
}

function text(value, limit) {
  return typeof value === 'string' && value.length <= limit ? value.trim() : ''
}

function localPackage(moduleName, baseUrl) {
  let file
  if (isAbsolute(moduleName)) file = pathToFileURL(moduleName)
  else if (moduleName.startsWith('file:')) file = new URL(moduleName)
  else if (/^\.\.?\//.test(moduleName) && baseUrl?.startsWith('file:')) file = new URL(moduleName, baseUrl)
  if (!file) return
  let dir = dirname(realpathSync(fileURLToPath(file)))
  while (dir !== dirname(dir) && basename(dir) !== 'node_modules') {
    const manifestPath = join(dir, 'package.json')
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.name === 'string') return { name: manifest.name, manifest, manifestPath }
      return
    } catch (error) {
      if (error.code !== 'ENOENT') return
    }
    dir = dirname(dir)
  }
}

export function packageActions(ctx) {
  const packages = new Map()

  function fromModules(modules, group, target) {
    const found = new Map()
    for (const module of modules) {
      if (!module?.moduleName) continue
      const { moduleName, baseUrl = ctx.baseUrl } = module
      const key = JSON.stringify([moduleName, baseUrl])
      if (!packages.has(key)) {
        let pkg
        try { pkg = loadoutPackage(ctx, moduleName, baseUrl) } catch {
          // Optional package metadata does not affect the loaded plugin.
        }
        packages.set(key, pkg)
      }
      const pkg = packages.get(key)
      if (!pkg || found.has(pkg.manifestPath)) continue
      const section = pkg.manifest?.dsh?.loadout?.actions?.[group]
      const declared = target === undefined ? section
        : section && Object.hasOwn(section, target) ? section[target] : undefined
      if (!Array.isArray(declared)) continue
      const actions = new Map()
      for (const move of declared.slice(0, 24)) {
        if (!move || typeof move.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(move.id) || actions.has(move.id)) continue
        const name = text(move.name, 48)
        const instruction = text(move.instruction, 4000)
        if (!name || !instruction || (move.requiresInput !== undefined && typeof move.requiresInput !== 'boolean')) continue
        actions.set(move.id, {
          id: 'package:' + digest([pkg.name, group, target, move.id]),
          name, detail: text(move.detail, 160), instruction, requiresInput: move.requiresInput === true, publisher: pkg.name,
        })
      }
      if (actions.size) found.set(pkg.manifestPath, [...actions.values()])
    }
    return found
  }

  return {
    hero(id, modules = []) {
      const fromDeclarer = fromModules([presetDeclarer(ctx, id)], 'heroes', id)
      if (fromDeclarer.size) return fromDeclarer.values().next().value
      const candidates = fromModules(modules, 'heroes', id)
      return candidates.size === 1 ? candidates.values().next().value : []
    },
    equipment(modules) {
      const actions = [...fromModules(modules, 'equipment').values()].flat()
      const counts = new Map()
      for (const move of actions) counts.set(move.id, (counts.get(move.id) ?? 0) + 1)
      return actions.filter(move => counts.get(move.id) === 1)
    },
    tool(name, modules) {
      const candidates = fromModules(modules, 'tools', name)
      return candidates.size === 1 ? candidates.values().next().value : []
    },
    bundle(name) {
      return fromModules([{ moduleName: name }], 'bundle').values().next().value ?? []
    },
  }
}

export function loadoutPackage(ctx, moduleName, baseUrl = ctx.baseUrl) {
  return ctx.pluginPackages.packageOf(moduleName, baseUrl) ?? localPackage(moduleName, baseUrl)
}

export function describePackageActions(actions) {
  return actions.map(({ name, detail }) => [name, detail])
}

export function publishedToolActions(reader, name, sources) {
  const candidates = sources.map(source => ({ ...source, moves: reader.tool(name, [source.module]) }))
  const counts = new Map()
  for (const { moves } of candidates) {
    for (const move of moves) counts.set(move.id, (counts.get(move.id) ?? 0) + 1)
  }
  return candidates.map(source => ({ ...source, moves: source.moves.filter(move => counts.get(move.id) === 1) }))
    .filter(source => source.moves.length).sort((a, b) => a.moves[0].publisher.localeCompare(b.moves[0].publisher))
}

export function packageActionRecord(kind, id, title, actions, source) {
  return { kind, id, title, actions, revision: digest([kind, id, source, actions]), published: true }
}
