# safe-extension-updater

Extensiones de VS Code: solo tocar `src/`, `media/`, `test/` y los archivos de configuración. `out/` se genera con `npx tsc -p ./`; `build/*.vsix` son artefactos.

## Changelog

- En **españ**, orientado al **usuario final**: nada técnico (sin nombres de variables, archivos ni terminología interna) y solo cambios que le aporten valor.
- Secciones: `### Corregido`, `### Mejorado`, `### Añadido` (solo las que apliquen).
- El texto de la UI va entre comillas tal como se muestra ("Updated", "Updating…").
- Entrada nueva arriba con el formato `## [X.Y.Z] - YYYY-MM-DD`.

## Release

1. Bump de `"version"` en `package.json`.
2. Entrada nueva en `CHANGELOG.md` (ver reglas arriba), con la fecha del día.
3. Verificar: `npx tsc -p ./` y `npx biome check .` sin errores, `npx tsx --test test/*.test.ts` en verde.
4. `npx vsce package --no-dependencies -o build/` → genera `build/safe-extension-updater-X.Y.Z.vsix`.
5. Commit de todo (código + changelog + package.json) y push a `main`. El mensaje usa formato convencional (`fix:`, `feat:`, `chore:`) con la versión al final, ej: `fix: ... (1.2.1)`.
6. La publicación en el marketplace la hace el usuario manualmente (no automatizarla).
