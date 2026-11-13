import { createHash } from 'node:crypto'
import { composeIsolation } from './equipment-isolation.js'
import { runtimeModule } from './loader-support.js'

export const name = 'agent-loadout-session-plugins'
export const inject = ['agentPresets', 'pluginPackages', 'loader']
export { agentPluginModule, agentPluginUrl, isAgentPlugin } from './equipment-isolation.js'

export async function apply(ctx, { units, realms }) {
  const [{ Entry, EntryTree }, { prepareProfileEntries }, { auditRows, leakedServices }] = await Promise.all([
    runtimeModule(ctx, '@deepseek-ai/cordis-plugin-loader'),
    runtimeModule(ctx, '@deepseek-ai/dsh-app-boot'),
    runtimeModule(ctx, '@deepseek-ai/dsh-agent-preset-registry'),
  ])

  class EquipmentTree extends EntryTree {
    write() {}
  }

  ctx.on('agent/created', async ({ agent }) => {
    const sessionNamespace = 'loadout-' + createHash('sha256').update('session:' + agent.id).digest('hex').slice(0, 24)
    // Keep each agent's trees off the shared Loader entry inherited by its context.
    const mount = agent.ctx.extend({ [Entry.key]: undefined }).plugin({
      name: 'agent-loadout-session-equipment',
      async apply(scope) {
        const trees = []
        for (const { row, baseUrl } of units) {
          const tree = new EquipmentTree(scope.extend({ baseUrl: baseUrl ?? ctx.baseUrl }))
          scope.effect(() => () => tree.root.stop())
          const rows = composeIsolation([structuredClone(row)], realms, sessionNamespace)
          const entries = prepareProfileEntries(scope, rows, tree.ctx.baseUrl)
          await tree.root.update(entries)
          trees.push(tree)
        }
        const audits = await Promise.all(trees.map(auditRows))
        const problems = audits.flatMap(({ failed, pending }) => [...failed, ...pending])
        problems.push(...leakedServices(scope, scope.fiber).map(name => '服务需要声明隔离域 ' + name))
        if (problems.length) throw new Error('会话装备加载失败\n' + problems.join('\n'))
      },
    })
    try {
      await mount.await()
    } catch (error) {
      await mount.dispose()
      throw error
    }
  })
}
