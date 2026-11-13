import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { entryYaml, runtimeModule } from './loader-support.js'

const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const exec = promisify(execFile)

function invocation(profile) {
  return profile.packageManager ?? { command: 'pnpm' }
}

function parseRegistryManifest(output) {
  const parsed = JSON.parse(output.trim())
  return Array.isArray(parsed) ? parsed.at(-1) : parsed
}

async function registryManifest(ctx, spec, registry, signal) {
  const profile = ctx.profileContext
  const [{ registryArguments }, { scrubbedParentEnv }] = await Promise.all([
    runtimeModule(ctx, '@deepseek-ai/dsh-plugin-manager/operations'),
    runtimeModule(ctx, '@deepseek-ai/dsh-subprocess'),
  ])
  const options = invocation(profile)
  const { stdout } = await exec(options.command, [
    ...(options.args ?? []), 'view', spec, 'name', 'version', 'description', 'dsh', 'dist', 'engines', 'peerDependencies',
    '--json', ...registryArguments(registry ?? null), '--config.fetch-retries=0',
  ], {
    cwd: profile.dir, env: { ...scrubbedParentEnv(), ...options.env }, signal, timeout: 20_000,
  })
  return parseRegistryManifest(stdout)
}

function registryArchive(manifest) {
  if (typeof manifest.dist?.tarball !== 'string') throw new Error('软件源未提供此版本的安装包地址。')
  const url = new URL(manifest.dist.tarball)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('软件源返回了无法用于安装的下载地址。')
  }
  const { integrity, shasum } = manifest.dist
  const checksum = typeof integrity === 'string' ? integrity
    : /^[a-f0-9]{40}$/iu.test(shasum ?? '') ? 'sha1-' + Buffer.from(shasum, 'hex').toString('base64') : undefined
  return { url: url.href, integrity: checksum }
}

export async function reviewStandalone(ctx, requested, requestedRegistry, refusal, signal) {
  const profile = ctx.profileContext
  const { parseInstallSpec } = await runtimeModule(ctx, '@deepseek-ai/dsh-plugin-manager')
  const source = parseInstallSpec(requested)
  let manifest
  let archive
  const registry = refusal.registries?.length ? refusal.registries.at(-1) : requestedRegistry
  if (source.kind === 'registry') {
    manifest = await registryManifest(ctx, requested, registry, signal)
    if (manifest?.name !== source.name) throw new Error('软件源返回了不同的模块。')
    if (registry) {
      const { readProfileRegistry } = await runtimeModule(ctx, '@deepseek-ai/dsh-plugin-manager/operations')
      const profileRegistry = await readProfileRegistry(profile.dir, { ...invocation(profile), timeoutMs: 20_000 })
      if (profileRegistry !== registry) archive = registryArchive(manifest)
    }
  } else if (source.kind === 'path') {
    manifest = JSON.parse(await readFile(join(source.path, 'package.json'), 'utf8'))
  } else {
    throw new Error(refusal.reason)
  }
  if (typeof manifest?.name !== 'string' || typeof manifest.version !== 'string' || !exactVersion.test(manifest.version)) {
    throw new Error('模块需要在 package.json 中声明包名和确切版本。')
  }
  const named = parseInstallSpec(manifest.name)
  if (named.kind !== 'registry' || named.name !== manifest.name || manifest.dsh?.bundle) {
    throw new Error('模块安装来源已变化，请重新核对。')
  }
  const { evaluatePluginCompatibility, readProfileVersionExemptions, pluginCompatibilityWarning } =
    await runtimeModule(ctx, '@deepseek-ai/dsh-app-boot')
  const issue = evaluatePluginCompatibility(manifest, readProfileVersionExemptions(profile.dir))
  return {
    standalone: true,
    kind: source.kind,
    name: manifest.name,
    version: manifest.version,
    description: typeof manifest.description === 'string' ? manifest.description : undefined,
    registry,
    ...(archive ? { archive } : {}),
    compatibilityError: issue && !issue.exempted ? pluginCompatibilityWarning(issue) : undefined,
    spec: source.kind === 'registry' ? manifest.name + '@' + manifest.version : requested,
  }
}

async function readOptional(file) {
  try {
    return await readFile(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function addedDependency(before, after) {
  const added = Object.keys(after).filter(name => !Object.hasOwn(before, name))
  if (added.length !== 1 || Object.keys(before).some(name => before[name] !== after[name])) {
    throw new Error('无法确认这次安装只添加了一个新模块。')
  }
  return added[0]
}

async function checkArchiveLock(ctx, lockFile, source, writeFileAtomic) {
  const { parse, dump } = await entryYaml(ctx)
  const lock = parse(await readFile(lockFile, 'utf8'))
  const importer = lock.importers?.['.'] ?? lock
  const dependency = importer.dependencies?.[source.name]
  const locked = lock.packages?.[source.name + '@' + source.archive.url]
    ?? lock.packages?.[dependency?.version]
  const resolution = locked?.resolution
  if (dependency?.specifier !== source.archive.url || resolution?.tarball !== source.archive.url
    || locked.version !== source.version || (locked.name && locked.name !== source.name)
    || (resolution.integrity && source.archive.integrity && resolution.integrity !== source.archive.integrity)) {
    throw new Error('安装包与软件源提供的锁定信息不同。')
  }
  if (!resolution.integrity) {
    if (!source.archive.integrity) throw new Error('软件源未提供此安装包的校验值。')
    // The older lockfile format omits integrity for direct archive URLs.
    resolution.integrity = source.archive.integrity
    await writeFileAtomic(lockFile, dump(lock, { lineWidth: -1 }), { mode: 0o600 })
  }
}

export async function installStandalone(ctx, source, signal) {
  if (source.compatibilityError) throw new Error(source.compatibilityError)
  const profile = ctx.profileContext
  const [{ runProfilePnpm, registryArguments }, { withFileLock, writeFileAtomic }, { readProfileManifest }] = await Promise.all([
    runtimeModule(ctx, '@deepseek-ai/dsh-plugin-manager/operations'),
    runtimeModule(ctx, '@deepseek-ai/dsh-atomic-write'),
    runtimeModule(ctx, '@deepseek-ai/dsh-app-boot'),
  ])
  const manifestFile = join(profile.dir, 'package.json')
  const lockFile = join(profile.dir, 'pnpm-lock.yaml')
  const hmr = ctx.get('hmr')
  async function transaction() {
    const before = readProfileManifest('dsh', profile.dir)
    const dependencies = { ...before.dependencies, ...before.devDependencies, ...before.optionalDependencies }
    let name = source.name
    let version
    let treeChanged = !name
    if (name && Object.hasOwn(dependencies, name)) throw new Error('这个模块已安装到当前 Profile。')
    const files = await Promise.all([manifestFile, lockFile].map(async path => ({ path, previous: await readOptional(path) })))
    async function run(args, { repair = false } = {}) {
      if (!repair) signal?.throwIfAborted()
      const result = await runProfilePnpm({ ...profile, profile: profile.name }, args, {
        ...invocation(profile), execution: 'service', activateNewBundles: false,
        outputBytes: 16_384, idleTimeoutMs: 600_000, signal: repair ? undefined : signal,
      })
      if (!repair) signal?.throwIfAborted()
      if (result.exitCode !== 0 || result.timedOut) throw new Error(result.output.trim() || 'DSH 未能安装这个模块。')
    }
    try {
      if (!name) {
        // DSH has fetched this source and refused it as a bundle. Resolve a
        // single new dependency before changing the installed module tree.
        await run(['add', '-w', '--save-exact', '--lockfile-only', '--ignore-scripts', source.spec,
          ...registryArguments(source.registry ?? null)])
        const after = readProfileManifest('dsh', profile.dir)
        name = addedDependency(dependencies, { ...after.dependencies, ...after.devDependencies, ...after.optionalDependencies })
        await run(['install', '--frozen-lockfile', ...registryArguments(source.registry ?? null)])
      } else if (source.archive) {
        // Keep the profile registry for existing dependencies. Resolve the
        // reviewed archive to a lockfile before running the native install.
        await run(['add', '-w', '--save-exact', '--lockfile-only', source.archive.url])
        await checkArchiveLock(ctx, lockFile, source, writeFileAtomic)
        treeChanged = true
        await run(['install', '--frozen-lockfile'])
      } else {
        treeChanged = true
        await run(['add', '-w', '--save-exact', source.spec, ...registryArguments(source.registry ?? null)])
      }
      const installed = readProfileManifest('dsh', join(profile.dir, 'node_modules', name))
      version = installed.version
      if (installed.name !== name || !exactVersion.test(version ?? '') || (source.version && version !== source.version)
        || installed.dsh?.bundle !== undefined) {
        throw new Error('实际安装的模块与核对结果不同。')
      }
    } catch (error) {
      // Restore the profile and reinstall the previous dependency tree when
      // either installer may have changed it.
      await Promise.all(files.map(async ({ path, previous }) => {
        const current = await readOptional(path)
        if (previous === undefined) {
          if (current !== undefined) await rm(path, { force: true })
        } else if (!current?.equals(previous)) {
          await writeFileAtomic(path, previous, { mode: 0o600 })
        }
      }))
      if (treeChanged) {
        const previousLock = files.find(file => file.path === lockFile)?.previous
        try {
          await run(['install', previousLock ? '--frozen-lockfile' : '--config.lockfile=false', '--ignore-scripts'], { repair: true })
        } catch (repairError) {
          throw new Error(error.message + '\nDSH 未能恢复原有模块目录。' + repairError.message, { cause: error })
        }
      }
      throw error
    }
    let application = 'restart-required'
    try {
      // Publish the dependency without selecting a bundle or mounting code.
      await ctx.pluginPackages.refresh()
      if (ctx.pluginPackages.packageOf(name, ctx.baseUrl)?.version === version) application = 'applied'
    } catch {
      // The dependency is already saved and will resolve at the next start.
    }
    return { application, module: name, version }
  }
  return withFileLock(manifestFile, () => hmr ? hmr.runExclusive(transaction) : transaction())
}
