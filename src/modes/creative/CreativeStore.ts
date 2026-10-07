const KEY = 'bheem.creative.v1';

interface CreativeData {
  bestTimes: Record<string, number>;
}

function read(): CreativeData {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CreativeData>;
    return { bestTimes: d.bestTimes && typeof d.bestTimes === 'object' ? d.bestTimes : {} };
  } catch {
    return { bestTimes: {} };
  }
}

/** Creative-only records, stored apart from Story progress (`bheem.save.v1`). */
export const CreativeStore = {
  bestTime(id: string): number | null {
    return read().bestTimes[id] ?? null;
  },
  recordTime(id: string, ms: number): boolean {
    const d = read();
    const prev = d.bestTimes[id];
    if (prev !== undefined && prev <= ms) return false;
    d.bestTimes[id] = ms;
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable */
    }
    return true;
  },
};
