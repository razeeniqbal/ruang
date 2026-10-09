# Manual tests with a real provider key

Automated tests cover the gateway, streaming, storage and task runner with stand-ins. These checks need the
desktop app and a real key. Use version 0.13.0 or later (F to H need 0.14.0).

## Set up

1. Settings, AI Connections: choose **Use API key** for Claude Code and save your Anthropic key.
2. Click an employee, then **More**, then **Employee details**. Set the provider to **Anthropic** and leave the
   model name empty (uses `claude-opus-5-5`). Save.

## A. Real chat (streaming)

Open the employee's **Chat** tab and send: "Explain JSONB in PostgreSQL in three short bullet points."

Expect: the employee shows **Thinking**; the reply appears progressively in pieces (not all at once); the final
message is correct; the employee returns to **Idle**. One chat usage record is added (`state.usage`, kind `chat`).

## B. Real task

Assign: "Write a short comparison of PostgreSQL JSON and JSONB. Include when I should use each."

Expect: the employee walks to a workstation while the request already runs; the window shows **Progress**:
Thinking, then Writing with a growing character count, then Saving the result; the task becomes **Completed**;
the Inbox shows **Ready for review**; **Review output** loads the full answer. A file `artifact-....md` exists in
the data folder's `artifacts` folder (`release/AI Office/data/artifacts` for the installed build).

## C. Failure and Try again

In Employee details set the model name to `not-a-real-model`, then assign another task.

Expect: no output is saved; the task becomes **Failed** with "Anthropic does not recognise that model name.";
the employee shows the error status; the Inbox shows the failure with **Try again**. Clear the model name, press
**Try again**: a second attempt runs on the same task and produces one output.

## D. Long task

Assign something long, for example: "Write a detailed migration guide from JSON to JSONB columns, with examples,
indexing advice and a rollback plan."

Expect: Ruang stays responsive; progress keeps updating; the task is not cut off at 2 minutes (task requests may run
up to 20 minutes, and fail only if the model sends nothing for 4 minutes). **Cancel task** in the employee window
stops it: the task becomes **Cancelled** and no output is saved.

## E. Restart

Complete a task, close Ruang, open it again. Expect: the task is still **Completed**, the Inbox item still opens the
full output (read from the file), and activity and usage are still there. A task that was running when Ruang closed
shows as **Failed** with "Ruang closed while this task was running", and can be tried again.

## F. Task with approved files (0.14)

Open a project folder under **Files** that has two small CSV files. Assign Aisha: "Analyse these production files.
Compare the months." Under **Files for this task**, choose both CSVs.

Expect: a native dialog lists exactly the two files with their sizes, Anthropic and the model. **Cancel task**
cancels it (nothing is sent). Assign again and choose **Send files**: the employee shows **Reading files**, then
Thinking and Writing. The Inbox shows **Ready for review**; the review shows "Created by Aisha", the model,
"2 context files", "1 model call" and the files used. **View run** shows the context, any tools used, usage and a
timeline with "Context approved: 2 files", "Read ...", "Model request started" and "Task completed".

## G. Ask before reading

In Employee details set **Reading files you choose for a task** to **Ask me**, then repeat F with a large file
(over 200 KB) plus a small one. If the model asks to read the large file, the employee shows **Needs approval**
and the Inbox has an approval. Approve: the task continues and completes. Set the option to **Not allowed**: the
assign dialog says the employee cannot read files, and a task with files fails without any dialog.

## H. Cancel and interrupted runs

Cancel a running task with files: it becomes **Cancelled**, no output appears, and **View run** ends with the
cancellation. Close Ruang while a task is running and reopen: the task is **Failed** (interrupted) and its run
shows "Ruang closed while this run was in progress."
