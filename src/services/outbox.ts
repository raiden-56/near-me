import { outboxStore } from '@/lib/db';
import { uid } from '@/lib/utils';
import type { OutboxItem } from '@/types';

/**
 * Offline queue. Actions taken without a connection are stored here and replayed in order when
 * the browser comes back online. Handlers are registered by the feature that owns the action.
 */

type Handler = (payload: never) => Promise<unknown>;
const handlers = new Map<string, Handler>();
const listeners = new Set<(count: number) => void>();
let flushing = false;

async function notify() {
  const count = (await outboxStore.all()).length;
  listeners.forEach((l) => l(count));
}

export const outbox = {
  register<T>(kind: string, handler: (payload: T) => Promise<unknown>) {
    handlers.set(kind, handler as Handler);
  },

  subscribe(listener: (count: number) => void) {
    listeners.add(listener);
    void notify();
    return () => void listeners.delete(listener);
  },

  async enqueue(kind: string, label: string, payload: unknown): Promise<OutboxItem> {
    const item: OutboxItem = { id: uid('out'), kind, label, payload, createdAt: Date.now() };
    await outboxStore.add(item);
    await notify();
    return item;
  },

  /**
   * Run an action now when online, or queue it when offline.
   * Returns 'done' or 'queued' so the UI can tell the user which happened.
   */
  async run<T>(kind: string, label: string, payload: T): Promise<'done' | 'queued'> {
    const handler = handlers.get(kind);
    if (!handler) throw new Error(`No handler registered for "${kind}"`);
    if (navigator.onLine) {
      await handler(payload as never);
      return 'done';
    }
    await this.enqueue(kind, label, payload);
    return 'queued';
  },

  async flush(): Promise<{ sent: number; failed: number }> {
    if (flushing || !navigator.onLine) return { sent: 0, failed: 0 };
    flushing = true;
    let sent = 0;
    let failed = 0;
    try {
      for (const item of await outboxStore.all()) {
        const handler = handlers.get(item.kind);
        if (!handler) continue;
        try {
          await handler(item.payload as never);
          await outboxStore.remove(item.id);
          sent++;
        } catch (error) {
          // Validation failures will never succeed: drop them. Anything else is retried next time.
          if (error instanceof Error && /limit|validation|invalid|required/i.test(error.message)) await outboxStore.remove(item.id);
          failed++;
        }
      }
    } finally {
      flushing = false;
      await notify();
    }
    return { sent, failed };
  },

  pending: () => outboxStore.all(),
};
