# RUANG AI harness (0.14)

The harness is the controlled runtime between an **employee** and the **model, context, tools and outputs**.
It is small and RUANG-native: no agent framework. It runs in the Electron main process (`desktop/harness/`), so
the page cannot read files, run tools, skip a permission check or see provider keys.

```
TASK -> EMPLOYEE -> HARNESS -> MODEL GATEWAY -> PROVIDER
                     ├ context-builder.cjs  sections: system policy, employee instructions, constraints, approved context, project, task
                     ├ policy.cjs           ALLOW / ASK / DENY (core.js rules); employee frozen at run start
                     ├ tool-registry.cjs    register / get / listAllowed / execute; execute re-checks permission
                     ├ tools/read-context-file.cjs   the only tool: approved files only
                     ├ harness.cjs          execution controller: bounded loop, approvals, fallback, artifact collection
                     ├ limits.cjs           turns, tool calls, repeats, runtime, context and output size (tighten only)
                     ├ approvals.cjs        pause / resume on an Inbox decision
                     ├ trace.cjs            observable events only, never model text or reasoning
                     └ run-store.cjs        data/runs/run-*.json; finished runs are final
```

## A run

`Harness.execute({task, employee, project, context, attempt}, {signal, onEvent})` creates a run and always
returns `{status, run, usage, artifact?, error?}`. Statuses: `RUNNING`, `NEEDS_APPROVAL`, then `COMPLETED`,
`FAILED`, `CANCELLED` or `BLOCKED`. A retry is a new run; earlier runs stay as they were.

1. Permission check for `readFiles` (DENY stops before anything is shown or read).
2. **Provider disclosure**: a native dialog lists the exact files and the provider/model. Declining cancels the task.
3. The approved files are read through `read_context_file` and placed inside `<approved_context>`.
4. Loop: ask the model. A final answer ends the loop. Structured tool calls are validated, checked against
   permission (ALLOW runs, ASK pauses for an Inbox approval, DENY tells the model the action is unavailable),
   executed and returned as `<tool_result trust="untrusted">`.
5. The output is saved in the artifact store with provenance (employee, task, run, model, files, calls).
   Only then is the run `COMPLETED`.

Events (`run.started`, `context.loading`, `model.started`, `model.delta`, `tool.approval_required`,
`artifact.saving`, `run.completed`, ...) drive the task state in `dist/task-runner.js`. The office, Inbox and
employee windows read that state. The detailed trace is shown under **View run**. Activity stays short and readable.

## Invariants (covered by `desktop/harness.test.cjs`)

- A model, project file or tool result cannot grant a permission, add a tool or change a limit.
- An employee cannot read a file that was not approved for the task, whatever path it names.
- The model can only invoke registered tools; tool intent comes from structured calls, never prose.
- Cancellation aborts the model request and tools; a cancelled run never claims an output.
- A task only references an output that was durably saved. A failed run stays failed; Try again starts a new run.
- Runs are bounded: turns, tool calls, identical repeats, runtime and approval waits all stop a run with a reason.

## Not in 0.14

Structured tools are sent only to Anthropic (`supportsTools`); OpenAI and Gemini runs still get the approved
files inline, without tools. Fallback models are used only for provider outages and need `fallbackModel` set on
the employee (no UI yet). Writing files, running code, web and Git tools are later versions.
