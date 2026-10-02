# Verification — Ruang 0.3

- Ten automated checks passed: the seven filesystem checks below plus furniture avoidance, blocked destinations and reachable desk locations.
- Browser rendering verified that all eight local atlases load, the scene renders with transparent characters, and Ruang branding is visible.
- Selected Claude, turned wandering off, used Go to desk, then clicked a different floor tile. The interface reported departure and arrival at the selected destination.
- Packaged `release/Ruang/Ruang.exe` with the desktop bridge, all local assets, and existing-profile reuse. The new executable's Computer Use launch approval timed out; native visual verification of this specific release is not complete.
- Prior desktop-release verification below remains useful for the unchanged file editor, but is not a claim that the new native window was inspected.

## Prior release

- Seven automated filesystem tests passed: read/write with original backup, traversal/absolute/secret/size restrictions, stale-content conflicts, changed-folder conflicts, junction exclusion, binary/invalid UTF-8 rejection, UTF-8 BOM preservation.
- JavaScript syntax checks passed for the desktop main process and desktop interface script.
- Packaged Windows executable launched in a native desktop session. The office and Desktop badge were verified visually.
- Native folder picker selected the supplied sample project. The app listed welcome.md and opened its actual content in the editor.
- The hidden Electron smoke run under the command sandbox failed to load its renderer. Native-session verification succeeded; no renderer sandbox protections were disabled.
- Saving and backup behavior were tested at the filesystem layer. The complete native confirmation/save interaction was not exercised through the UI.

This is an unsigned portable development build. Real model execution, AI-authored edits, terminal tools and an installer are not part of this milestone.


## Revision 0.4
13 automated checks passed. Browser task-priority/completion and skin validation/apply/persistence/reset verified. Native launch of the new package remains unverified. See RUANG-README.md for remaining features and simulation limitations.


## Revision 0.5
24 tests passed. All three connection adapters tested with mocked providers. Settings preview checked in browser. Native smoke failed with renderer launch-failed exitCode 49 in sandbox. No live credentials used or claimed verified. See README.md.

Packaged native launch through Windows UI automation timed out and exposed no Ruang window. Latest native launch remains unverified.


## Revision 0.6
31 tests passed. Browser editing, tabs, search, dirty protection and highlighted diff confirmed. Source native smoke passed outside shell sandbox, including Monaco TypeScript worker. See README.md for limitations.

Packaged Ruang 0.6 verification also passed, including legacy workspace migration, all three connection controls, Monaco and its TypeScript worker.
