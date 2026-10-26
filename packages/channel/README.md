# @nemokon/channel

`MessagingChannel` port (`sendText({conversationId,text}) -> {messageId}`) with two local adapters:
`createEchoChannel()` (records messages in memory, for tests) and `createStdoutChannel()` (prints them).
Write your own adapter for a real chat app.
