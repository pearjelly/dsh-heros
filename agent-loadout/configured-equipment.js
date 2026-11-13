import { runtimeModule } from './loader-support.js'

export const name = 'agent-loadout-configured-equipment'
export const inject = ['loader', 'pluginPackages']
export const configuredEquipmentModule = 'dsh-agent-loadout/configured-equipment'
export const configuredEquipmentUrl = import.meta.url

export function isConfiguredEquipment(name) {
  return name === configuredEquipmentModule || name === configuredEquipmentUrl
}

function checkCompatibility(requested, prepared) {
  for (const [index, row] of requested.entries()) {
    if (row.disabled === true) continue
    const checked = prepared[index]
    if (checked.disabled === true) {
      throw new Error('当前 DSH 的兼容性检查拒绝了 ' + row.name + '。')
    }
    if (row.group && Array.isArray(row.config)) checkCompatibility(row.config, checked.config)
  }
}

export async function apply(ctx, { baseUrl, plugins }) {
  const [{ EntryTree }, { prepareProfileEntries }] = await Promise.all([
    runtimeModule(ctx, '@deepseek-ai/cordis-plugin-loader'),
    runtimeModule(ctx, '@deepseek-ai/dsh-app-boot'),
  ])
  class ConfiguredEquipmentTree extends EntryTree {
    write() {}
  }
  // Attach to the wrapper's native Loader entry so the preset audit and tool
  // attribution can traverse the configured modules as one equipment piece.
  const tree = new ConfiguredEquipmentTree(ctx.extend({ baseUrl: baseUrl ?? ctx.baseUrl }))
  ctx.effect(() => () => tree.root.stop())
  const entries = prepareProfileEntries(ctx, plugins, tree.ctx.baseUrl)
  checkCompatibility(plugins, entries)
  await tree.root.update(entries)
}
