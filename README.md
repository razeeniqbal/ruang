# Ruang 0.14.1

Ruang is a local AI workspace with a walking pixel office. You give tasks to AI employees; each employee keeps
its identity while the model behind it can change. The office shows the real state of their work.

Open **Start Ruang.cmd** (runs the packaged build in `release/`, or `npm start` if there is none).

## What works

- **The office is the app**: the pixel office always fills the screen. Inbox, Team, Projects, Tasks, Code, Files,
  Activity and Settings open as pixel windows over it, from the hotbar (keys 1-8) or from places in the room:
  reception opens the Inbox, the meeting-room board Tasks, the whiteboard Projects, the bookshelf Files, the
  development desk Code, the meeting table the Team and the coffee machine Activity. Esc returns to the office.
- **Tasks run on a real model** through the RUANG AI harness: assign a task in the office, watch the employee
  read, think and write, and review the saved output in the Inbox. Cancel, Try again and restart recovery are
  supported. See [docs/HARNESS.md](docs/HARNESS.md).
- **Files for a task (new in 0.14)**: choose files from the open project folder when assigning a task. Before
  anything is read, Ruang lists exactly those files and the model and asks you to confirm. The employee can read
  only those files. Each output records who made it, with which model and files; **View run** shows the full
  timeline.
- **Employee permissions**: under Employee details, reading files can be allowed, set to ask, or not allowed.
  When an employee asks for something that needs approval, the run pauses and the request appears in the Inbox.
- **Chat** with an employee, streamed from the same model gateway.
- **AI Connections** (Settings): save an API key for Anthropic, OpenAI or Google (encrypted with Windows
  protection, never visible to the page), or sign in to Codex, Claude Code or Gemini CLI.
- **Files and Code**: browse and edit UTF-8 text files in the chosen folder with a local Monaco editor. Every
  save is confirmed and backed up in `.ai-office-backups`.

Structured tools are used with Anthropic. OpenAI and Gemini receive the approved files directly, without tools.

## Data

The installed app keeps its data in `release/AI Office/data` when that folder exists, otherwise beside the
executable (`data/` in development): workspace state, encrypted keys (`ai-connections`), outputs (`artifacts`)
and run records (`runs`).

## Fonts

Pixelify Sans and VT323 are bundled in `dist/fonts` under the SIL Open Font License (licence files alongside).

## Development

- `npm start` opens the desktop app; `node server.cjs` serves the web preview on port 4173.
- `npm test` runs the automated checks; `electron . --smoke-test` checks the packaged interface.
- `npm run package` builds `release/Ruang-<version>` (refuses to overwrite).
- `npm run build:editor` rebuilds the bundled Monaco editor.
- Manual checks with a real key: [docs/MANUAL-TESTS.md](docs/MANUAL-TESTS.md).
