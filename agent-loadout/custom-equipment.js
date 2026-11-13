import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { configuredEquipmentModule } from './configured-equipment.js'
import { childModules, moduleLabel, unitFingerprint } from './ecosystem.js'
import { entryYaml, runtimeModule } from './loader-support.js'

function pluginId(row) {
  return 'plugin:' + unitFingerprint(row)
}

function validateRows(rows, entryListProblem) {
  const problem = entryListProblem(rows)
  if (problem) throw new Error(problem)
  if (!rows.length) throw new Error('配置里需要至少一条插件记录。')
  const ids = new Set()
  function visit(entries) {
    for (const row of entries) {
      if (row.id !== undefined) {
        if (typeof row.id !== 'string' || !row.id.trim()) throw new Error('插件记录的 ID 需要是非空文本。')
        if (ids.has(row.id)) throw new Error('插件记录的 ID 重复：' + row.id)
        ids.add(row.id)
      }
      if (row.group === true) visit(row.config)
    }
  }
  visit(rows)
}

export async function reviewCustomEquipment(ctx, { text, title, directory } = {}, boundTool) {
  if (typeof text !== 'string' || !text.trim() || typeof title !== 'string'
    || (directory !== undefined && typeof directory !== 'string')) {
    throw new Error('请输入模块名或 Cordis 插件配置。')
  }
  const [{ parse, applyEntryPatches }, { entryListProblem }] = await Promise.all([
    entryYaml(ctx), runtimeModule(ctx, '@deepseek-ai/dsh-agent-preset-registry'),
  ])
  let document
  try {
    const parsed = parse(text)
    document = JSON.parse(JSON.stringify(parsed))
    if (!isDeepStrictEqual(parsed, document)) throw new Error('配置包含无法保存的值。')
  } catch (error) {
    throw new Error('无法读取装备配置。' + error.message)
  }
  let plugins = typeof document === 'string' ? [{ name: document }]
    : document?.name ? [document] : document?.plugins ?? document
  if (Array.isArray(plugins) && plugins.some(row => row?.insert)) {
    plugins = applyEntryPatches([], plugins, (message, ...args) => {
      throw new Error(message.replace(/%C/g, () => String(args.shift())))
    })
  }
  validateRows(plugins, entryListProblem)
  let baseUrl
  let baseDirectory
  if (directory?.trim()) {
    if (!isAbsolute(directory.trim())) throw new Error('加载目录需要填写本机绝对路径。')
    baseDirectory = await realpath(directory.trim())
    if (!(await stat(baseDirectory)).isDirectory()) throw new Error('加载路径需要指向目录。')
    baseUrl = pathToFileURL(baseDirectory + sep).href
  }
  const row = {
    name: configuredEquipmentModule,
    config: { ...(baseUrl ? { baseUrl } : {}), plugins, ...(boundTool ? { boundTool } : {}) },
  }
  const id = pluginId(row)
  row.id = 'custom-' + id.slice('plugin:'.length)
  const modules = childModules(row)
  return { id, row, title: title.trim() || moduleLabel(modules[0] ?? '自定义装备'), baseDirectory }
}

export function customEquipmentPreview({ id, row, title, baseDirectory }) {
  return { id, title, modules: childModules(row), baseDirectory, boundTool: row.config.boundTool }
}

export function equipmentRecordKey(record) {
  return record.row.config.boundTool?.id ?? record.id
}

export function checkCustomEquipment(record, key) {
  const tool = record?.row?.config?.boundTool
  if (record?.row?.name !== configuredEquipmentModule || !Array.isArray(record.row.config?.plugins)
    || typeof record.title !== 'string' || !record.title || pluginId(record.row) !== record.id
    || (tool !== undefined && (!/^tool:[a-f0-9]{12}$/.test(tool?.id) || typeof tool.name !== 'string'
      || (tool.summary !== undefined && typeof tool.summary !== 'string')
      || (tool.deferred !== undefined && tool.deferred !== true)))
    || equipmentRecordKey(record) !== key) {
    throw new Error('Invalid custom equipment record: ' + key)
  }
}
