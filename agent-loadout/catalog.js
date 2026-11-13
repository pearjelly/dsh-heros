import { loadoutPackage, presetDeclarer } from './package-actions.js'

const native = name => '@deepseek-ai/dsh-' + name
const askUser = native('tool-ask-user')

export const equipment = [
  {
    id: 'evidence',
    name: '证据核验',
    summary: '结论缺少关键证据时，停在提交前，请你决定如何处理。',
    trigger: '关键结论缺少可核实的依据',
    decisions: [
      ['继续补证', '列出待补材料、来源和需要核实的问题。'],
      ['降级推荐', '改为有保留的推荐，标出依据和缺口。'],
      ['暂缓提交', '保留草稿，等待补充材料或人工决定。'],
    ],
    workflow: true,
    requires: askUser,
  },
  {
    id: 'web',
    name: '网页检索',
    summary: '用网页搜索和页面读取，为判断补上公开来源。',
    trigger: '材料需要外部公开来源佐证',
    decisions: [
      ['引用公开来源', '核对原文与发布日期，再把来源写入结论。'],
      ['保留未核实项', '公开资料无法佐证时，明确标注证据缺口。'],
    ],
    module: native('tool-web'),
    config: { fetch: true, searchTimeoutMs: 60000 },
  },
  {
    id: 'review',
    name: '交付前复核',
    summary: '需要确认的交付先给你看草稿，再决定下一步。',
    trigger: '交付草稿已经准备好',
    decisions: [
      ['确认交付', '根据你的明确确认进入后续步骤。'],
      ['退回修改', '把意见应用到下一版草稿。'],
    ],
    workflow: true,
    requires: askUser,
  },
  {
    id: 'present',
    name: '交付物预览',
    summary: '把生成的文件放进对话的交付物区域，便于查看和交接。',
    trigger: '工作区已生成可交付文件',
    decisions: [
      ['查看交付物', '从对话打开文件，检查实际内容。'],
      ['继续修改', '针对实际文件提出修改意见。'],
    ],
    module: native('tool-present'),
  },
]

export const presetCopy = {
  standard: ['标准模式', '文件处理、检索和交付的通用工作方式。'],
  minimal: ['极简模式', '用更少的工具完成直接的任务。'],
  ptc: ['PTC 模式', '通过程序编排多次工具调用。'],
  cordis: ['创造模式', '在对话中开发和配置 DSH 插件。'],
}

export const roles = {
  general: '通用',
  scout: '侦察',
  craft: '制作',
  orchestration: '编排',
  guard: '核验',
  support: '支援',
  specialist: '专精',
}

const heroRoles = new Map([
  ['standard', ['general']], ['minimal', ['general']], ['ptc', ['orchestration']],
  ['cordis', ['craft']], ['recruiting-advisor', ['guard']],
])

const featuredRoles = new Map([
  ['evidence', ['guard']], ['web', ['scout']], ['review', ['guard']], ['present', ['support']],
])

const nativeToolRoles = new Map(Object.entries({
  glob: 'scout', grep: 'scout', read: 'scout', read_file: 'scout', web_search: 'scout', web_fetch: 'scout',
  mcp_list_resources: 'scout', mcp_read_resource: 'scout', list_mcp_resources: 'scout',
  list_mcp_resource_templates: 'scout', read_mcp_resource: 'scout', read_image: 'scout',
  edit: 'craft', edit_file: 'craft', write: 'craft', write_file: 'craft', apply_patch: 'craft',
  office_render: 'craft', office_convert: 'craft', office_recalculate: 'craft',
  bash: 'orchestration', run_code: 'orchestration', workflow: 'orchestration',
  spawn_agent: 'orchestration', send_input: 'orchestration', list_agents: 'orchestration',
  wait_agent: 'orchestration', send_message: 'orchestration', subagent: 'orchestration',
  subagent_fork: 'orchestration', list_subagent_models: 'orchestration', job_output: 'orchestration',
  job_list: 'orchestration', job_kill: 'orchestration', schedule_create: 'orchestration',
  schedule_list: 'orchestration', schedule_view: 'orchestration', schedule_edit: 'orchestration',
  schedule_update: 'orchestration', schedule_delete: 'orchestration', pwsh: 'orchestration', interrupt_agent: 'orchestration',
  ask_user_question: 'guard', exit_plan_mode: 'guard', cordis_inspect_list: 'guard', cordis_inspect_query: 'guard',
  present: 'support', present_files: 'support', working_directory: 'support', todo_write: 'support',
  get_goal: 'support', create_goal: 'support', update_goal: 'support', skill: 'support', plugin_manager: 'support',
}))

const nativeModuleRoles = new Map(Object.entries({
  'dsh-tool-web': 'scout', 'dsh-tool-file-read': 'scout', 'dsh-tool-file-search': 'scout',
  'dsh-tool-ask-user': 'guard', 'dsh-plan-note': 'guard', 'dsh-tool-present': 'support',
  'dsh-tool-working-directory': 'support', 'dsh-tool-agent-team': 'orchestration',
  'dsh-tool-bash': 'orchestration', 'dsh-tool-ptc': 'orchestration',
  'dsh-tool-fs-search': 'scout', 'dsh-tool-session-query': 'scout', 'dsh-mcp-resources': 'scout',
  'dsh-web-fetch-http': 'scout', 'dsh-web-search-deepseek': 'scout', 'dsh-tool-office': 'craft', 'dsh-office-kit': 'craft',
  'dsh-tool-fs': 'craft', 'dsh-tool-pwsh': 'orchestration', 'dsh-workflow-ptc': 'orchestration',
  'dsh-tool-subagent': 'orchestration', 'dsh-tool-subagent-control': 'orchestration', 'dsh-tool-jobs': 'orchestration',
  'dsh-tool-schedule': 'orchestration', 'dsh-tool-workflow': 'orchestration', 'dsh-tool-executor-ptc': 'orchestration',
  'dsh-plan-mode': 'guard', 'dsh-user-approval': 'guard', 'dsh-user-questions': 'guard', 'dsh-tool-cordis': 'guard',
  'dsh-tool-goal': 'support', 'dsh-tool-todo': 'support', 'dsh-tool-skill': 'support', 'dsh-command-compact': 'support',
  'dsh-plugin-manager/tools': 'support',
}))

function toolRole(name) {
  return name.startsWith('team_task_') ? 'orchestration' : nativeToolRoles.get(name)
}

const toolPurposes = [
  ['guard', /^(?:approve|audit|check|compare|confirm|inspect|review|validate|verify)\b|^(?:审批|审核|审查|复核|核验|核对|校验|校对|验证|检查|比对|确认)/u],
  ['scout', /^(?:browse|fetch|find|get|list|look\s*up|read|report|retrieve|search|query)\b|^(?:读取|检索|搜索|查询|查找|查看|获取|列出)/u],
  ['craft', /^(?:build|convert|create|draft|draw|edit|format|generate|import|ingest|modify|patch|place|render|resize|restore|save|transform|update|write)\b|^(?:创建|制作|绘制|渲染|生成|编辑|写入|撰写|转换|更新|导入|恢复)/u],
  ['orchestration', /^(?:cancel|delegate|dispatch|enqueue|orchestrate|schedule|trigger)\b|^run (?:an? |the )?(?:automated|workflow|script|program|command|batch)\b|^(?:编排|调度|触发|派发|委派|执行(?:脚本|命令|程序|工作流))/u],
  ['support', /^(?:deliver|export|notify|present|publish|send|share|upload)\b|^(?:交付|导出|通知|展示|发布|发送|共享|上传)/u],
]

function inferredToolRole({ name, summary }) {
  // An MCP prefix identifies the server, which can offer tools with different purposes.
  const action = name.split('__').at(-1).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()
  const purpose = summary?.trimStart().toLowerCase() ?? ''
  return toolPurposes.find(([, pattern]) => pattern.test(action))?.[0]
    ?? toolPurposes.find(([, pattern]) => pattern.test(action.split(' ').at(-1)))?.[0]
    ?? toolPurposes.find(([, pattern]) => pattern.test(purpose))?.[0]
    ?? 'specialist'
}

function knownRoles(values) {
  const known = [...new Set(values.filter(value => value !== 'specialist'))]
  return known.length ? known : ['specialist']
}

export function packageRoleReader(ctx) {
  const manifests = new Map()
  function read(modules, kind, id) {
    const declared = []
    for (const module of modules) {
      if (!module?.moduleName) continue
      const { moduleName, baseUrl = ctx.baseUrl } = module
      const key = JSON.stringify([moduleName, baseUrl])
      if (!manifests.has(key)) {
        let fields
        try { fields = loadoutPackage(ctx, moduleName, baseUrl)?.manifest?.dsh?.loadout?.roles } catch {
          // A missing package declaration does not affect registration.
        }
        manifests.set(key, fields)
      }
      const group = manifests.get(key)?.[kind]
      const values = id === undefined ? group : group && Object.hasOwn(group, id) ? group[id] : undefined
      if (Array.isArray(values)) declared.push(...values.filter(value => typeof value === 'string' && Object.hasOwn(roles, value)))
    }
    return [...new Set(declared)]
  }
  return {
    hero(id, modules = []) {
      const own = read([presetDeclarer(ctx, id)], 'heroes', id)
      return own.length ? own : read(modules, 'heroes', id)
    },
    tool(name, modules) { return read(modules, 'tools', name) },
    gear(modules, kind = 'equipment') { return read(modules, kind) },
  }
}

export function equipmentRoles(item, provided = [], declared = []) {
  const featured = featuredRoles.get(item.id)
  if (featured) return featured
  if (item.kind === 'tool') {
    if (declared.length) return knownRoles(declared)
    return [item.transport ? 'orchestration' : toolRole(item.name) ?? inferredToolRole(item)]
  }
  const observed = new Set(declared)
  for (const tool of provided) for (const role of tool.roles ?? equipmentRoles(tool)) observed.add(role)
  for (const name of item.provides ?? []) {
    const role = toolRole(name)
    if (role) observed.add(role)
  }
  for (const name of item.modules ?? (item.module ? [item.module] : [])) {
    const role = nativeModuleRoles.get(name.replace(/^@deepseek-ai\//, ''))
    if (role) observed.add(role)
  }
  return knownRoles([...observed])
}

export function presetRoles(id, supplied, declared = []) {
  const builtIn = heroRoles.get(id)
  if (builtIn) return builtIn
  return declared.length ? knownRoles(declared) : knownRoles(supplied.flat())
}
