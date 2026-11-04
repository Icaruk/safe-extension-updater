import * as vscode from 'vscode';
import {
  isInstalledPreRelease,
  isRecentRelease,
  pickUpdate,
  relativeAge,
  type InstalledExtension,
  type PickContext,
} from './core/release.js';
import type { ExtensionGalleryClient, PendingUpdate } from './gallery/types.js';
import { asString, isRecord } from './core/narrow.js';
import { strings } from './strings.js';

/** Subset of the manifest this extension cares about; everything stays `unknown` until narrowed. */
interface Manifest {
  readonly publisher: unknown;
  readonly name: unknown;
  readonly version: unknown;
  readonly displayName: unknown;
  readonly preRelease: unknown;
  readonly isBuiltin: unknown;
}

function readManifest(ext: vscode.Extension<unknown>): Manifest | undefined {
  const raw: unknown = ext.packageJSON; // typed `any` by the VS Code API; treated as unknown
  if (!isRecord(raw)) return undefined;
  return {
    publisher: raw['publisher'],
    name: raw['name'],
    version: raw['version'],
    displayName: raw['displayName'],
    preRelease: raw['preRelease'],
    isBuiltin: raw['isBuiltin'],
  };
}

export type UpdateAllResult = {
  readonly updatedIds: readonly string[];
  readonly failures: readonly string[];
};

/**
 * VS Code layer around the pure update logic: reads installed extensions,
 * queries the gallery, and drives installs with the modal warnings and the
 * single end-of-run reload offer.
 */
export class Updater {
  /** Tri-state: undefined = capability unknown, true = pinning works, false = rejected. */
  private pinSupported: boolean | undefined;

  constructor(
    private readonly getGallery: () => ExtensionGalleryClient,
    private readonly hostVersion: string,
  ) {}

  /** Scan installed extensions and resolve every pending update against the gallery. */
  async collectPending(): Promise<readonly PendingUpdate[]> {
    const now = new Date();
    const installed = this.collectInstalled();
    if (installed.length === 0) return [];

    const galleryList = await this.getGallery().query(installed.map((ext) => ext.id));
    const byId = new Map(galleryList.map((gallery) => [gallery.id.toLowerCase(), gallery]));

    const pending: PendingUpdate[] = [];
    for (const ext of installed) {
      const gallery = byId.get(ext.id);
      if (!gallery) continue;
      const prerelease = isInstalledPreRelease(ext.manifestPreRelease, ext.version, gallery);
      const ctx: PickContext = { hostVersion: this.hostVersion, now };
      const update = pickUpdate({ ...ext, prerelease }, gallery, ctx);
      if (update) pending.push(update);
    }
    return pending;
  }

  private collectInstalled(): (InstalledExtension & { readonly manifestPreRelease: unknown })[] {
    const installed: (InstalledExtension & { readonly manifestPreRelease: unknown })[] = [];
    for (const ext of vscode.extensions.all) {
      const manifest = readManifest(ext);
      if (!manifest || this.isBuiltin(ext, manifest)) continue;
      const publisher = asString(manifest.publisher);
      const name = asString(manifest.name);
      const version = asString(manifest.version);
      if (!publisher || !name || !version) continue;
      // VS Code ids are case-insensitive; the marketplace answers lowercase
      // (e.g. manifest "Anthropic.claude-code" → gallery "anthropic.claude-code").
      installed.push({
        id: `${publisher}.${name}`.toLowerCase(),
        displayName: asString(manifest.displayName) ?? name,
        version,
        prerelease: false,
        manifestPreRelease: manifest.preRelease,
      });
    }
    return installed;
  }

  private isBuiltin(ext: vscode.Extension<unknown>, manifest: Manifest): boolean {
    if (manifest.isBuiltin === true) return true;
    return ext.extensionUri.fsPath.startsWith(vscode.Uri.file(vscode.env.appRoot).fsPath);
  }

  /** Install one update, warning first when its release is recent. */
  async updateOne(update: PendingUpdate, thresholdHours: number): Promise<'updated' | 'cancelled'> {
    if (isRecentRelease(update.releasedAt, new Date(), thresholdHours)) {
      const age = relativeAge(update.releasedAt, new Date());
      const choice = await vscode.window.showWarningMessage(
        strings.updateOneWarning(update.availableVersion, age),
        { modal: true },
        strings.updateAnyway,
      );
      if (choice !== strings.updateAnyway) return 'cancelled';
    }
    await this.install(update);
    return 'updated';
  }

  /**
   * Install every non-recent, non-flagged update sequentially, with no
   * confirmation: "Update all safely" = only releases older than the
   * configured threshold and never OSV-flagged malicious ones.
   * Per-extension failures are collected, never fatal. Returns the ids
   * actually installed.
   */
  async updateAll(updates: readonly PendingUpdate[], thresholdHours: number): Promise<UpdateAllResult> {
    const now = new Date();
    const selected = updates.filter(
      (update) => !isRecentRelease(update.releasedAt, now, thresholdHours) && !(update.malicious?.length),
    );
    const updatedIds: string[] = [];
    const failures: string[] = [];
    for (const update of selected) {
      try {
        await this.install(update);
        updatedIds.push(update.id);
      } catch {
        failures.push(update.id);
      }
    }
    return { updatedIds, failures };
  }

  /**
   * Install exactly the version that was shown. Prefers pinning
   * `publisher.name@version`; when the host rejects the pinned id (unknown
   * capability), falls back to a fresh re-query: warn if the version changed,
   * then install unpinned. ponytail: pinned-install failure is assumed to mean
   * "no pinning support"; a silent no-op would need a version probe per host.
   */
  async install(update: PendingUpdate): Promise<void> {
    if (this.pinSupported !== false) {
      try {
        await vscode.commands.executeCommand(
          'workbench.extensions.installExtension',
          `${update.id}@${update.availableVersion}`,
        );
        this.pinSupported = true;
        return;
      } catch (error) {
        if (this.pinSupported === true) throw error; // pinning already proven; real failure
        this.pinSupported = false; // host rejected the pinned id → fall through
        console.warn(`Pinned install rejected for ${update.id}, falling back: ${String(error)}`);
      }
    }
    const [latest] = await this.getGallery().query([update.id]);
    const current = latest
      ? pickUpdate(
          {
            id: update.id,
            displayName: update.displayName,
            version: update.installedVersion,
            prerelease: isInstalledPreRelease(undefined, update.installedVersion, latest),
          },
          latest,
          { hostVersion: this.hostVersion, now: new Date() },
        )
      : undefined;
    if (current && current.availableVersion !== update.availableVersion) {
      void vscode.window.showWarningMessage(
        strings.versionChanged(update.displayName, update.availableVersion, current.availableVersion),
      );
    }
    await vscode.commands.executeCommand('workbench.extensions.installExtension', update.id);
  }
}
