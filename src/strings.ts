/**
 * All runtime user-facing copy, in English. Contributed strings (package.json)
 * live in package.nls.json instead.
 */
export const strings = {
  searching: 'Checking for updates…',
  upToDate: 'No pending updates.',
  updateButton: 'Update',
  mustUpdateButton: 'Must update',
  updatedButton: 'Updated',
  updatingButton: 'Updating…',
  reloadBanner: (count: number): string =>
    `${count} ${count === 1 ? 'update' : 'updates'} installed. Reload VS Code to take effect.`,
  reloadVscode: 'Reload VS Code',
  maliciousButton: 'Malware',
  checkUpdatesLabel: 'Check for updates',
  maliciousFindings: '⚠ Malicious code in the update (OSV):',
  pastVulns: (count: number): string => `${count} past ${count === 1 ? 'vulnerability' : 'vulnerabilities'} found.`,
  installedVulns: '⚠ Installed version affected (OSV):',
  depVulns: '⚠ Vulnerable dependency in the current installation (OSV):',
  removedTitle: 'Removed from the Marketplace',
  removedReason: (date: string, type: string): string => `Removed ${date} · ${type}. Uninstall it.`,
  uninstallButton: 'Uninstall',
  uninstallFailed: (id: string, detail: string): string => `Failed to uninstall ${id}: ${detail}`,
  repoMissing: '⚠ No public source repository declared.',
  repoPrivate: '⚠ Source repository is private or unavailable.',
  queryError: (detail: string): string => `Failed to query the extension gallery: ${detail}`,
  autoUpdateWarning:
    'Native VS Code auto-update is active and may update extensions before you review them. Turn it off?',
  disableAutoUpdate: 'Disable auto-update',
  fixAutoUpdate: 'Fix',
  autoUpdateEnabled: 'Auto-update extensions is enabled.',
  autoUpdatePartial: 'Some extensions have auto-update enabled.',
  autoUpdateDisabled: 'Auto-update extensions are disabled.',
  optInsCleared: 'Per-extension auto-update opt-ins cleared.',
  reloadToTakeEffect: 'Reload to take effect',
  optInsClearFailed: 'Could not clear the per-extension auto-update opt-ins (storage locked?).',
  updateAnyway: 'Update anyway',
  updateAllLabel: 'Update all safely',
  pendingUpdates: 'Available updates',
  badgeTooltip: (count: number): string => `${count} ${count === 1 ? 'update' : 'updates'} available`,
  updateOneWarning: (version: string, age: string): string =>
    `The version ${version} was released ${age}.\n\nVery recent releases may contain unreviewed or compromised changes.\n\nUpdate anyway?`,
  versionChanged: (displayName: string, shown: string, current: string): string =>
    `${displayName}'s available version changed (${shown} → ${current}) since the last query. The current one will be installed.`,
  updateAllSummary: (updated: number, failures: readonly string[]): string =>
    `${updated} updated, ${failures.length} failed: ${failures.join(', ')}`,
  updateFailed: (id: string, detail: string): string => `Failed to update ${id}: ${detail}`,
}
