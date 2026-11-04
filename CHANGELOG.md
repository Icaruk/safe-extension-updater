# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-11-04

### Corregido

- La marca "Updated" y el aviso para recargar ya no desaparecen al actualizar la propia extensión.

### Mejorado

- Mientras se instala una actualización, su fila muestra "Updating…" en lugar del botón Update.
- "No pending updates." ahora aparece centrado con un check verde, igual que el estado de auto-update.

## [1.2.0] - 2026-11-04

### Added

- Installed updates show a green "Updated" tag and a banner with a **Reload VS Code** button; updates take effect after the reload.

### Changed

- "Malware" marker is now a tag, not a disabled button.

### Fixed

- Extensions stayed listed as pending right after updating them.

## [1.1.0] - 2026-11-04

### Added

- OSV check on the installed version: rows whose installed version has active findings show a "Must update" button (yellow) with links to the OSV entries.

## [1.0.1] - 2026-11-04

### Fixed

- Extension icon now has a transparent background.

## [1.0.0] - 2026-11-04

### Added

- Pending-updates view with per-extension Update and "Update all safely".
- Gallery queries against the VS Code Marketplace and Open VSX, with engine-compatible release picking.
- Early-release protection: warns before installing very recent releases.
- OSV.dev malicious-package findings (active and past) shown per update.
- Native auto-update tracking with a one-click fix.
