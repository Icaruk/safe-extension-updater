/** Shared runtime narrowing helpers (all gallery/webview payloads enter as unknown). */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** String or undefined; empty strings count as missing. */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
