# @nemokon/tools

`createNemokonTools({ channel, tasks?, schedules?, notes?, webSearch? })` returns Mastra tools:
`taskCreate`, `taskList`, `taskUpdate`, `taskClose`, `scheduleCreate` (one-shot), `remember`, `forget`, `sendMessage`,
and `webSearch` when a `WebSearchProvider` is given (`createWebSearchProviderFromEnv()` uses `TAVILY_API_KEY`).

Stores are ports (`TaskStore`, `ScheduleStore`, `NoteStore`) with in-memory defaults; implement them over SQLite or Postgres to persist.
Tools read the conversation id from Mastra's request context, so the model cannot address another conversation.
