// Live smoke test (not part of `npm test`): real `code` CLI install list
// against the real Marketplace. Run: npx tsx test/smoke.ts
import { execSync } from 'node:child_process'
import { pickUpdate, relativeAge } from '../src/core/release.js'
import { createMarketplaceClient } from '../src/gallery/marketplace.js'

interface InstalledExtension {
  readonly id: string
  readonly version: string
}

const raw = execSync('code --list-extensions --show-versions', { encoding: 'utf8' })
const installed: readonly InstalledExtension[] = raw
  .trim()
  .split('\n')
  .map((line) => {
    const [id, version] = line.split('@')
    return { id, version }
  })
console.log('installed:', installed.length)

const client = createMarketplaceClient('extension-updater-smoketest')

async function main(): Promise<void> {
  const extensions = await client.query(installed.map((i) => i.id))
  console.log('gallery hits:', extensions.length)

  const byId = new Map(extensions.map((e) => [e.id, e]))
  const ctx = { hostVersion: '1.144.0', now: new Date() }
  let pending = 0
  for (const inst of installed) {
    const ext = byId.get(inst.id)
    if (!ext) continue
    const asInstalled = { id: inst.id, displayName: inst.id, version: inst.version, prerelease: false }
    const update = pickUpdate(asInstalled, ext, ctx)
    if (update) {
      pending++
      console.log(
        `  ${update.id}: ${update.installedVersion} -> ${update.availableVersion} · ${relativeAge(update.releasedAt, ctx.now)}`,
      )
    }
  }
  console.log('pending updates:', pending)
}
void main()
