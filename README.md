# Safe Extension Updater

Review extension updates **before** installing them.

Extension updates are a **supply chain attack vector**: a compromised publisher can push a malicious release that auto-update installs on every machine.

<img width="464" height="609" alt="image" src="https://github.com/user-attachments/assets/072eaf9d-000e-41ff-bcf8-e9eddf1c4d77" />

## Features

- Lists every pending update.
- Very recent releases (default < 24 h) are flagged red and skipped by bulk updates.
- Every update is checked against [OSV.dev](https://osv.dev), so **known malicious packages are blocked**.
- `Update all safely`: updates only releases older than the configured threshold and never OSV-flagged malicious ones.
- Detects when single extension auto-update is on, and fixes it in one click.
- Visual Studio Marketplace and Open VSX, auto-detected.

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

Press **F5** to launch an Extension Development Host. Package with `npx vsce package`.

## License

[MIT](LICENSE)
