/**
 * Pure decision over the `extensions.autoUpdate` value. VS Code 1.144 turned
 * the setting into an enum: 'on' | 'off' | 'onlyEnabledExtensions' |
 * 'onlySelectedExtensions' (legacy `false` migrates to 'off', legacy `true`
 * reads back as 'on'). The only* values update just a subset (enabled or
 * selected extensions), so they count as partially enabled.
 */
export type AutoUpdateState = 'enabled' | 'partial' | 'disabled'

export function autoUpdateState(value: unknown): AutoUpdateState {
  if (value === false || value === 'off') return 'disabled'
  if (value === 'onlyEnabledExtensions' || value === 'onlySelectedExtensions') return 'partial'
  return 'enabled' // true, 'on', undefined (default 'on')
}

/**
 * VS Code keeps per-extension/per-publisher auto-update opt-ins (made while
 * the global setting is off) in internal storage the API cannot read
 * (state.vscdb key `extensions.autoUpdate`, a JSON array of ids).
 */
export function optInsAutoUpdate(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}
