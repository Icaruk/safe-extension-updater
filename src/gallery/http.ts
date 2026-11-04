/** Shared fetch for the gallery clients: JSON in, parsed unknown out, labeled errors. */
export async function fetchJson(url: string, init: RequestInit, label: string): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}
