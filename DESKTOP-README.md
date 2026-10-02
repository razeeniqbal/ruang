# AI Office Desktop — Windows prototype 0.2

## Launch

Double-click **Start AI Office.cmd**, or run **release/AI Office/AI Office.exe**. Keep the entire release folder together: the executable needs its adjacent runtime files. The packaged app does not need Node.js, a web browser or a local web server. This is an unsigned development build, not an installer.

## Work with local files

1. Open **Files**, then **Choose folder**.
2. Select a project folder. Browse its subfolders and open a supported text file.
3. Edit the content and select **Review changes** to compare the current file and your draft.
4. Select **Save to disk**, then approve the native confirmation.

Each save backs up the original under `.ai-office-backups` inside the selected folder. If another editor changed the file, the app refuses the stale save. Reopen the file to load the current version. Backups can be restored manually by copying their content back to the original file.

Supported files: UTF-8 text, Markdown, JSON, CSV/TSV, JavaScript/TypeScript, HTML/CSS, Python, YAML, TOML, XML, SQL, logs and INI; maximum 1 MB. Word/PDF/image previews are not implemented. Symbolic links, junctions, hard-linked files, `.env*`, `.git`, `node_modules` and selected secret directories are excluded. This is a bounded file editor, not a sandbox for executing untrusted code. Concurrent external filesystem changes cannot be eliminated completely.

## What works

- Standalone Windows desktop window, using Electron.
- Native folder selection; local file browsing, editing, review and backup.
- Office dashboard, employee preferences, projects, simulated workflow, approvals and downloadable demo reports.
- App state persists in Chromium storage under the `data` folder beside the packaged executable. The chosen project folder is remembered in `data/folder.json`. Keep the app in a writable location.
- No remote fonts or web content are loaded; this prototype can run offline.

## What remains simulated

AI agents do not call providers, research, generate edits, run terminal commands or use Git. The editor changes are authored by you. Agent workflows and reports remain explicitly labelled demos. The pixel office is the supplied concept artwork with interactive status overlays, not separate animated sprites. Browser-prototype data is not automatically imported into this separate desktop profile.

## Development

Install Node.js, then run `npm ci` and `npm start`. If package lifecycle scripts are disabled, run `node node_modules/electron/install.js` after dependency installation. Run `npm test` for filesystem checks. `npm run package` creates a fresh portable Windows release folder; it refuses to overwrite an existing release.

Electron loads local assets with a sandboxed renderer, context isolation, no renderer Node access, a narrow validated IPC bridge, blocked navigation/new windows and denied browser permissions. Native save confirmation is enforced in the main process. No arbitrary shell or unrestricted filesystem API is exposed to the UI.

Next milestone: real model execution with protected credentials, persistent task orchestration and isolated tools. No API credentials are requested or stored by this version.
