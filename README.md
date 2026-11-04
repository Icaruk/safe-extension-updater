# Safe Extension Updater

Review extension updates **before** installing them.

VS Code can auto-update extensions in the background. If a publisher account
is compromised, a malicious release reaches every machine within the hour.
This extension lists every pending update with its release age, flags very
recent releases, and checks each one against the OSV vulnerability database.

<!-- TODO: add screenshot here -->

## Features

- Activity Bar view listing every installed extension with an available
  update: `installed → available`, publisher and release age.
- Releases younger than the configured threshold (default 24 h) are flagged
  in red and skipped by bulk updates.
- Each update is checked against [OSV.dev](https://osv.dev): known malicious
  packages are blocked with a red warning, past (non-affecting) advisories
  are shown as a muted note.
- `Update` per row and `Update all safely` (only updates releases older than
  the threshold, no confirmation dialogs).
- Native auto-update status section: detects when `extensions.autoUpdate` is
  on (or when a single extension opted in) and offers a one-click fix.
- Works against the Visual Studio Marketplace and Open VSX (auto-detected on
  forks like VSCodium, Cursor or Windsurf).

## Extension settings

| Setting | Default | Description |
| --- | --- | --- |
| `extensionUpdater.earlyReleaseProtectionHours` | `24` | Releases younger than this are flagged as recent and guarded. |
| `extensionUpdater.refreshIntervalHours` | `2` | Hours between automatic gallery refreshes (`0` disables). |
| `extensionUpdater.gallery` | `auto` | Gallery source: `auto`, `marketplace` or `openvsx`. |

## Requirements

- VS Code 1.85 or newer.

## Development

```bash
npm install
npm run compile
npm test
```

Press **F5** to launch an Extension Development Host. Package with
`npx vsce package`.

## License

[MIT](LICENSE)
