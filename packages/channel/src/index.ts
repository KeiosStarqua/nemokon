/**
 * MessagingChannel: the one port the agent uses to talk to a person. Real adapters (chat apps,
 * email, ...) live outside this repo or in your own fork; this package ships two local ones.
 */

export interface OutboundText {
  conversationId: string;
  text: string;
}

export interface SentText {
  messageId: string;
}

export interface MessagingChannel {
  sendText(input: OutboundText): Promise<SentText>;
}

/** Keeps every sent message in memory. Use it in tests and in the demo. */
export type EchoChannel = MessagingChannel & {
  readonly sent: readonly (OutboundText & SentText)[];
  clear(): void;
};

export function createEchoChannel(): EchoChannel {
  const sent: (OutboundText & SentText)[] = [];
  let counter = 0;
  return {
    sent,
    async sendText(input) {
      counter += 1;
      const messageId = `echo-${counter}`;
      sent.push({ ...input, messageId });
      return { messageId };
    },
    clear() {
      sent.length = 0;
    },
  };
}

export type StdoutChannelOptions = {
  /** Where lines go. Defaults to `process.stdout.write`. */
  write?: (line: string) => void;
};

/** Prints `[conversationId] text` to stdout. Handy for a CLI. */
export function createStdoutChannel(options: StdoutChannelOptions = {}): MessagingChannel {
  const write = options.write ?? ((line: string) => void process.stdout.write(line));
  let counter = 0;
  return {
    async sendText({ conversationId, text }) {
      counter += 1;
      write(`[${conversationId}] ${text}\n`);
      return { messageId: `stdout-${counter}` };
    },
  };
}
