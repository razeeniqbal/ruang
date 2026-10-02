# Ruang 0.6 - Code workspace

Open Start Ruang.cmd, choose Code in the sidebar, then Open project folder. Files and Code share the same selected folder.

## Available now
- Expandable folder explorer and multiple file tabs.
- Local Monaco editor with syntax highlighting, line numbers, undo/redo, find and replace, and TypeScript syntax checking. Editor assets and workers are bundled; no CDN is required.
- Ctrl+F to find, Ctrl+H to replace, Ctrl+S to review changes. Review shows original and modified code side by side. Save to disk uses the existing native confirmation and creates an original-file backup.
- Drafts and cursor positions stay in memory while switching tabs or returning to the office. Closing a dirty tab or the app asks before discarding. Folder switching is blocked until unsaved tabs are saved or closed.
- Reload file explicitly discards a draft after confirmation. An externally changed file cannot be overwritten silently.
- The existing file-origin workspace is copied once to the editor's local app origin. Old storage is retained. Existing target-origin state is not overwritten.

## Limits
Supports the same UTF-8 text/code types as Files, up to 1 MB. Unsupported types, symbolic links, secret environment files, Git internals and hard links remain excluded. This is an editor for existing files: file creation/rename/deletion, project-wide search, terminal, debugger, Git UI and VS Code extensions are not implemented. Open tabs/drafts are not restored after restart; save work before closing. Mixed line endings may be normalized by Monaco and are visible during review.

The browser preview uses clearly labelled sample files. Only the desktop app edits real files. AI tasks/chat remain simulated; the editor does not claim that agents are editing files. Provider sign-in still requires user authentication.

## Verification
31 automated checks pass, including draft preservation, stale-file protection, backups, folder changes and asset-path validation. Browser checks confirmed folder expansion, syntax highlighting, multiple tabs, editing, unsaved indicators, find results, diff review and Keep editing on a dirty tab. Source and packaged Electron smoke tests passed, including workspace migration, outside the restricted shell sandbox: office, desktop bridge, all three provider controls, Code explorer, Monaco and its TypeScript worker. No Electron security settings were disabled.

## Development
npm start opens desktop. npm test runs checks. npm run build:editor rebuilds bundled Monaco with esbuild-wasm. npm run package creates release/Ruang-0.6 (refuses overwrite). Monaco's MIT license is included in dist/editor/MONACO-LICENSE.txt.

Keep the full release folder together. Close older Ruang versions before opening this build.

---

# Ruang 0.5 - AI Connections

Open Start Ruang.cmd, then Settings > AI Connections.

## Connect Codex, Claude Code or Gemini
1. If the tool is not detected, expand Setup and sign-in details. Install official tool opens an installer window using the official npm package in Ruang's data folder; Node.js/npm must already be installed. Alternatively use the official setup guide and Locate installed tool.
2. Choose Sign in. The official CLI opens in its own window and handles account authentication. Gemini offers Sign in with Google; use /auth to change an existing account.
3. Return to Ruang and Check sign-in. Codex and Claude Code have supported authentication-status commands. Gemini has no standalone status command: Ruang explicitly leaves its CLI session unverified. Confirm it in Gemini or use an API key for verifiable API access.
4. Choose employee connections below the cards. These preferences are saved for future live task execution.

Ruang uses your official tool's existing login storage. Disconnect from Ruang removes the Ruang link and any API key saved for that provider, but does not log you out of the tool or other apps. CLI sign-in may use subscription or API authentication according to the official tool's settings and environment.

## API-key alternative (all three providers)
Use API key opens a password field. Verify and save requests the provider's model list, then encrypts the key with Windows protection. Keys never enter browser localStorage or workspace exports. No project content or generated prompt is sent by this check. A successful model-list check does not establish model-generation quota, billing credit or model availability for a specific task. Keys cannot be decrypted by simply moving the folder to another Windows account; replace them there.

API connections use OpenAI, Anthropic or Google directly and have separate API billing. OpenAI API access is not itself a Codex CLI connection.

## Current limits
Connection management is implemented; office tasks and chat are still simulated. This release does not dispatch autonomous agents, send files to them, or run their terminal tools. Gemini CLI authentication cannot be automatically verified. User account sign-in and real credentials must be supplied by the user; no live accounts were connected during development.

## Verification
24 automated checks passed (connection security and lifecycle, navigation/capacity and local file handling). The Settings browser preview renders all three providers and clearly requires desktop for connections. API tests use mocked provider responses, not live credentials. Sandboxed Electron smoke testing failed because its renderer could not launch; no security settings were disabled.

## Desktop and data
Run release/Ruang-0.5/Ruang.exe, keeping the entire folder together. Close earlier AI Office/Ruang versions first. An existing release/AI Office/data profile is reused; otherwise the app stores data beside its executable. Connection metadata and encrypted API keys are under ai-connections within that profile. Original art and earlier releases remain unchanged.

Pixel office: native 16px tiles and 16x24 characters, integer zoom, walking, object capacity, task priority, custom skin PNG upload and reset. Files supports UTF-8 text/code editing with confirmation and backups. A full furniture editor and advanced action animations remain future work.

Development: npm start. Tests: npm test. Package: npm run package (refuses to overwrite a release).

## Official references
- Codex authentication: https://developers.openai.com/codex/auth
- Codex CLI: https://developers.openai.com/codex/cli/reference
- Claude Code authentication: https://code.claude.com/docs/en/authentication
- Claude Code commands: https://code.claude.com/docs/en/cli-reference
- Gemini authentication: https://geminicli.com/docs/get-started/authentication/
- API model checks: https://developers.openai.com/api/reference/resources/models/methods/list ; https://platform.claude.com/docs/en/api/models/list ; https://ai.google.dev/api/models
