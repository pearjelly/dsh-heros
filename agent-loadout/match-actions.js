import { createHash } from 'node:crypto'
import { equipment } from './catalog.js'
import { englishText } from './localization.js'
import { stockToolNames, toolKey } from './ecosystem.js'
import { englishShortcutPromptPrefix, shortcutPromptPrefix } from './match-shortcuts.js'

const [gatherEvidence, qualifyRecommendation, pauseSubmission] = equipment.find(item => item.id === 'evidence').decisions
const actions = {
  evidence: [
    ['check', '核对关键证据', '核对当前建议，发现缺口时让我选择下一步。',
      '核对当前建议的关键结论和实际来源。若缺少关键证据，请用 DSH 的提问卡让我在继续补证、降级推荐和暂缓提交中选择。'],
    ['gather', ...gatherEvidence,
      '继续补齐当前建议所需的证据。列出待核实的结论、应找的材料及其来源。有已提供的材料时先核对；缺少材料时向我索取。'],
    ['qualify', ...qualifyRecommendation,
      '把当前建议改成有保留的推荐草稿，分别标出已核实的依据、推断和待补证据。将草稿留在当前对话。'],
    ['pause', ...pauseSubmission,
      '将当前建议标记为暂缓提交，保留草稿并列出恢复评估所需的材料。等待我明确恢复后再进行提交、发送或发布。'],
  ],
  web: [
    ['source', '检索公开来源', '找原文并核对日期，给当前结论补上来源。',
      '用可用的网页检索工具为当前问题寻找公开来源。核对原文、出处和日期，标注仍然无法核实的结论。请勿把个人信息或内部材料提交到公开搜索。'],
    ['flag', '标记待核实', '在稿件中标出当前无法从公开资料证实的部分。',
      '把当前稿件中还缺少公开依据的结论标记为待核实，写清证据缺口。'],
  ],
  review: [
    ['preview', '复核交付草稿', '先看拟交付内容，再在对话中决定是否继续。',
      '将当前待交付的草稿或预览发在当前对话里。请用 DSH 的提问卡让我决定确认交付或退回修改。'],
    ['revise', '退回修改', '按补充的意见修改草稿，交回对话复核。',
      '按下方意见修改当前待交付的草稿，并在当前对话中展示修改结果。', true],
  ],
  present: [
    ['show', '预览交付物', '把已经生成的文件展示在当前会话。',
      '用交付物预览工具展示当前任务已经生成的文件。如果无法确定文件，请向我询问。'],
    ['revise', '继续修改', '根据补充意见修改文件，并展示更新后的版本。',
      '根据下方意见修改当前交付物，并用交付物预览工具展示更新后的文件。', true],
  ],
}

const heroSpecialties = new Map([
  ['standard', ['核对后交付', '核对输入、结果和未解决的问题，整理成可验收的交付。',
    '核对当前任务的输入和已有结果。补齐当前会话能完成的工作，列出交付物、核对过的内容和待确认的问题。']],
  ['minimal', ['完成最小交付', '集中完成一个可验收的结果，留下需要后续处理的事项。',
    '从给定任务中确定一个最小可验收的结果。用直接步骤完成它，并把暂时做不了的部分单列为后续事项。']],
  ['ptc', ['编排批量处理', '把重复工作拆成批次，给出核验样本和异常清单。',
    '把这项重复工作拆成可以核验的批次。使用当前可用的程序工具处理适合批量执行的部分，汇报抽查结果和失败项。']],
  ['cordis', ['核对插件接入', '检查插件所需的服务和配置，给出接入或排查结果。',
    '根据当前任务检查 DSH 插件的服务依赖、配置和加载状态。列出已验证的接入条件、问题与可复核的下一步。']],
  ['recruiting-advisor', ['区分证据与判断', '逐项标出已核实的依据、顾问判断和待补证据。',
    '核对当前候选人材料。把可追溯的事实、顾问判断和待补证据分开，给出可供人工验收的评估草稿。']],
])
const defaultHeroMove = ['按当前预设交付', '沿用这位英雄的工作方式，完成给定任务。',
  '沿用当前 Agent Preset 的工作方式和本会话可用的能力完成给定任务。整理可验收的结果，并标明需要我确认的事项。']

export function actionKey(targetId, { id, name, instruction, requiresInput }) {
  return createHash('sha256').update(JSON.stringify([targetId, id, name, instruction, Boolean(requiresInput)])).digest('hex')
}

export function heroActions(id) {
  const specialty = heroSpecialties.get(id)
  return [defaultHeroMove, ...(specialty ? [specialty] : [])].map(([name, detail, instruction], index) => {
    const move = { id: index ? 'hero:specialty' : 'hero:delivery', name, detail, instruction, requiresInput: true }
    return { ...move, proofKey: actionKey(id, move) }
  })
}

export function equipmentActions(id) {
  return (Object.hasOwn(actions, id) ? actions[id] : []).map(([moveId, name, detail, instruction, requiresInput]) => ({
    id: moveId, name, detail, requiresInput, proofKey: actionKey(id, { id: moveId, name, instruction, requiresInput }),
  }))
}

export const equipmentTaskId = 'gear:task'

export function equipmentTask(item) {
  const kind = item?.kind
  if (kind !== 'tool' && kind !== 'plugin' && kind !== 'host' && kind !== 'bundle') return
  const tool = kind === 'tool'
  return {
    id: equipmentTaskId,
    name: tool ? '用工具完成任务' : '核验装备作用',
    detail: tool ? '用所选工具处理给定的任务，回看调用结果。' : '核对装备对当前任务的作用，判断继续、补齐条件或换装。',
    instruction: tool
      ? '围绕给定任务使用所选工具，说明调用结果和还需要确认的事项。如果本回合工具没有出现或调用失败，请说明遇到的情况。'
      : '围绕给定任务核验所选装备的作用。用可核对的配置、工具结果或产出说明能验证的影响，并列出待确认的条件。请我根据这些依据选择继续当前方案、补齐条件或回城换装。',
    requiresInput: true,
  }
}

export function equippedActions(record, schemas) {
  const names = new Set(schemas.map(schema => schema.name))
  return equipment.filter(item => record?.equipmentIds.includes(item.id) && actions[item.id]).map(item => ({
    id: item.id, name: item.name, summary: item.summary,
    ready: stockToolNames(item.module ?? item.requires).some(name => names.has(name)),
    actions: equipmentActions(item.id),
  }))
}

export function actionInput(input) {
  if (typeof input !== 'string' || input.length > 4000) {
    throw new Error('请输入 4000 字以内的任务或补充材料。')
  }
  return input.trim()
}

function promptFor(title, name, instruction, note, text) {
  return `【${title}】${name}\n${instruction}${note ? text('\n\n补充材料或要求\n') + note : ''}`
}

const originalText = text => text
const languageText = language => language === 'en' ? englishText : originalText

export function questPrompt(quest, input, support, language) {
  const text = languageText(language)
  const task = actionInput(input)
  if (!task) throw new Error('请填写要发送的任务。')
  if (support) {
    const label = '分回合连携 · 取证'
    const instruction = text('请使用当前会话的工具 ') + JSON.stringify(support.name)
      + text(' 取得以下任务所需的依据。列出发现、出处和证据缺口，停在这里让我查看，再决定是否进入下一阶段。')
    return { text: promptFor(text(label), quest.title.replace(/\s+/gu, ' '), instruction, task, text),
      move: { kind: 'quest', id: quest.id, title: quest.title, label, questId: quest.id } }
  }
  const mode = quest.mode === 'relay' && quest.gear ? '装备接力'
    : { delivery: '交付委托', trial: '装备试炼', combo: '连携挑战', relay: '接力委托' }[quest.mode]
  const gear = quest.pair ?? (quest.gear ? [quest.gear] : [])
  const tools = gear.filter(item => item.kind === 'tool').map(item => JSON.stringify(item.name))
  const equipment = gear.filter(item => item.kind !== 'tool').map(item => item.name)
  const instructions = [
    quest.mode === 'relay' ? quest.relay.first
      ? text('依据第一棒留下的结果和依据继续工作，说明交付成果和待确认事项。')
      : text('完成接力的第一棒，记录实际结果、依据和下一位英雄需要处理的事项。')
      : text('完成以下任务，并说明实际产出和待确认事项。'),
    tools.length && text('请使用当前会话的工具 ') + tools.join(text('、')) + text(' 完成相应工作。'),
    equipment.length && text('请结合当前会话的装备 ') + equipment.map(text).join(text('、')) + text(' 完成相应工作。'),
    gear.length && text('如果指定装备当前不可用，请说明缺少的条件。'),
  ].filter(Boolean).join('\n')
  return { text: promptFor(text(mode), quest.title.replace(/\s+/gu, ' '), instructions, task, text),
    move: { kind: 'quest', id: quest.id, title: quest.title, label: mode, questId: quest.id } }
}

export function equipmentPrompt(record, schemas, { equipmentId, moveId, toolId, input, language }, shortcut) {
  const text = languageText(language)
  const note = actionInput(input)
  if (toolId !== undefined) {
    const tool = shortcut ?? schemas.find(schema => toolKey(schema) === toolId)
    if (!tool) throw new Error('这个工具当前未注册，请刷新对局装备。')
    if (!note) throw new Error('请说明要用这个工具完成的任务。')
    const prefix = language === 'en' ? englishShortcutPromptPrefix : shortcutPromptPrefix
    const activation = shortcut?.deferred ? text('\n工具会按自身条件在回合中注册。如果工具没有出现或调用失败，请说明遇到的情况。') : ''
    return { text: `${prefix}${JSON.stringify(tool.name)}${text(' 完成以下任务。')}${activation}\n\n${note}`,
      move: { kind: 'tool', id: toolId, title: tool.name, label: activation ? '安排快捷装备' : shortcut ? '使用快捷装备' : '使用工具',
        ...(shortcut && { shortcut }) } }
  }
  const item = equippedActions(record, schemas).find(item => item.id === equipmentId)
  if (!item?.ready) throw new Error('这件装备当前无法使用，请检查对局装备。')
  const action = actions[item.id].find(([id]) => id === moveId)
  if (!action) throw new Error('这项装备操作不可用。')
  const [, name, , instruction, requiresInput] = action
  if (requiresInput && !note) throw new Error('请填写要修改的内容。')
  return { text: promptFor(text(item.name), text(name), text(instruction), note, text),
    move: { kind: 'gear', id: item.id, title: item.name, label: name,
      proofKey: actionKey(item.id, { id: moveId, name, instruction, requiresInput }) } }
}

export function actionPrompt(record, schemas, { moveId, input, language }) {
  const text = languageText(language)
  const move = record.actions.find(move => move.id === moveId)
  if (!move) throw new Error('这项操作当前不可用。')
  const note = actionInput(input)
  if (move.requiresInput && !note) throw new Error('请填写补充材料或要求。')
  const toolName = record.kind === 'gear' && (record.toolName ?? schemas.find(schema => toolKey(schema) === record.id)?.name)
  const instruction = [toolName && text('请使用当前会话的工具 ') + JSON.stringify(toolName) + text('。'),
    record.builtIn ? text(move.instruction) : move.instruction, record.context]
    .filter(Boolean).join('\n')
  return { text: promptFor(record.builtIn ? text(record.title.replace(/\s+/gu, ' ')) : record.title.replace(/\s+/gu, ' '),
    record.builtIn ? text(move.name) : move.name, instruction, note, text),
    move: { kind: record.kind, id: record.id, title: record.title, label: move.name, proofKey: actionKey(record.id, move) } }
}
