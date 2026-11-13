import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
export const name = 'dsh-loadout-market-fixture'
export const version = '1.2.0'
export const moduleName = 'dsh-loadout-unindexed-module'
export const moduleVersion = '1.3.0'
export const gitModuleName = 'dsh-loadout-git-module'

async function commitFixture(cwd, message) {
  await exec('git', ['add', 'package.json', 'index.mjs'], { cwd })
  await exec('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', message], { cwd })
}

export async function createGitModule(directory, moduleDir) {
  const cwd = join(directory, 'equipment.git')
  await mkdir(cwd)
  const manifest = JSON.parse(await readFile(join(moduleDir, 'package.json'), 'utf8'))
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ ...manifest, name: gitModuleName }))
  const entry = await readFile(join(moduleDir, 'index.mjs'), 'utf8')
  await writeFile(join(cwd, 'index.mjs'), entry.replace('standalone_skymark', 'git_skymark'))
  await exec('git', ['init', '-q', '-b', 'main'], { cwd })
  await commitFixture(cwd, 'Add equipment')
  await exec('git', ['checkout', '-qb', 'duplicate'], { cwd })
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ ...manifest, name: moduleName, version: '2.0.0' }))
  await commitFixture(cwd, 'Reuse the archive package name')
  await exec('git', ['checkout', '-q', 'main'], { cwd })
}

async function serveGit(directory, request, response, url) {
  const input = []
  for await (const bytes of request) input.push(bytes)
  const body = Buffer.concat(input)
  const output = await new Promise((resolve, reject) => {
    const child = execFile('git', ['http-backend'], {
      encoding: 'buffer',
      env: { ...process.env, GIT_PROJECT_ROOT: directory, GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method,
        CONTENT_TYPE: request.headers['content-type'] ?? '', CONTENT_LENGTH: String(body.length),
        HTTP_GIT_PROTOCOL: request.headers['git-protocol'] ?? '' },
    }, (error, stdout) => error ? reject(error) : resolve(stdout))
    child.stdin.end(body)
  })
  const end = output.indexOf('\r\n\r\n')
  if (end < 0) throw new Error('Missing Git CGI headers')
  for (const header of output.subarray(0, end).toString('utf8').split('\r\n')) {
    const separator = header.indexOf(':')
    const field = header.slice(0, separator)
    const value = header.slice(separator + 1).trim()
    if (field.toLowerCase() === 'status') response.statusCode = Number(value.split(' ')[0])
    else response.setHeader(field, value)
  }
  response.end(output.subarray(end + 4))
}

export async function startMarket(directory) {
  const pkg = join(directory, 'market-package')
  await mkdir(pkg, { recursive: true })
  const manifest = {
    name, version, type: 'module', description: 'A synthetic DSH marketplace bundle',
    exports: { '.': './index.mjs', './client': './client.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' }, loadout: {
      equipmentArt: './compass.webp',
      toolArt: { market_profile_wayfinder: './landmark.webp' },
      roles: { heroes: { 'fixture-wayfinder': ['scout', 'invalid-role'] }, equipment: ['guard'],
        tools: { market_wayfinder: ['scout'], market_profile_wayfinder: ['scout', 'support', 'support'] }, bundle: ['orchestration'] },
      actions: { bundle: [
        { id: 'review-route', name: '核对路径', detail: '列出沿途需要确认的依据。', instruction: '整理路径依据和待查事项。' },
      ] },
      panelActivities: [
        { id: 'save-route', name: '保存路径', detail: '在罗盘面板保存路径。', path: '/api/fixture-market-panel',
          request: { action: 'save' }, response: { saved: true } },
        { id: 'foreign-route', name: '其他插件的操作', path: '/api/loadout-fixture-turn',
          request: { selectOnly: true }, response: { ok: true } },
      ],
      planReview: { id: 'review-route-plan', name: '评审路径计划', component: 'MarketPlanReview' },
    } },
  }
  await writeFile(join(pkg, 'package.json'), JSON.stringify(manifest))
  await copyFile(new URL('../../art/gear-collection.webp', import.meta.url), join(pkg, 'compass.webp'))
  await copyFile(new URL('../../art/equipment.webp', import.meta.url), join(pkg, 'landmark.webp'))
  await writeFile(join(pkg, 'client.js'), `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: () => ({ apply() {} }) })`)
  await writeFile(join(pkg, 'index.mjs'), `
    export const inject = ['tools', 'commands', 'connection']
    export function apply(ctx, config) {
      const shared = config?.profile || config?.shadow
      ctx.tools.register({
        name: shared ? 'market_profile_wayfinder' : 'market_wayfinder',
        description: shared ? 'Return a synthetic landmark.' : 'Verify a synthetic landmark.',
        parameters: shared ? { fail: { type: 'boolean' } } : {},
        output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
        async execute({ fail }) {
          if (fail) throw new Error('Landmark unavailable')
          return config?.shadow ? 'local' : 'north'
        },
      })
      ctx.commands.register({
        name: 'fixture-landmark',
        description: 'Read the current landmark.',
        input: { hint: '[fail]' },
        handler({ rawInput }) {
          return rawInput.trim() === 'fail'
            ? { kind: 'error', text: 'Landmark unavailable' }
            : { kind: 'success', text: config?.profile ? 'profile landmark' : 'preset landmark' }
        },
      })
      if (config?.profile) ctx.connection.fetch.register({
        path: '/api/fixture-market-panel', methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
          const { result } = await request.json()
          return Response.json({ saved: result !== 'refused' }, { status: result === 'error' ? 409 : 200 })
        },
      })
    }
  `)
  await writeFile(join(pkg, 'cordis.patch.yml'), JSON.stringify([{ insert: [{
    id: 'fixture-market-preset',
    name: '@deepseek-ai/dsh-agent-preset',
    config: { id: 'fixture-wayfinder', name: '市场寻路者', plugins: [{ id: 'market-wayfinder', name }] },
  }, {
    id: 'fixture-market-local-preset', name: '@deepseek-ai/dsh-agent-preset',
    config: { id: 'fixture-local-wayfinder', name: '本地寻路者', plugins: [{ id: 'local-wayfinder', name, config: { shadow: true } }] },
  }, { id: 'fixture-market-profile-tool', name, config: { profile: true } }] }]))
  await exec('npm', ['pack', '--pack-destination', directory, '--silent'], { cwd: pkg })
  const tarball = await readFile(join(directory, name + '-' + version + '.tgz'))
  const moduleDir = join(directory, 'standalone-module')
  const moduleManifest = {
    name: moduleName, version: moduleVersion, type: 'module', exports: './index.mjs',
    description: 'A standalone DSH tool that needs an explicit marker configuration.',
    dsh: { loadout: { roles: { equipment: ['scout'] } } },
  }
  await mkdir(moduleDir, { recursive: true })
  await writeFile(join(moduleDir, 'package.json'), JSON.stringify(moduleManifest))
  await copyFile(new URL('./standalone-tool.mjs', import.meta.url), join(moduleDir, 'index.mjs'))
  await exec('npm', ['pack', '--pack-destination', directory, '--silent'], { cwd: moduleDir })
  const moduleTarball = await readFile(join(directory, moduleName + '-' + moduleVersion + '.tgz'))
  const requests = []
  let origin
  function plugin(name, title, versions) {
    return { name, title, author: 'Loadout Test', description: 'Synthetic market equipment.', versions }
  }
  function release(version, engines = {}) {
    return { version, publishTimestamp: 1720000000, source: { type: 'npm', registry: origin + '/registry/' }, engines }
  }
  function distribution(filename, archive) {
    return { tarball: origin + '/registry/' + filename, integrity: 'sha512-' + createHash('sha512').update(archive).digest('base64') }
  }
  const server = createServer((request, response) => {
    const url = new URL(request.url, origin)
    const path = url.pathname
    requests.push(path)
    if (path.startsWith('/equipment.git/')) {
      void serveGit(directory, request, response, url).catch(error => response.writeHead(500).end(error.message))
      return
    }
    const json = value => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(value))
    }
    if (path === '/index.json' || path === '/secondary.json') {
      const plugins = [plugin(name, { 'zh-cn': '寻路罗盘', en: 'Wayfinder Compass' }, [
        release('9.0.0', { dsh: '>=99.0.0' }), release(version),
      ])]
      for (let i = 1; i <= 9; i++) plugins.push(plugin('dsh-loadout-fixture-extra-' + i, 'Auxiliary ' + i, [release('1.0.0')]))
      return json({ format: 1, title: '测试装备工坊', plugins })
    }
    if (path === '/registry/' + name || path === '/registry/' + name + '/' + version) {
      const exact = {
        ...manifest,
        dist: distribution(name + '.tgz', tarball),
      }
      if (path.endsWith('/' + version)) return json(exact)
      return json({ name, 'dist-tags': { latest: version }, versions: { [version]: exact } })
    }
    if (path === '/registry/' + moduleName || path.startsWith('/registry/' + moduleName + '/')
      || path === '/bad-registry/' + moduleName || path.startsWith('/bad-registry/' + moduleName + '/')) {
      const exact = { ...moduleManifest, dist: distribution(moduleName + '.tgz', moduleTarball) }
      if (path.startsWith('/bad-registry/')) exact.dist = distribution('bad-integrity.tgz', Buffer.from('different archive'))
      const incompatible = { ...exact, version: '9.0.0', engines: { dsh: '>=99.0.0' } }
      const mismatched = { ...exact, version: '8.0.0' }
      if (path.endsWith('/' + moduleVersion)) return json(exact)
      if (path.endsWith('/9.0.0')) return json(incompatible)
      if (path.endsWith('/8.0.0')) return json(mismatched)
      return json({ name: moduleName, 'dist-tags': { latest: moduleVersion },
        versions: { [moduleVersion]: exact, '9.0.0': incompatible, '8.0.0': mismatched } })
    }
    if (path === '/registry/' + name + '.tgz' || path === '/registry/' + moduleName + '.tgz'
      || path === '/registry/bad-integrity.tgz') {
      response.setHeader('Content-Type', 'application/octet-stream')
      return response.end(path === '/registry/' + name + '.tgz' ? tarball : moduleTarball)
    }
    response.writeHead(404).end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  origin = 'http://127.0.0.1:' + server.address().port
  return {
    origin, index: origin + '/index.json', secondary: origin + '/secondary.json', requests, packageDir: pkg, moduleDir,
    tarball: origin + '/registry/' + name + '.tgz', moduleTarball: origin + '/registry/' + moduleName + '.tgz',
    gitModule: 'git+' + origin + '/equipment.git#main', duplicateModule: 'git+' + origin + '/equipment.git#duplicate',
    stop: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}
