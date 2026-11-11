/**
 * Bundled-dependency lookup for an installed extension. The vsix ships the
 * extension's package.json and, when not webpack-bundled, a node_modules
 * tree. The WHOLE tree is flattened (transitives included, that is where
 * npm worms live) and deduped by name@version; every pinned package gets
 * one OSV query. Bundled (webpack) extensions expose nothing: skipped.
 */

import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { asString, isRecord } from '../core/narrow.js'

/** Every package pinned under node_modules, deduped; name@version unique. */
export interface PinnedDependency {
  readonly name: string
  readonly version: string
}

export async function collectDependencyVersions(extensionPath: string): Promise<Map<string, PinnedDependency>> {
  const pinned = new Map<string, PinnedDependency>()
  await walk(join(extensionPath, 'node_modules'), pinned)
  return pinned
}

async function walk(dir: string, pinned: Map<string, PinnedDependency>): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // no node_modules here: bundled extension, nothing to check
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return
      if (entry.name.startsWith('.')) return
      if (entry.name.startsWith('@')) {
        await walk(join(dir, entry.name), pinned) // scope folder, not a package
        return
      }
      try {
        const raw = await readFile(join(dir, entry.name, 'package.json'), 'utf8')
        const manifest = JSON.parse(raw) as unknown
        const name = isRecord(manifest) ? asString(manifest['name']) : undefined
        const version = isRecord(manifest) ? asString(manifest['version']) : undefined
        if (name && version) pinned.set(`${name}@${version}`, { name, version })
      } catch {
        // unreadable package.json: skip this package
      }
      await walk(join(dir, entry.name, 'node_modules'), pinned) // transitives
    }),
  )
}
