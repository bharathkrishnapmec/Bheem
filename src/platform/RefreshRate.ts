/** Common panel rates; physics steps at the closest one so bodies move every rendered frame. */
const RATES = [60, 75, 90, 120, 144] as const;

/** Snaps a measured median frame interval (ms) to a display refresh rate; anything unclear stays 60. */
export function snapRefreshHz(medianFrameMs: number): number {
  if (!(medianFrameMs > 0)) return 60;
  const hz = 1000 / medianFrameMs;
  let best = 60;
  for (const r of RATES) if (Math.abs(r - hz) < Math.abs(best - hz)) best = r;
  return Math.abs(best - hz) / best < 0.08 ? best : 60;
}

/**
 * Measures the display refresh rate from requestAnimationFrame intervals. Arcade physics runs a fixed
 * 60 Hz step by default, which on 90/120 Hz screens moves sprites on only some frames (visible judder).
 */
export const RefreshRate = {
  hz: 60,
  start(samples = 90): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    const dts: number[] = [];
    let last = -1;
    const tick = (t: number) => {
      if (last >= 0) dts.push(t - last);
      last = t;
      if (dts.length < samples) requestAnimationFrame(tick);
      else {
        const s = dts.slice(10).sort((a, b) => a - b);
        this.hz = snapRefreshHz(s[Math.floor(s.length / 2)]!);
      }
    };
    requestAnimationFrame(tick);
  },
};
