import { parseMarketplaceResponse } from './validate.js';
import { fetchJson } from './http.js';
import type { ExtensionGalleryClient, GalleryExtension } from './types.js';

const QUERY_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
// Undocumented API, verified against the live endpoint on 2026-11-03:
// filterType 7 matches by extension id; filterType 5 is rejected nowadays.
// Pagination fields (pageNumber/pageSize/sortBy/sortOrder) are REQUIRED:
// a bare criteria-only body returns no versions[].
// flags 946 = flags that include versions + IncludeVersionProperties (0x20),
// which carries Microsoft.VisualStudio.Code.Engine and .PreRelease.
// flags 914 (no 0x20) returns versions but NO Engine/PreRelease properties.
const FLAGS = 946;
const CHUNK_SIZE = 50;
const TIMEOUT_MS = 20_000;

/** Pure request-body builder so batching can be unit-tested without network. */
export function buildRequestBody(ids: readonly string[]): Record<string, unknown> {
  return {
    filters: [
      {
        criteria: ids.map((id) => ({ filterType: 7, value: id })),
        pageNumber: 1,
        pageSize: 1000,
        sortBy: 0,
        sortOrder: 0,
      },
    ],
    assetTypes: [],
    flags: FLAGS,
  };
}

export function createMarketplaceClient(userAgent: string): ExtensionGalleryClient {
  const query = async (ids: readonly string[]): Promise<readonly GalleryExtension[]> => {
    const results: GalleryExtension[] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const body = await fetchJson(
        QUERY_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json;api-version=3.0-preview',
            'User-Agent': userAgent,
          },
          body: JSON.stringify(buildRequestBody(chunk)),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
        'Marketplace query failed',
      );
      results.push(...parseMarketplaceResponse(body));
    }
    return results;
  };
  return { query };
}
