# Ruang V2 audit and migration path

Written 2026-10-02 against version 0.10.2, before any V2 domain work.

## Current stack

- **Desktop:** Electron 44 (`desktop/main.cjs`), context isolation and sandbox on, a `ruang://app` protocol serving `dist/`. Preload exposes a frozen `window.desktop` bridge (files and connections).
- **Renderer:** plain browser JavaScript, no framework and no bundler. Each file in `dist/` is a script that adds to shared globals (`state`, `render`, `bodyView`, `persist`, `log`, `esc`, `badge`) and wraps `render` or `bodyView` to add its own view. Monaco is bundled once by `npm run build:editor`.
- **Web:** `server.cjs` serves `dist/` on `127.0.0.1:4173`. Same code; desktop-only features detect that `window.desktop` is missing.
- **Tests:** `node --test` over `desktop/*.test.cjs` (32 tests): workspace file safety, connections, code documents, office engine.
- **Assets:** `tools/build-v2-assets.py` cuts the office backdrop, cast sprites, status icons and logo from `design/v2` into `dist/v2`.

## Application structure

| File | Role |
|---|---|
| `dist/app.js` | Base app: state, sidebar, views (Employees, Projects, Tasks, Files, Activity, Settings), demo project runner, approval dialog |
| `dist/room-v4.js` | Office page: renderer loop, actors, task-driven movement, status icons, floating windows, panels, dock |
| `dist/office-layout.js` | Data-driven office map: collision rectangles, interaction objects with seats (`slots`, facing, offsets, sitting) |
| `dist/office-engine.js` | Walkability, breadth-first pathfinding, seat reservation and occupancy |
| `dist/v2-sprites.js`, `dist/skins.js` | V2 sprite and icon drawing; custom skin upload, validation and fallback |
| `dist/desktop.js`, `dist/code-workspace.js` | Real local file browsing and the Monaco code editor (desktop) |
| `dist/connections.js` + `desktop/connections.cjs` | Codex, Claude Code and Gemini sign-in, plus provider keys encrypted with Windows protection; key check only, no generation |
| `dist/room.js`, `dist/navigation.js`, `dist/pixel-assets.js` (characters) | V1 office code, no longer loaded by `index.html` except `pixel-assets.js` |

## State and persistence

- One object `state`, saved whole to `localStorage['ai-office-v1']` by `persist()`, called from many places.
- Shape: `agents[]` (name, role, provider, initial; no ids), `projects[]` (each with six fixed demo `tasks[]`, `status`, `step`, `output`), `events[]` (text only), `officeTasks[]` (direct demo tasks), `officeChat{}`, `officeWindows[]`, `agentAppearance{}`, `agentConnections{}`.
- Agents are referenced **by array index** everywhere. Tasks have two separate shapes (project tasks and office tasks). Approvals exist only as a project status plus a modal dialog.
- Desktop data profile: `release/AI Office/data` (Electron storage, encrypted keys, chosen folder).

## What works and must be preserved

Office rendering with V2 art, seated poses and pathfinding; floating windows; custom skins; the demo project run with approval; real local file editing with backups and conflict checks; provider sign-in and encrypted keys; workspace export and reset.

## Technical risks

1. **Index-based agent references:** deleting or reordering employees would corrupt tasks. V2 needs stable ids.
2. **Scattered persistence:** `persist()` is called from many modules with no schema version or migration.
3. **Two task models** and no approval object, so office, inbox and dialogs cannot share one truth.
4. **No model generation path:** chat is scripted. Keys live encrypted in the main process, which is correct for desktop, but there is no gateway.
5. **Global script coupling:** every module patches `render`. Workable, but new modules must follow the same pattern carefully.
6. **Dead V1 code** (`room.js`, `navigation.js`) still ships.

## Migration path (incremental, no framework change)

1. **Core domain module** (`dist/core.js`, also loadable in Node for tests): schema version 2, a migration that adds stable agent ids, the agent model (role, model, autonomy, permissions, appearance kept separate), first-class tasks, approvals, artifacts and activity records, while **keeping every V1 field** so existing views keep working.
2. **Task and approval state machines** with tests; status derivation for agents (task, approval and error states feed the office).
3. **Inbox** view and nav entry, fed by approvals, failed or blocked tasks and completed work to review. The demo project's approval becomes a real approval object.
4. **Office mapping** from the derived agent status (not from ad hoc checks); employee window gains an Activity tab.
5. **Model gateway** in the desktop main process using the already-encrypted keys; chat goes through it when an employee has a connected model, with the scripted reply as fallback.
6. **Command palette** (Ctrl or Command with K).
7. **Web foundation:** web app manifest, service worker for an offline shell, WebP office backdrop.
8. **Touch:** pan and pinch zoom on the office.

Later milestones (agent builder, permissions interface, cloud persistence and a web model server, shared workspaces) build on these without another rewrite.
