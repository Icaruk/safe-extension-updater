/**
 * Pure semver parsing and comparison, plus VS Code engine range checks.
 * No VS Code or network dependencies here: fully unit-testable.
 */

export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(input: string): SemVer | undefined {
  const match = SEMVER_RE.exec(input.trim());
  if (!match) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) return undefined;
  return {
    major,
    minor,
    patch,
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
  };
}

function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // a release outranks its own prerelease
  if (b.length === 0) return -1;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai === undefined) return -1; // shorter prefix loses
    if (bi === undefined) return 1;
    const an = Number(ai);
    const bn = Number(bi);
    const aNum = ai !== '' && Number.isInteger(an);
    const bNum = bi !== '' && Number.isInteger(bn);
    if (aNum && bNum) {
      if (an !== bn) return an - bn;
    } else if (aNum) {
      return -1; // numeric identifiers rank below alphanumeric ones
    } else if (bNum) {
      return 1;
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
}

export function compareSemver(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** Compare two version strings; unparseable input compares equal (0). */
export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  return compareSemver(pa, pb);
}

function versionGreaterOrEqual(host: SemVer, base: SemVer): boolean {
  return compareSemver(host, base) >= 0;
}

function versionGreaterThan(host: SemVer, base: SemVer): boolean {
  return compareSemver(host, base) > 0;
}

/**
 * Check a marketplace `engines.vscode` value (e.g. "^1.95.0", ">=1.80.0", "*", "1.85.0")
 * against a concrete host version. Unknown engines or unparseable host versions are
 * treated as compatible so the view does not silently hide updates.
 */
export function isEngineCompatible(engine: string, hostVersion: string): boolean {
  const value = engine.trim();
  if (value === '' || value === '*') return true;
  const host = parseSemver(hostVersion.trim().split('-')[0] ?? hostVersion);
  if (!host) return true;
  const match = /^(\^|~|>=|>|<=|<|=)?\s*([0-9A-Za-z.*+.-]+)$/.exec(value);
  if (!match) return true;
  const operator = match[1] ?? '=';
  const base = parseSemver(match[2] ?? '');
  if (!base) return true;
  switch (operator) {
    case '>=':
      return versionGreaterOrEqual(host, base);
    case '>':
      return versionGreaterThan(host, base);
    case '<=':
      return !versionGreaterThan(host, base);
    case '<':
      return compareSemver(host, base) < 0;
    case '~':
      return host.major === base.major && host.minor === base.minor && versionGreaterOrEqual(host, base);
    case '^': {
      // npm caret semantics, including the 0.x special cases.
      if (base.major === 0 && base.minor === 0) {
        return host.major === 0 && host.minor === 0 && host.patch === base.patch && versionGreaterOrEqual(host, base);
      }
      if (base.major === 0) {
        // VS Code semantics (extensionValidator.ts): "^0.x engines predate the 1.0
        // engine contract; anything < 1.0.0 runs on any 1.x host, but not on 2.x".
        if (host.major === 0) {
          return host.minor === base.minor && versionGreaterOrEqual(host, base);
        }
        return host.major === 1;
      }
      return host.major === base.major && versionGreaterOrEqual(host, base);
    }
    case '=':
      return host.major === base.major && host.minor === base.minor && host.patch === base.patch;
    default:
      return true;
  }
}
