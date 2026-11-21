import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerSessionKey } from './session-key.mjs'

function peerRows(label, toolName) {
  return [
    { id: 'peer-seed', name: './peer-seed.mjs', isolate: { fixturePeerSeed: label } },
    { id: 'peer-ledger', name: './peer-ledger.mjs', isolate: { fixturePeerSeed: label, fixturePeerLedger: label } },
    { id: 'peer-tool', name: './peer-tool.mjs', config: { toolName }, isolate: { fixturePeerLedger: label } },
  ]
}

function providerRows(name) {
  const rows = peerRows('fixture-provider-' + name, 'fixture_shared_marker')
  const tool = rows.at(-1)
  tool.id = name + '-ledger'
  tool.config.sourceTag = name
  return rows
}

function vaultRows() {
  const rows = peerRows('fixture-vault', 'fixture_vault_ledger')
  rows.at(-1).config.turnTool = { trigger: 'fixture inspect vault', name: 'fixture_vault_seal' }
  return rows
}

export const inject = ['agentPresets', 'agents', 'connection', 'tools', 'sessionController', 'pluginPackages', 'loader',
  'llm', 'sessionQuery', 'workspaceRegistry']

function mcp(moduleName, serverName) {
  return {
    id: 'mcp-service',
    name: moduleName,
    config: {
      transport: 'stdio',
      serverName,
      command: process.env.DSH_LOADOUT_TEST_NODE,
      args: [fileURLToPath(new URL('./mcp-server.mjs', import.meta.url))],
      failOnStartupError: true,
    },
  }
}

export async function apply(ctx) {
  const turns = new Map()
  const shadowed = new Map()
  const lateShadows = new Set()
  const rejectedResults = new Set()
  const heldResults = new Map()
  const shadowCalls = new Map()
  const localKeys = new Map()
  const teamLaunchGates = new Map()
  const handoffQuestions = new Map()
  ctx.on('agent/created', async ({ agent, signal }) => {
    const session = agent.session
    if (session.header.origin !== 'subagent' || !session.snapshotEvents().some(event =>
      event.type === 'subagent/descriptor' && event.data.label === '更改中的共享任务')) return
    const gate = Promise.withResolvers()
    const parentId = session.header.parentSession
    teamLaunchGates.set(parentId, { childId: agent.id, release: gate.resolve })
    signal?.addEventListener('abort', gate.resolve, { once: true })
    try {
      if (!signal?.aborted) await gate.promise
    } finally {
      signal?.removeEventListener('abort', gate.resolve)
      teamLaunchGates.delete(parentId)
    }
  }, { global: true })
  ctx.on('user-questions/request', (request, next) => {
    const question = request.questions[0]
    if (question?.id === 'fixture-lighthouse-route') {
      return { answers: [{ id: question.id, selected: [question.options[0].label] }] }
    }
    if (question?.id === 'fixture-delivery-review') {
      const sessionId = request.agent.id
      const answer = Promise.withResolvers()
      const abort = () => answer.reject(request.signal.reason)
      request.signal?.addEventListener('abort', abort, { once: true })
      handoffQuestions.set(sessionId, { question, resolve: answer.resolve })
      return answer.promise.finally(() => {
        request.signal?.removeEventListener('abort', abort)
        handoffQuestions.delete(sessionId)
      })
    }
    if (!question?.intent?.callId?.startsWith('fixture-plan-')) return next()
    const approve = question.intent.callId.endsWith('-approve')
    return { answers: [{ id: question.id, selected: [approve ? 'Approve' : 'Keep planning'],
      ...(approve ? {} : { custom: '先核对路径来源。' }) }] }
  }, { global: true, prepend: true })
  function shadowTool(agent, differentSchema = false) {
    const definition = ctx.tools.get('quartz_note', agent)
    return agent.ctx.tools.register({ ...definition,
      ...(differentSchema ? { description: 'A different tool with the same name.' } : {}),
      async execute() {
        shadowCalls.set(agent.id, (shadowCalls.get(agent.id) ?? 0) + 1)
        return 'shadow'
      },
    })
  }
  ctx.on('tools/execute', async (execution, next) => {
    if (execution.name !== 'quartz_note' || !lateShadows.delete(execution.agent?.id)) return next()
    await Promise.resolve()
    const dispose = shadowTool(execution.agent)
    try {
      return await next()
    } finally {
      await dispose()
    }
  }, { global: true })
  ctx.on('tools/post-execute', async (execution, result, next) => {
    const { agent } = execution
    const header = agent?.session.header
    const parentId = header?.origin === 'subagent' ? header.parentSession : undefined
    const hold = heldResults.get(agent?.id)
    const parentHold = heldResults.get(parentId)
    const owner = hold && !hold.child && hold.tool === execution.name ? agent.id
      : parentHold?.child && parentHold.tool === execution.name ? parentId : undefined
    if (owner && heldResults.delete(owner)) {
      await ctx.fixtureTurnGate.wait(agent.id, execution.signal)
    }
    if (execution.name !== 'quartz_note' || result.isError || !rejectedResults.delete(execution.agent?.id)) return next()
    return { kind: 'block', feedback: [{ type: 'text', text: 'Fixture rejected the successful tool body.' }] }
  }, { global: true })
  const llm = ctx.pluginPackages.packageOf('@deepseek-ai/dsh-llm', ctx.baseUrl)
  const { LlmAdapter } = await import(pathToFileURL(createRequire(llm.manifestPath).resolve(llm.name)).href)
  class FixtureModel extends LlmAdapter {
    async listModels(provider) { return [{ provider, id: 'fixture', name: 'Fixture' }] }
    async *stream({ messages, tools, system }) {
      const users = messages.filter(message => message.role === 'user' && ['user', 'agent-message'].includes(message.source?.kind))
      let text = users
        .flatMap(message => message.content)
        .filter(block => block.type === 'text').map(block => block.text).join(' | ')
      const lastUser = users.at(-1)
      const latestText = lastUser?.content[0]?.text
      const results = messages.slice(messages.lastIndexOf(lastUser) + 1).filter(message => message.role === 'tool')
      let name
      let args
      let sequence
      const teamAssignment = latestText?.match(/^DSH 共享任务 (task-\d+)「/)
      if (teamAssignment) {
        sequence = ['team_task_get', 'glob', 'team_task_update']
        name = sequence[results.length]
        const taskId = teamAssignment[1]
        if (name === 'team_task_get') args = { task_id: taskId }
        if (name === 'glob') args = { pattern: 'README.md' }
        if (name === 'team_task_update') {
          const task = JSON.parse(results[0].content[0].text)
          args = { task_id: taskId, expected_revision: task.revision, action: 'complete' }
        }
      } else if (lastUser?.content.some(block => block.type === 'text' && block.text.startsWith('核对队友交付材料'))) {
        const equipped = lastUser.content.some(block => block.type === 'text' && block.text.includes('使用出装标记'))
        sequence = equipped ? ['glob', 'fixture_standing_note'] : ['glob']
        name = sequence[results.length]
        args = name === 'glob' ? { pattern: 'README.md' } : {}
      } else if (latestText?.startsWith('【灯塔同题对照】\n') || latestText?.startsWith('[Lighthouse comparison]\n')) {
        const english = latestText.startsWith('[Lighthouse comparison]')
        const canPresent = tools?.some(tool => tool.name === 'present')
        sequence = ['glob', canPresent ? 'present' : 'ask_user_question']
        name = sequence[results.length]
        if (name === 'glob') args = { pattern: '[0-9][0-9]-*.md' }
        if (name === 'present') args = { files: [{ path: '02-lighthouse.md', description: 'Lighthouse supply card' }] }
        if (name === 'ask_user_question') {
          const question = english ? 'Keep the report as a path or keep looking for a deliverable?' : '保留文件路径，还是继续找可交付的材料？'
          const options = english ? ['Keep the path', 'Keep looking for a deliverable'] : ['先保留路径', '继续找可交付的材料']
          args = { questions: [{ id: 'fixture-lighthouse-route', question, options: options.map(label => ({ label })) }] }
        }
      } else if (latestText?.includes('[0-9][0-9]-*.md')) {
        sequence = latestText.includes('02-lighthouse.md') ? ['glob', 'present'] : ['glob']
        name = sequence[results.length]
        args = name === 'glob' ? { pattern: '[0-9][0-9]-*.md' }
          : { files: [{ path: '02-lighthouse.md', description: 'Lighthouse supply card' }] }
      } else if (latestText === 'Hand off the workspace file handoff.md in this conversation.' ||
        ((latestText?.startsWith('【工作区同题对照】') || latestText?.startsWith('[Workspace comparison]')) &&
          latestText.includes('materials/workspace-fixture.md')) ||
        ((latestText?.startsWith('【出装任务】') || latestText?.startsWith('[Loadout task]')) &&
          latestText.includes('materials/reuse-fixture.md'))) {
        const file = latestText.includes('materials/reuse-fixture.md') ? 'materials/reuse-fixture.md'
          : latestText.startsWith('Hand off') ? 'handoff.md' : 'materials/workspace-fixture.md'
        const systemText = system ?? messages.filter(message => message.role === 'system').flatMap(message => message.content)
          .map(block => block.text).join('\n')
        const review = systemText.includes('whether to proceed with the handoff or revise the draft')
        const confirmed = review && results.length > 0 &&
          JSON.parse(results[0].content[0].text).answers?.[0]?.selected?.includes('Confirm handoff')
        const canPresent = tools?.some(tool => tool.name === 'present')
        sequence = review ? ['ask_user_question', ...(confirmed && canPresent ? ['present'] : [])]
          : [canPresent ? 'present' : 'glob']
        name = sequence[results.length]
        args = name === 'ask_user_question' ? { questions: [{
          id: 'fixture-delivery-review',
          question: 'The ' + file + ' draft contains the handoff summary. Deliver it or request changes?',
          options: [{ label: 'Confirm handoff' }, { label: 'Revise draft' }],
        }] } : name === 'glob' ? { pattern: file } : { files: [{ path: file, description: 'Handoff summary' }] }
      } else if (latestText === '读取预设工作目录') {
        const systemText = system ?? messages.filter(message => message.role === 'system').flatMap(message => message.content)
          .map(block => block.text).join('\n')
        text = systemText.match(/LEGACY PRESET CWD ([^\r\n]+)/u)?.[1] ?? '工作目录变量未解析'
      } else if (latestText === '核对队伍任务列表') {
        name = 'team_task_list'
        args = {}
      } else if (latestText === '读取旧预设档案') {
        name = 'legacy_lookup'
        args = {}
      } else if (latestText === '读取恢复后的档案') {
        name = 'legacy_recovered'
        args = {}
      } else if (latestText === '核对实战搭配档案') {
        name = 'fixture_standing_note'
        args = {}
      } else if (latestText === '核对独立模块的标记') {
        sequence = ['standalone_skymark', 'git_skymark']
        name = sequence[results.length]
        args = {}
      } else if (latestText?.startsWith('【证据核验】核对关键证据')) {
        const systemText = system ?? messages.filter(message => message.role === 'system').flatMap(message => message.content)
          .map(block => block.text).join('\n')
        if (systemText.includes('If a material claim lacks evidence')) {
          name = 'ask_user_question'
          args = { questions: [{
            id: 'evidence',
            header: '关键证据缺口',
            question: '候选人描述的团队规模还缺少来源。下一步怎么处理？',
            options: ['继续补证', '降级推荐', '暂缓提交'].map(label => ({ label })),
          }] }
        }
      } else if (latestText?.startsWith('【交付前复核】') && latestText.includes('连携目标')
        && latestText.includes('当前会话的工具 "quartz_note"')) {
        name = 'quartz_note'
        args = latestText.includes('测试工具出错') ? { fail: true } : {}
      } else if (latestText?.startsWith('【serpentine_index】用工具完成任务') && latestText.includes('连携目标')
        && latestText.includes('当前会话的工具 "quartz_note"')) {
        sequence = latestText.includes('测试逆序') ? ['serpentine_index', 'quartz_note'] : ['quartz_note', 'serpentine_index']
        name = sequence[results.length]
        args = {}
      } else if (latestText?.startsWith('请使用当前会话的工具 "quartz_note"') ||
        latestText?.startsWith('【quartz_note】用工具完成任务') ||
        (/^【(?:装备试炼|连携挑战|分回合连携 · 取证)】/.test(latestText ?? '') && latestText.includes('当前会话的工具 "quartz_note"'))) {
        name = 'quartz_note'
        args = latestText.includes('测试工具出错') ? { fail: true } : {}
      } else if (latestText?.startsWith('请使用当前会话的工具 "local_session_key"')) {
        name = 'local_session_key'
        args = {}
      } else if (latestText?.includes('当前会话的工具') &&
        ['fixture_orchard_selection', 'fixture_orchard_receipt', 'fixture_grouped_orchard'].some(tool => latestText.includes(JSON.stringify(tool)))) {
        // A tool registered during pre-step becomes available to the next step.
        sequence = ['glob', ...['fixture_orchard_receipt', 'fixture_orchard_selection', 'fixture_grouped_orchard']
          .filter(tool => latestText.includes(JSON.stringify(tool)))]
        name = sequence[results.length]
        args = name === 'glob' ? { pattern: 'README.md' } : {}
      } else if (latestText?.includes('调用市场路标')) {
        name = 'market_profile_wayfinder'
        args = latestText.includes('测试工具出错') ? { fail: true } : {}
      } else if (latestText?.startsWith('【mcp__foundry__read_marker】')) {
        name = 'mcp__foundry__read_marker'
        args = { fail: latestText.includes('测试工具出错') }
      } else if (latestText?.startsWith('请使用当前会话的工具 "serpentine_index"') ||
        (latestText?.startsWith('【serpentine_index】核对索引出处') && latestText.includes('实际核对'))) {
        name = 'serpentine_index'
        args = {}
      } else if (latestText === 'fixture shared source') {
        name = 'fixture_shared_marker'
        args = {}
      } else if (latestText === 'fixture session ptc' ||
        latestText?.startsWith('请使用当前会话的工具 "run_code" 完成以下任务。') ||
        latestText?.startsWith('【run_code】抽查批量结果') ||
        (latestText?.startsWith('【run_code】用工具完成任务') && latestText.includes('扫描本地清单'))) {
        name = 'run_code'
        args = { code: 'return await tools.glob({pattern:"*.txt"})', description: 'Find workspace text files' }
      } else if (latestText === 'fixture ptc report' || latestText?.startsWith('【run_code】用工具完成任务')) {
        name = 'run_code'
        args = { code: 'return await tools.quartz_note({})', description: 'Read the fixture note' }
      } else if (latestText === 'fixture ptc partial') {
        name = 'run_code'
        args = { code: `const first = await tools.glob({pattern:"*.txt"});
          await tools.glob({pattern:"*.md"});
          try { await tools.quartz_note({}); } catch { return first; }
          return first;`, description: 'Read available fixture files' }
      }
      if (name || sequence) {
        const result = (!sequence || !name) && results.at(-1)
        if (result) {
          text = '对局结果 ' + result.content.map(block => block.text).join(' ')
        } else if (tools?.some(tool => tool.name === name)) {
          const id = randomUUID()
          const block = { type: 'tool-call', id, name, arguments: JSON.stringify(args) }
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: block.arguments }
          yield { type: 'block-end', index: 0, block }
          yield { type: 'finish', reason: { kind: 'tool-calls' } }
          return
        }
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.effect(() => ctx.llm.registerAdapter(['loadout-fixture'], new FixtureModel()))
  ctx.provide('fixtureTurnGate', {
    async wait(sessionId, signal) {
      let release
      try {
        await new Promise(resolve => {
          release = resolve
          turns.set(sessionId, release)
          signal.addEventListener('abort', release, { once: true })
          if (signal.aborted) release()
        })
      } finally {
        turns.delete(sessionId)
        signal.removeEventListener('abort', release)
      }
    },
  })
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.tools.register({
      name: 'orchard_recipe',
      description: 'Return a synthetic recipe after Host session setup.',
      parameters: {},
      output: { schema: { type: 'string' }, render: value => [{ type: 'text', text: value }] },
      async execute() { return 'ready' },
    })
  })
  const pkg = ctx.pluginPackages.packageOf('@deepseek-ai/dsh-mcp-client', ctx.baseUrl)
  const mcpModule = pathToFileURL(createRequire(pkg.manifestPath).resolve(pkg.name)).href
  const declaring = ctx.extend({ baseUrl: new URL('.', import.meta.url).href })
  const alternate = ctx.extend({ baseUrl: new URL('./alternate/', import.meta.url).href })
  const contextResource = {
    id: 'fixture-context-resource', name: 'cordis:group', group: true, isolate: { fixtureCompass: true },
    config: [
      { name: new URL('./compass.mjs', import.meta.url).href },
      { name: new URL('./session-addon.mjs', import.meta.url).href,
        config: { resource: './context-marker.txt', toolNameFromNote: true } },
    ],
  }
  const presets = [
    {
      id: 'fixture-foreign',
      name: '外部预设',
      plugins: [{
        id: 'fixture-isolated-group',
        name: 'cordis:group',
        group: true,
        isolate: { fixtureCompass: true },
        config: [
          { id: 'compass', name: './compass.mjs' },
          { name: './peculiar-source.mjs' },
          { name: './session-addon.mjs', config: { resource: { __jsExpr: '"./session-note.txt"' }, toolName: 'standing_annotation' } },
        ],
      }, { id: 'local-module', name: 'local-contributor' }, mcp(mcpModule, 'observatory'), structuredClone(contextResource)],
    },
    { id: 'fixture-mcp', name: '第二个 MCP 预设', plugins: [mcp(mcpModule, 'archive'), structuredClone(contextResource)] },
    {
      id: 'fixture-peers', name: '行会记录员',
      plugins: peerRows('fixture-peer-network', 'peer_ledger_marker'),
    },
    {
      id: 'fixture-collection-source', name: '收藏来源',
      plugins: peerRows('fixture-collected-parent-network', 'unused').slice(0, -1),
    },
    {
      id: 'fixture-native-kit', name: '档案向导',
      plugins: [{ id: 'fixture-native-equipment', name: 'cordis:group', group: true, config: [
        ...peerRows('fixture-native-kit', 'fixture_standing_note'),
        { id: 'original-auxiliary', name: './peer-tool.mjs', config: { toolName: 'fixture_standing_aux' },
          isolate: { fixturePeerLedger: 'fixture-native-kit' } },
      ] }, { id: 'native-kit-dependent', name: './peer-tool.mjs', config: { toolName: 'fixture_standing_dependent' },
        isolate: { fixturePeerLedger: 'fixture-native-kit' } },
      { id: 'local-module', name: 'local-contributor' }],
    },
    { id: 'fixture-spare-kit', name: '后备鉴定师', plugins: [{ id: 'spare-note', name: './standing-variant.mjs' }] },
  ]
  for (const preset of presets) {
    if (['fixture-peers', 'fixture-collection-source'].includes(preset.id) && process.env.DSH_LOADOUT_TEST_HIDE_PEERS === '1') continue
    const context = preset.id === 'fixture-mcp' ? alternate : declaring
    const dispose = await context.agentPresets.register(preset)
    ctx.effect(() => dispose)
  }
  const loader = ctx.pluginPackages.packageOf('@deepseek-ai/cordis-plugin-loader', ctx.baseUrl)
  const { Entry, EntryTree } = await import(pathToFileURL(createRequire(loader.manifestPath).resolve(loader.name)).href)
  const registry = ctx.pluginPackages.packageOf('@deepseek-ai/dsh-agent-preset-registry', ctx.baseUrl)
  const { auditRows } = await import(pathToFileURL(createRequire(registry.manifestPath).resolve(registry.name)).href)
  class FixtureTree extends EntryTree {
    write() {}
  }
  function sessionExecutor() {
    const executor = typeof ctx.tools.selectExecutor === 'function'
    const name = executor ? '@deepseek-ai/dsh-tool-executor-ptc' : '@deepseek-ai/dsh-agent-tool-presentation'
    const pkg = ctx.pluginPackages.packageOf(name, ctx.baseUrl)
    return { id: 'session-ptc', name: pathToFileURL(createRequire(pkg.manifestPath).resolve(pkg.name)).href,
      config: executor ? {} : { mode: 'ptc' } }
  }
  async function mountFixture(agent, kind) {
    const child = agent.ctx.extend({ [Entry.key]: undefined }).plugin({
      name: 'fixture-session-tree',
      async apply(scope) {
        const tree = new FixtureTree(scope.extend({ baseUrl: new URL('.', import.meta.url).href }))
        scope.effect(() => () => tree.root.stop())
        const rows = kind === 'parent-peer' ? peerRows('fixture-peer-network', 'parent_peer_marker').slice(-1)
          : kind === 'collectible-parent' ? peerRows('fixture-collected-parent-network', 'collected_parent_marker').slice(-1)
          : typeof kind === 'string' && kind.startsWith('provider-') ? providerRows(kind.slice('provider-'.length))
          : kind === 'spare-note-session' ? [{ id: 'spare-note-session', name: './standing-variant.mjs' }]
          : kind === 'shadow-provider' ? [{ id: 'fixture-shadow-provider', name: 'cordis:group', group: true,
            isolate: { fixtureCompass: true }, config: [
              { id: 'compass', name: './compass.mjs' }, { id: 'note', name: './peculiar-source.mjs' },
            ] }]
          : kind === 'vault' ? vaultRows()
          : kind === 'discovery-mcp' ? [mcp(mcpModule, 'foundry')]
          : kind === 'session-ptc' ? [sessionExecutor()]
          : kind === 'collectible' ? peerRows('fixture-collected-network', 'collected_peer_marker') : [{
          id: 'fixture-session-addon', name: 'cordis:group', group: true, isolate: { fixtureCompass: true },
          config: [
            { name: './compass.mjs' },
            { name: './session-addon.mjs', config: { resource: './session-note.txt' } },
          ],
        }, { id: 'fixture-session-passive', name: './compass.mjs', isolate: { fixtureCompass: true } },
        ...peerRows('fixture-session-peer-network', 'session_peer_marker')]
        await tree.root.update(rows)
        const { failed, pending } = await auditRows(tree)
        if (failed.length || pending.length) throw new Error([...failed, ...pending].join('\n'))
      },
    })
    await child.await()
  }
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-session',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { presetId, sessionOnly, runtimePlugin, workspacePath, initialPresetId, inspectWorkspaceId } = await request.json()
      if (inspectWorkspaceId !== undefined) {
        const existing = ctx.workspaceRegistry.get(inspectWorkspaceId)
        if (!existing) return Response.json({ error: 'No fixture workspace' }, { status: 404 })
        return Response.json({ sessionIds: existing.sessionIds })
      }
      const workspace = workspacePath && await ctx.workspaceRegistry.create(workspacePath, 'Fixture workspace')
      const session = await ctx.sessionController.create({
        agentPreset: initialPresetId ?? presetId, workspaceId: workspace?.id,
      })
      if (initialPresetId) await ctx.agentPresets.select(ctx.agents.get(session.sessionId), presetId)
      if (runtimePlugin) {
        try {
          await mountFixture(ctx.agents.get(session.sessionId), runtimePlugin)
        } catch (error) {
          return Response.json({ error: String(error), stack: error.stack }, { status: 422 })
        }
      }
      if (sessionOnly) {
        localKeys.set(session.sessionId, registerSessionKey(ctx.agents.get(session.sessionId)))
      }
      return Response.json({ ...session, workspaceId: workspace?.id })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-private-tool',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, enabled } = await request.json()
      const agent = ctx.agents.get(sessionId)
      if (!agent || typeof enabled !== 'boolean') return new Response(null, { status: 400 })
      await localKeys.get(sessionId)?.()
      localKeys.delete(sessionId)
      if (enabled) localKeys.set(sessionId, registerSessionKey(agent))
      return Response.json({ enabled })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-profile',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { branch, disabled, revision } = await request.json()
      if (!['north', 'south'].includes(branch) || typeof disabled !== 'boolean') return new Response(null, { status: 400 })
      const entry = [...ctx.loader.entries()].find(entry => entry.options.id === 'fixture-orchard-' + branch)
      if (!entry) return new Response(null, { status: 404 })
      const config = revision === null ? { branch } : { branch, revision }
      await entry.update(revision === undefined ? { disabled } : { disabled, config })
      return Response.json({ disabled: entry.disabled })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-shadow',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, mode, tool = 'quartz_note', child = false } = await request.json()
      const agent = ctx.agents.get(sessionId)
      if (mode === 'open' || mode === 'different-schema') shadowed.set(sessionId, shadowTool(agent, mode === 'different-schema'))
      if (mode === 'late') lateShadows.add(sessionId)
      if (mode === 'reject-result') rejectedResults.add(sessionId)
      if (mode === 'hold-result') heldResults.set(sessionId, { tool, child })
      if (mode === 'executor') await mountFixture(agent, 'session-ptc')
      if (mode === 'close') {
        await shadowed.get(sessionId)?.()
        shadowed.delete(sessionId)
      }
      return Response.json({ calls: shadowCalls.get(sessionId) ?? 0 })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-session-key',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, tool } = await request.json()
      const agent = ctx.agents.get(sessionId)
      const name = ['peer_ledger_marker', 'session_peer_marker', 'parent_peer_marker', 'fixture_fading_signal',
        'collected_peer_marker', 'collected_parent_marker', 'fixture_shared_marker', 'quartz_note', 'fixture_standing_note',
        'fixture_vault_ledger', 'fixture_orchard_selection']
        .includes(tool) ? tool : 'local_session_key'
      const callId = randomUUID()
      const signal = request.signal
      try {
        const result = typeof ctx.tools.setExecutor === 'function'
          ? (await ctx.tools.execute({ calls: [{ id: callId, name, arguments: '{}' }], agent, signal })).results[0].result
          : await ctx.tools.execute({ name, arguments: {}, agent, callId, signal })
        return Response.json({ value: result.value, error: result.error?.message, code: result.error?.info?.code })
      } catch (error) {
        return Response.json({ error: String(error), cause: error.cause && String(error.cause) }, { status: 422 })
      }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-turn',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, finish, text, selectOnly, requestId, signalTool, checkpoint, profileBranch, workingDirectory, gateStatus } = await request.json()
      if (gateStatus) return Response.json({ held: turns.has(sessionId) })
      if (workingDirectory) {
        const agent = ctx.agents.get(sessionId)
        await agent.ctx.get('workingDirectory').set(agent, workingDirectory, request.signal)
        return Response.json({ ok: true })
      }
      if (checkpoint) {
        await ctx.get('sessions').flush(ctx.agents.get(sessionId).session)
        return Response.json({ ok: true })
      }
      if (text || selectOnly) {
        try {
          await ctx.sessionController.selectModel({ sessionId, provider: 'loadout-fixture', model: 'fixture' })
          if (selectOnly) return Response.json({ ok: true })
          await ctx.sessionController.prompt({
            sessionId, requestId: requestId ?? randomUUID(), mode: 'queue', content: [{ type: 'text', text }],
          }, request.signal)
          await ctx.agents.get(sessionId).whenIdle()
          return Response.json({ ok: true })
        } catch (error) {
          return Response.json({ error: String(error) }, { status: 422 })
        }
      }
      const agent = ctx.agents.get(sessionId)
      if (!agent) return Response.json({ error: 'No fixture agent' }, { status: 404 })
      if (finish) {
        turns.get(sessionId)?.()
        await agent.whenIdle()
      } else {
        agent.followup({
          id: randomUUID(),
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'text', text: profileBranch ? 'fixture orchard ' + profileBranch : signalTool ? 'fixture signal' : 'fixture turn' }],
        })
      }
      return Response.json({ ok: true })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-handoff-question',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, choice } = await request.json()
      const pending = handoffQuestions.get(sessionId)
      if (choice === undefined) return Response.json({ question: pending?.question })
      if (!pending?.question.options.some(option => option.label === choice)) {
        return Response.json({ error: 'No matching pending question option' }, { status: 400 })
      }
      pending.resolve({ answers: [{ id: pending.question.id, selected: [choice] }] })
      return Response.json({ ok: true })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-plan-review',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, callId } = await request.json()
      const agent = ctx.agents.get(sessionId)
      const answers = await ctx.get('userQuestions').ask({ agent, questions: [{
        id: 'plan-review', question: 'Approve this plan?', detail: '# Plan', options: [{ label: 'Approve' }, { label: 'Keep planning' }],
        intent: { kind: 'plan-review', callId, approve: 'Approve' },
      }] })
      return Response.json(answers)
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-command',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, line } = await request.json()
      const result = await ctx.get('commands').execute(ctx.agents.get(sessionId), line, [], request.signal)
      return Response.json(result ?? null)
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-delegation',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, childId } = await request.json()
      const parent = ctx.agents.get(sessionId)
      const runtime = ctx.get('subagents')
      const prompt = [{ type: 'text', text: '核对队友交付材料' }]
      try {
        await runtime.sendMessage(parent, childId, prompt, { signal: request.signal })
        return Response.json({ childId })
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 422 })
      }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-team',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, enabled } = await request.json()
      const agent = ctx.agents.get(sessionId)
      const team = ctx.get('agentTeams')
      await team.setEnabled(agent, enabled)
      return Response.json({ enabled: team.isEnabled(agent) })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-team-launch-gate',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, release } = await request.json()
      const gate = teamLaunchGates.get(sessionId)
      if (release) gate?.release()
      return Response.json({ childId: gate?.childId })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-team-task',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const { sessionId, create, update } = await request.json()
      const agent = ctx.agents.get(sessionId)
      const team = ctx.get('agentTeams')
      return Response.json(create ? await team.createTask(agent, create) : await team.updateTask(agent, update))
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-history',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const sessionId = new URL(request.url).searchParams.get('sessionId')
      const source = await ctx.sessionQuery.observeSession(sessionId)
      try {
        const workspace = ctx.workspaceRegistry.list().find(item => item.sessionIds.includes(sessionId))
        return Response.json({
          events: source.events, inherited: source.inheritedEventCount,
          presetId: source.projections?.values.agentPreset, workspaceId: workspace?.id, workspacePath: workspace?.path,
        })
      } finally {
        source[Symbol.dispose]()
      }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/loadout-fixture-tools',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const id = new URL(request.url).searchParams.get('id')
      const scope = await ctx.agentPresets.acquireScope(id)
      try {
        return Response.json(ctx.tools.schemas(scope.key).map(({ name }) => name))
      } finally {
        await scope[Symbol.asyncDispose]()
      }
    },
  })
}
