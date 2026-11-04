import type { GalleryExtension, GalleryVersion } from './types.js';
import { asString, isRecord } from '../core/narrow.js';

const ENGINE_KEY = 'Microsoft.VisualStudio.Code.Engine';
const PRERELEASE_KEY = 'Microsoft.VisualStudio.Code.PreRelease';

function propertyValue(version: Record<string, unknown>, key: string): string | undefined {
  const properties = version['properties'];
  if (!Array.isArray(properties)) return undefined;
  for (const entry of properties) {
    if (!isRecord(entry)) continue;
    if (entry['key'] === key) return asString(entry['value']);
  }
  return undefined;
}

function parseVersion(raw: unknown): GalleryVersion | undefined {
  if (!isRecord(raw)) return undefined;
  const version = asString(raw['version']);
  const lastUpdated = asString(raw['lastUpdated']);
  if (!version || !lastUpdated) return undefined;
  return {
    version,
    lastUpdated,
    prerelease: propertyValue(raw, PRERELEASE_KEY) === 'true',
    engine: propertyValue(raw, ENGINE_KEY) ?? '',
  };
}

const ICON_ASSET = 'Microsoft.VisualStudio.Services.Icons.Default';

/** Icon URL from any version's file assets; extensions without one stay undefined. */
function iconUrlFromVersions(rawVersions: readonly unknown[]): string | undefined {
  for (const rawVersion of rawVersions) {
    if (!isRecord(rawVersion)) continue;
    const files = rawVersion['files'];
    if (!Array.isArray(files)) continue;
    for (const file of files) {
      if (!isRecord(file)) continue;
      if (file['assetType'] === ICON_ASSET) {
        const url = asString(file['source']);
        if (url) return url;
      }
    }
  }
  return undefined;
}

function parseExtension(raw: unknown): GalleryExtension | undefined {
  if (!isRecord(raw)) return undefined;
  const name = asString(raw['extensionName']);
  const publisher = isRecord(raw['publisher']) ? asString(raw['publisher']['publisherName']) : undefined;
  if (!name || !publisher) return undefined;
  const rawVersions = Array.isArray(raw['versions']) ? raw['versions'] : [];
  const versions = rawVersions
    .map(parseVersion)
    .filter((version): version is GalleryVersion => version !== undefined);
  return {
    id: `${publisher}.${name}`,
    displayName: asString(raw['displayName']) ?? name,
    iconUrl: iconUrlFromVersions(rawVersions),
    versions,
  };
}

/**
 * Narrow an untyped Visual Studio Marketplace extensionquery response body into
 * GalleryExtension[], skipping every malformed entry instead of throwing.
 */
export function parseMarketplaceResponse(raw: unknown): readonly GalleryExtension[] {
  if (!isRecord(raw)) return [];
  const results = raw['results'];
  if (!Array.isArray(results)) return [];
  const extensions: GalleryExtension[] = [];
  for (const result of results) {
    if (!isRecord(result)) continue;
    const list = result['extensions'];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const parsed = parseExtension(entry);
      if (parsed) extensions.push(parsed);
    }
  }
  return extensions;
}

/**
 * Normalize an Open VSX `/api/{namespace}/{name}` payload into a single
 * GalleryExtension (Open VSX only exposes the latest version per extension).
 */
export function parseOpenVsxExtension(raw: unknown): GalleryExtension | undefined {
  if (!isRecord(raw)) return undefined;
  const namespace = asString(raw['namespace']);
  const name = asString(raw['name']);
  const version = asString(raw['version']);
  if (!namespace || !name || !version) return undefined;
  const engines = isRecord(raw['engines']) ? raw['engines'] : undefined;
  const engine = (engines && asString(engines['vscode'])) ?? '';
  const files = isRecord(raw['files']) ? raw['files'] : undefined;
  return {
    id: `${namespace}.${name}`,
    displayName: asString(raw['displayName']) ?? name,
    iconUrl: files ? asString(files['icon']) : undefined,
    versions: [
      {
        version,
        lastUpdated: asString(raw['timestamp']) ?? '',
        prerelease: raw['preRelease'] === true || raw['preview'] === true,
        engine,
      },
    ],
  };
}
