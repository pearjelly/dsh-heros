import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const pattern = '[0-9][0-9]-*.md'
const supplyCard = '02-lighthouse.md'
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

export async function lighthouseWorkspace(directory, registry) {
  const path = lighthouseDirectory(directory)
  await mkdir(path, { recursive: true })
  if (!(await lstat(path)).isDirectory()) throw new Error('灯塔练习工作区不可用。')
  for (const [name, content] of Object.entries(cards)) {
    const file = join(path, name)
    try {
      await writeFile(file, content, { flag: 'wx' })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (!(await lstat(file)).isFile()) throw new Error('灯塔练习工作区不可用。')
    }
  }
  return registry.create(path, 'Lighthouse Supply Run · 灯塔补给行动')
}
