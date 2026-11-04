import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { collectDependencyVersions } from '../src/gallery/deps.js'

async function pkg(root: string, path: string, name: string, version: string): Promise<void> {
  await mkdir(join(root, 'node_modules', ...path.split('/')), { recursive: true })
  await writeFile(join(root, 'node_modules', ...path.split('/'), 'package.json'), JSON.stringify({ name, version }))
}

test('flattens the whole node_modules tree including transitives and scopes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vsix-'))
  await pkg(root, 'direct', 'direct', '1.0.0')
  await pkg(root, 'direct/node_modules/transitive', 'transitive', '2.0.0')
  await pkg(root, '@scope/pkg', '@scope/pkg', '3.0.0')
  const deps = await collectDependencyVersions(root)
  assert.deepEqual(
    [...deps.values()],
    [
      { name: 'direct', version: '1.0.0' },
      { name: 'transitive', version: '2.0.0' },
      { name: '@scope/pkg', version: '3.0.0' },
    ],
  )
})

test('dedupes the same name@version across the tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vsix-'))
  await pkg(root, 'a', 'a', '1.0.0')
  await pkg(root, 'b', 'b', '1.0.0')
  await pkg(root, 'b/node_modules/a', 'a', '1.0.0')
  await pkg(root, 'a/node_modules/c', 'c', '2.0.0')
  const deps = await collectDependencyVersions(root)
  assert.equal(deps.get('a@1.0.0')?.version, '1.0.0')
  assert.equal(deps.size, 3) // a@1.0.0, b@1.0.0, c@2.0.0 — a@1.0.0 deduped
})

test('missing node_modules and unreadable packages are tolerated', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'vsix-'))
  assert.deepEqual(await collectDependencyVersions(empty), new Map())
  const broken = await mkdtemp(join(tmpdir(), 'vsix-'))
  await mkdir(join(broken, 'node_modules', 'junk'), { recursive: true })
  await writeFile(join(broken, 'node_modules', 'junk', 'package.json'), 'not json')
  assert.deepEqual(await collectDependencyVersions(broken), new Map())
})
