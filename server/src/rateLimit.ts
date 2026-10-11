/** Best-effort fixed-window limiter (per Worker isolate). Keys are deviceIds or short-lived IP hashes, never raw IPs. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}
  /** Returns 0 when allowed, otherwise the Retry-After seconds. */
  take(key: string, max: number, windowMs: number): number {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (list.length >= max) return Math.max(1, Math.ceil((list[0]! + windowMs - t) / 1000));
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.hits.clear();
    return 0;
  }
}

/** SHA-256 of ip + hour bucket, truncated: rotates hourly so it can't be kept as an identifier (v2 §A2.1). */
export async function ipHash(ip: string, now: number): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|${Math.floor(now / 3_600_000)}`);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
