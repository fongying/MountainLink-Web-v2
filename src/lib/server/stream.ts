import { randomUUID } from 'node:crypto';

type SendRaw = (chunk: string) => void;

type SseClient = {
  id: string;
  send: (event: string, data: unknown) => void;
  comment: (text: string) => void;
};

const clients = new Map<string, SseClient>();

export function registerSseClient(sendRaw: SendRaw): SseClient {
  const id = randomUUID();

  const client: SseClient = {
    id,
    send(event: string, data: unknown) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      sendRaw(payload);
    },
    comment(text: string) {
      sendRaw(`: ${text}\n\n`);
    }
  };

  clients.set(id, client);
  return client;
}

export function unregisterSseClient(id: string) {
  clients.delete(id);
}

export function broadcastSse(event: string, data: unknown) {
  for (const client of clients.values()) {
    try {
      client.send(event, data);
    } catch {
      clients.delete(client.id);
    }
  }
}

export function getSseClientCount() {
  return clients.size;
}
