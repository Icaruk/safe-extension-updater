/**
 * Normalized, validated shapes shared by every gallery client.
 * All gallery payloads are narrowed into these types before use.
 */

export interface GalleryVersion {
  readonly version: string;
  /** ISO-8601 publication date */
  readonly lastUpdated: string;
  readonly prerelease: boolean;
  /** `engines.vscode` value; '' when the source does not provide one (treated as compatible) */
  readonly engine: string;
}

export interface GalleryExtension {
  /** publisher.name */
  readonly id: string;
  readonly displayName: string;
  /** Icon URL from the gallery; undefined when the source omits it */
  readonly iconUrl?: string;
  readonly versions: readonly GalleryVersion[];
}

export interface PendingUpdate {
  readonly id: string;
  readonly displayName: string;
  readonly installedVersion: string;
  readonly availableVersion: string;
  /** ISO-8601 publication date of the available version */
  readonly releasedAt: string;
  readonly iconUrl?: string;
  /** OSV ids (MAL-*) of entries affecting the available version */
  readonly malicious?: readonly string[];
  /** OSV entries filed for this extension that do not affect the available version */
  readonly pastVulns?: number;
  /** OSV ids affecting the INSTALLED version: the update fixes these, install it now */
  readonly installedVulns?: readonly string[];
}

export interface ExtensionGalleryClient {
  /**
   * Query several extension ids at once. Batched where the source allows it;
   * extensions missing from the source are simply omitted from the result.
   * Throws when the source itself is unreachable or returns an error.
   */
  readonly query: (ids: readonly string[]) => Promise<readonly GalleryExtension[]>;
}
