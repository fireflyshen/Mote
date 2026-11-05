# Mote agent instructions

- Prefer codebase-memory-mcp for code discovery; index this independent repository if needed.
- Keep the app focused on fragmentary notes. Do not add heatmaps or task/finance modules.
- Never overwrite Tessera data. Mote owns its own SQLite database and tables.
- Keep credentials, personal notes, databases, screenshots and build output out of Git.
- Before deploying, run the server/web app typecheck, lint, build and relevant tests.
- Mote is one product: deployed web service, Raycast extension and the floating notepad window bundled with that extension.
- Keep extension connection settings in Raycast. Do not turn the window into a separately installed desktop client.
- Validate floating-notes and raycast-extension with their own checks when changing the plugin.
- Preserve stable submission IDs, failed drafts, version checks and scoped capture tokens.
