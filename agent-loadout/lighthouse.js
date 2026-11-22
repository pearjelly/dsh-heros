import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

const pattern = '[0-9][0-9]-*.md'
const supplyCard = '02-lighthouse.md'
const openingId = /^[a-f0-9]{32}$/
const rematchPrefix = 'lighthouse-rematch-'
const evidencePrefix = 'lighthouse-evidence-'
const evidenceReplayPrefix = 'lighthouse-evidence-replay-'
export const lighthouseEvidenceScenarios = ['gap', 'confirmed']
const evidenceDecisionLabels = new Map([
  ['继续补证', 'gather'], ['Gather more evidence', 'gather'], ['Continue gathering evidence', 'gather'],
  ['降级推荐', 'qualify'], ['Qualify the recommendation', 'qualify'], ['Lower the recommendation to a qualified draft', 'qualify'],
  ['暂缓提交', 'pause'], ['Pause submission', 'pause'],
])
export const lighthouseEvidenceChoices = ['gather', 'qualify', 'pause']
export const lighthouseEvidenceDecision = choices => choices.length === 1 ? evidenceDecisionLabels.get(choices[0]) : undefined
const reviewDecisionLabels = new Map([
  ['确认交付', 'confirm'], ['确认交接', 'confirm'], ['confirm handoff', 'confirm'], ['confirm delivery', 'confirm'], ['approve delivery', 'confirm'],
  ['退回修改', 'revise'], ['请求修改', 'revise'], ['revise draft', 'revise'], ['request changes', 'revise'],
])
export const lighthouseReviewDecision = label => reviewDecisionLabels.get(label.normalize('NFKC').trim().toLowerCase()) ?? 'answered'
const cards = {
  '01-waystation.md': '# Mountain Waystation / 山口驿站\n\nCopper marker · Stone stairs\n\n铜色路标 · 补给在石阶旁\n',
  [supplyCard]: '# North Shore Lighthouse / 北岸灯塔\n\n**Marker / 徽记** · Gold beacon / 金色航标\n\n**Supply point / 补给点** · Second-floor lookout / 二层瞭望台\n\n**Supplies / 可领取** · 2 cans of lamp oil, 1 signal flag / 灯油 × 2、信号旗 × 1\n',
  '03-old-bridge.md': '# Old Wooden Bridge / 旧木桥\n\nSilver marker · East pier\n\n银色桥印 · 补给在东侧桥墩\n',
}

export function lighthouseTask(route, english) {
  const title = route === 'delivery' ? '灯塔补给行动 · 交付' : '灯塔补给行动 · 侦察'
  const globCall = JSON.stringify({ pattern })
  const presentCall = JSON.stringify({ files: [{ path: supplyCard, description: english ? 'Lighthouse supply card' : '北岸灯塔补给卡' }] })
  const brief = english
    ? `Find the North Shore Lighthouse supply card. First call glob with ${globCall} in the current workspace.`
    : `找到北岸灯塔的补给卡。先在当前工作区调用 glob，参数为 ${globCall}。`
  if (route === 'delivery') {
    return { title, brief: brief + (english
      ? ` Then call present with ${presentCall} in the same turn to share the Markdown card in the conversation. Wait for present to succeed before ending the turn.`
      : ` 在同一回合继续调用 present，参数为 ${presentCall}。等 present 成功把补给卡交付到对话后再结束本回合。`) }
  }
  return { title, brief: brief + (english
    ? ' Report the matching path in your reply and stop there.'
    : ' 在回复中报出对应的文件路径，完成侦察。') }
}

export const lighthouseDirectory = directory => join(directory, 'lighthouse-supply-run')

async function seedWorkspace(path, registry, title, verifyContents = false) {
  await mkdir(path, { recursive: true })
  if (!(await lstat(path)).isDirectory()) throw new Error('灯塔练习工作区不可用。')
  for (const [name, content] of Object.entries(cards)) {
    const file = join(path, name)
    try {
      await writeFile(file, content, { flag: 'wx' })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (!(await lstat(file)).isFile()) throw new Error('灯塔练习工作区不可用。')
      if (verifyContents && await readFile(file, 'utf8') !== content) {
        throw new Error('示例材料已修改，请另开一组同题对照。')
      }
    }
  }
  return registry.create(path, title)
}

export function lighthouseWorkspace(directory, registry) {
  return seedWorkspace(lighthouseDirectory(directory), registry, 'Lighthouse Supply Run · 灯塔补给行动')
}

export const lighthouseRematchTask = english => english
  ? 'Read the North Shore Lighthouse supply card. Summarize where to collect the supplies and what to check. Hand off the original card in this conversation when it is ready.'
  : '阅读北岸灯塔补给卡，简要说明领取地点和需要核对的事项。准备好后，在当前对话交付原始补给卡。'

export async function lighthouseRematchLesson(directory, registry, launchId, english) {
  if (typeof launchId !== 'string' || !openingId.test(launchId)) throw new Error('开局请求无效，请重试。')
  const path = join(directory, rematchPrefix + launchId)
  const workspace = await seedWorkspace(path, registry, 'Lighthouse Rematch · 灯塔换装练习', true)
  return { workspace, material: supplyCard, task: lighthouseRematchTask(english) }
}

export function lighthouseEvidenceTask(english, scenario) {
  const confirmed = scenario === 'confirmed'
  const claim = confirmed
    ? (english ? '2 cans of lamp oil' : '两罐灯油')
    : (english ? 'two spare batteries' : '两节备用电池')
  return english
    ? `Read the North Shore Lighthouse supply card. A dispatch note reports ${claim} for the next shift. Check what the selected card actually supports before recommending what to hand off. If a recommendation is ready, write it separately and attach it in this conversation.`
    : `阅读北岸灯塔补给卡。一条调度消息说还为下一班准备了${claim}。先核对所选补给卡实际支持哪些说法，再建议本次交接内容。准备好交接稿时，另存一份并在当前对话交付。`
}

export async function lighthouseEvidenceLesson(directory, registry, launchId, english, scenario) {
  if (typeof launchId !== 'string' || !openingId.test(launchId)) throw new Error('开局请求无效，请重试。')
  const path = join(directory, evidencePrefix + launchId)
  const workspace = await seedWorkspace(path, registry, 'Lighthouse evidence choices · 灯塔证据取舍', true)
  return { workspace, material: supplyCard, task: lighthouseEvidenceTask(english, scenario) }
}

export const lighthouseEvidenceReplayDirectory = (directory, id) => join(directory, evidenceReplayPrefix + id)

export function lighthouseEvidenceReplayWorkspace(directory, registry, id) {
  return seedWorkspace(lighthouseEvidenceReplayDirectory(directory, id), registry, 'Lighthouse evidence replay · 灯塔证据复赛', true)
}

export const lighthouseArms = ['recon', 'delivery']
export const lighthouseHeroArms = ['standard', 'minimal']
export const lighthouseHeroDelivery = 'minimal-present'
export const lighthouseHeroNeeds = ['original', 'summary']
export const lighthouseHeroTrialFolder = 'lighthouse-hero-trial'
export const lighthouseHeroMaterial = supplyCard
export const lighthouseHeroContents = cards[supplyCard]

export const lighthouseHeroTask = english => english
  ? '[Hero handoff trial]\nRead 02-lighthouse.md in this workspace. Write a short handoff in this conversation with the pickup location, the listed supplies, and the source filename. If the native present tool is available, attach the original card. Leave the workspace files unchanged.'
  : '【英雄同题试玩】\n阅读当前工作区的 02-lighthouse.md。在对话里写一段简短的交接说明，包含领取地点、卡上列出的物资和来源文件名。如果原生 present 工具可用，把原卡附到当前对话。请保持工作区文件原样。'

export function lighthouseHeroWorkspace(directory, arm, registry) {
  const titles = { standard: 'Lighthouse handoff · 标准模式 Standard', minimal: 'Lighthouse handoff · 极简模式 Minimal',
    [lighthouseHeroDelivery]: 'Lighthouse handoff · 极简模式交付复赛 Minimal delivery replay' }
  const title = titles[arm]
  return seedWorkspace(join(directory, arm), registry, title, true)
}

export function lighthousePracticeContains(profileDataRoot, candidateCanonicalPath) {
  const path = relative(profileDataRoot, candidateCanonicalPath)
  if (!path || path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) return false
  const [folder, id, arm] = path.split(sep)
  return folder === 'lighthouse-supply-run' ||
    [rematchPrefix, evidencePrefix, evidenceReplayPrefix].some(prefix => folder.startsWith(prefix) && openingId.test(folder.slice(prefix.length))) ||
    (folder === 'lighthouse-comparisons' && openingId.test(id) && lighthouseArms.includes(arm)) ||
    (folder === lighthouseHeroTrialFolder + 's' && openingId.test(id) &&
      (lighthouseHeroArms.includes(arm) || arm === lighthouseHeroDelivery))
}

export const lighthouseComparisonTask = english => english
  ? '[Lighthouse comparison]\nFind the North Shore Lighthouse supply card in this workspace. Verify where it is. If you can attach the card in this conversation, deliver the original file. If you can only bring back its path, use a question card to let me choose “Keep the path for now” or “Keep looking for material we can deliver”. Report what you brought back and anything I still need to confirm.'
  : '【灯塔同题对照】\n用当前工作区的文件找到北岸灯塔补给卡。先核对文件位置。如果当前能够把补给卡作为附件交到对话，请交付原文件。如果当前只能带回路径，请用提问卡让我选择「先保留路径」或「继续找可交付的材料」。最后说清带回了什么，以及还需要我确认什么。'

export function lighthouseComparisonWorkspace(directory, arm, registry) {
  const title = arm === 'recon' ? 'Lighthouse Comparison · 侦察 Recon' : 'Lighthouse Comparison · 交付 Delivery'
  return seedWorkspace(join(directory, arm), registry, title, true)
}
