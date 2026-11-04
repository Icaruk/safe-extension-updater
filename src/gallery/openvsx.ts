import { parseOpenVsxExtension } from './validate.js';
import { fetchJson } from './http.js';
import type { ExtensionGalleryClient, GalleryExtension } from './types.js';

// Open VSX has no usable batch endpoint (verified 2026-11-03): the query POST
// rejects extensionId lists and returns unrelated defaults for extensionIds.
// So: one GET per extension with bounded concurrency.
const CONCURRENCY = 6;
const TIMEOUT_MS = 20_000;

export function openVsxUrl(id: string): string {
  const dot = id.indexOf('.');
  const namespace = dot > 0 ? id.slice(0, dot) : '';
  const name = dot > 0 ? id.slice(dot + 1) : '';
  if (!namespace || !name) return '';
  return `https://open-vsx.org/api/${namespace}/${name}`;
}

export function createOpenVsxClient(userAgent: string): ExtensionGalleryClient {
  const query = async (ids: readonly string[]): Promise<readonly GalleryExtension[]> => {
    const results: GalleryExtension[] = [];
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.allSettled(
        batch.map(async (id) => {
          const url = openVsxUrl(id);
          if (!url) return undefined;
          // 404 (not published on Open VSX) and other HTTP failures throw;
          // allSettled drops them so one missing extension never aborts the scan.
          const body = await fetchJson(
            url,
            {
              headers: { Accept: 'application/json', 'User-Agent': userAgent },
              signal: AbortSignal.timeout(TIMEOUT_MS),
            },
            `Open VSX query failed for ${id}`,
          );
          return parseOpenVsxExtension(body);
        }),
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled' && outcome.value) results.push(outcome.value);
        // Rejections are dropped: one failing extension must not abort the scan.
      }
    }
    return results;
  };
  return { query };
}
