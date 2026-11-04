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
