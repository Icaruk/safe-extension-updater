# Safe Extension Updater

Review extension updates **before** installing them.

Extension updates are a **supply chain attack vector**: a compromised publisher can push a malicious release that auto-update installs on every machine.

<img height="600" alt="image" src="https://github.com/user-attachments/assets/98265ec7-ea09-42e0-9546-0d9e434a9b8f" />


## Features

- Lists every pending update.
- Very recent releases (default < 24 h) are flagged red and skipped by bulk updates.
- Every update is checked against [OSV.dev](https://osv.dev), so **known malicious packages are blocked**.
- Extensions **removed from the Marketplace** (malware, impersonation) are listed in their own section with an **Uninstall** button.
- Updates from extensions whose **source repository is private or missing** show a yellow warning line.
- Extensions that **bundle their npm dependencies** are checked against OSV too; vulnerable ones are flagged in red.
- If the **installed** version has active OSV findings, the row shows a yellow **Must update** button with links to the advisories — that update fixes them.
- Installed updates apply on the next window reload; the view shows what is pending a reload.
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

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Development

```bash
npm install
npm run compile
npm test
```

Press **F5** to launch an Extension Development Host. Package with `npx vsce package`.

## License

[MIT](LICENSE)
