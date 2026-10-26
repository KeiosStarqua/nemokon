# @nemokon/memory

Mastra memory on libSQL. `createConversationMemoryStorage({ libsqlUrl })` returns a `LibSQLStore`
(default `file:./mastra.db`, `:memory:` for tests); `createConversationMemory()` wraps it in a Mastra `Memory`.
