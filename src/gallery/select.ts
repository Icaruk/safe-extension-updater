import { createMarketplaceClient } from './marketplace.js'
import { createOpenVsxClient } from './openvsx.js'
import type { ExtensionGalleryClient } from './types.js'

export type GallerySetting = 'auto' | 'marketplace' | 'openvsx'

/** `auto` sends VS Code forks that ship with Open VSX to Open VSX, everyone else to the Marketplace. */
export function prefersOpenVsx(setting: GallerySetting, appName: string): boolean {
  return setting === 'openvsx' || (setting === 'auto' && /codium|cursor|windsurf|code-oss|theia/i.test(appName))
}

export function resolveGallery(setting: GallerySetting, appName: string, userAgent: string): ExtensionGalleryClient {
  return prefersOpenVsx(setting, appName) ? createOpenVsxClient(userAgent) : createMarketplaceClient(userAgent)
}
