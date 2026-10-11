import { balance } from '@/config/balance';
import type { RunResult, RunTicket, SubmitOutcome } from '@/shared/types';
import type { KV } from './LocalProvider';

export interface QueuedSubmit {
  ticket: RunTicket;
  result: RunResult;
  name: string;
  queuedAt: number;
}
const KEY = 'bheem.lb.queue.v1';

/** Offline submissions (v2 §A3.3): max 20, oldest first, dropped after 24 h or once the token expires. */
export class SubmitQueue {
  constructor(
    private kv: KV,
    private now: () => number = Date.now,
  ) {}
  items(): QueuedSubmit[] {
    let list: QueuedSubmit[] = [];
    try {
      list = JSON.parse(this.kv.getItem(KEY) ?? '[]') as QueuedSubmit[];
    } catch {
      list = [];
    }
    const t = this.now();
    return list.filter((q) => t - q.queuedAt < balance.trials.queueTtlMs && t < q.ticket.expiresAt);
  }
  private save(list: QueuedSubmit[]): void {
    this.kv.setItem(KEY, JSON.stringify(list.slice(-balance.trials.queueMax)));
  }
  push(ticket: RunTicket, result: RunResult, name: string): void {
    this.save([...this.items(), { ticket, result, name, queuedAt: this.now() }]);
  }
  /** Sends in order; stops at the first network failure and keeps the rest. */
  async flush(send: (q: QueuedSubmit) => Promise<SubmitOutcome>): Promise<SubmitOutcome[]> {
    const list = this.items();
    const done: SubmitOutcome[] = [];
    while (list.length) {
      try {
        done.push(await send(list[0]!));
        list.shift();
      } catch {
        break;
      }
    }
    this.save(list);
    return done;
  }
}
