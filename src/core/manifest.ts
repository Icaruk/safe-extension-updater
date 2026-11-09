import * as path from 'node:path'
import { asString, isRecord } from './narrow.js'
import type { InstalledExtension } from './release.js'

/**
 * Narrow a raw extension manifest (`packageJSON`, typed `any` by VS Code) into
 * an installed extension; built-ins and manifests without publisher/name/version
 * are skipped.
 */
export function manifestToInstalled(
  raw: unknown,
  isBuiltinPath: boolean,
): (InstalledExtension & { readonly manifestPreRelease: unknown }) | undefined {
  if (!isRecord(raw)) return undefined
  if (raw['isBuiltin'] === true || isBuiltinPath) return undefined
  const publisher = asString(raw['publisher'])
  const name = asString(raw['name'])
  const version = asString(raw['version'])
  if (!publisher || !name || !version) return undefined
  return {
    // VS Code ids are case-insensitive; the marketplace answers lowercase
    // (e.g. manifest "Anthropic.claude-code" → gallery "anthropic.claude-code").
    id: `${publisher}.${name}`.toLowerCase(),
    displayName: asString(raw['displayName']) ?? name,
    version,
    prerelease: false,
    manifestPreRelease: raw['preRelease'],
    repository: raw['repository'],
  }
}

/**
 * Keep only the copies VS Code itself counts as installed: folders registered
 * in the extensions directory's `extensions.json` — the same index the
 * official update badge reads. An update leaves the old version's folder on
 * disk until a later cleanup (microsoft/vscode#182675) and
 * `vscode.extensions.all` still exposes it, so without this the pending
 * count reports one row per leftover copy. Extensions living outside the
 * local extensions directory (remote hosts, dev checkouts) pass through.
 */
export function filterRegistered<T extends { readonly extensionPath: string }>(
  entries: readonly T[],
  localDir: string,
  registered: ReadonlySet<string>,
): readonly T[] {
  const prefix = localDir.endsWith(path.sep) ? localDir : localDir + path.sep
  return entries.filter(
    (entry) => !entry.extensionPath.startsWith(prefix) || registered.has(path.basename(entry.extensionPath)),
  )
}
