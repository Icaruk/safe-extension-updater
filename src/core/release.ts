import {
  compareSemver,
  compareVersions,
  isEngineCompatible,
  parseSemver,
} from './versioning.js';
import type { GalleryExtension, PendingUpdate } from '../gallery/types.js';

export const ENGINE_PROPERTY = 'Microsoft.VisualStudio.Code.Engine';
export const PRERELEASE_PROPERTY = 'Microsoft.VisualStudio.Code.PreRelease';

/** An installed extension as seen through its manifest, already narrowed. */
export interface InstalledExtension {
  readonly id: string; // publisher.name
  readonly displayName: string;
  readonly version: string;
  readonly prerelease: boolean;
}

export interface PickContext {
  readonly hostVersion: string; // vscode.version, e.g. "1.100.0-insider"
  readonly now: Date;
}

/**
 * Normalize an ISO-8601 date that may carry more fractional digits than
 * `Date.parse` formally accepts (Open VSX uses 6, e.g. 2026-03-16T19:14:43.319347Z).
 */
export function parseIsoDate(input: string): Date | undefined {
  const normalized = input.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3})\d+/, '$1');
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? undefined : new Date(time);
}

/**
 * Decide whether the installed extension is a pre-release build:
 * explicit manifest flag → semver suffix → gallery flag for that exact version.
 * The gallery may only return the latest version, hence the fallbacks.
 */
export function isInstalledPreRelease(
  manifestFlag: unknown,
  installedVersion: string,
  gallery: GalleryExtension | undefined,
): boolean {
  if (manifestFlag === true) return true;
  if ((parseSemver(installedVersion)?.prerelease.length ?? 0) > 0) return true;
  const entry = gallery?.versions.find((version) => version.version === installedVersion);
  return entry?.prerelease ?? false;
}

/**
 * Pick the best update candidate for an installed extension: the highest
 * version that is newer, engine-compatible and not a pre-release (unless the
 * installed build itself is a pre-release). Returns undefined when there is
 * nothing to install.
 */
export function pickUpdate(
  installed: InstalledExtension,
  gallery: GalleryExtension,
  ctx: PickContext,
): PendingUpdate | undefined {
  const installedParsed = parseSemver(installed.version);
  if (!installedParsed) return undefined;

  let best: { version: string; releasedAt: string } | undefined;
  for (const candidate of gallery.versions) {
    const parsed = parseSemver(candidate.version);
    if (!parsed) continue;
    if (candidate.prerelease && !installed.prerelease) continue;
    if (!isEngineCompatible(candidate.engine, ctx.hostVersion)) continue;
    if (compareSemver(parsed, installedParsed) <= 0) continue;
    const releasedAt = parseIsoDate(candidate.lastUpdated);
    if (!releasedAt) continue;
    if (!best || compareVersions(candidate.version, best.version) > 0) {
      best = { version: candidate.version, releasedAt: candidate.lastUpdated };
    }
  }
  if (!best) return undefined;
  return {
    id: installed.id,
    displayName: installed.displayName,
    installedVersion: installed.version,
    availableVersion: best.version,
    releasedAt: best.releasedAt,
    iconUrl: gallery.iconUrl,
  };
}

export function isRecentRelease(releasedAt: string, now: Date, thresholdHours: number): boolean {
  const date = parseIsoDate(releasedAt);
  if (!date) return false;
  const ageMs = now.getTime() - date.getTime();
  return ageMs >= 0 && ageMs < thresholdHours * 3_600_000;
}

/** English relative age, e.g. "3 hours ago", "5 days ago". */
const SHORT = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'short' });
const LONG = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'long' });

export function relativeAge(releasedAt: string, now: Date): string {
  const date = parseIsoDate(releasedAt);
  if (!date) return 'unknown date';
  // ICU "short" abbreviates seconds/minutes ("45 min. ago"); hours and up use "long".
  const diffMs = now.getTime() - date.getTime();
  if (diffMs <= 0) return 'just now'; // future-dated release (clock skew)
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return SHORT.format(-seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return SHORT.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return LONG.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return LONG.format(-days, 'day');
  const months = Math.floor(days / 30);
  if (months < 12) return LONG.format(-months, 'month');
  return LONG.format(-Math.floor(days / 365), 'year');
}
