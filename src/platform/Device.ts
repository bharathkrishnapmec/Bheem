/** Browser/device helpers. Every call is feature-detected and never throws. */
export const Device = {
  isTouch(): boolean {
    return typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0 || matchMedia?.('(pointer: coarse)').matches);
  },

  isPortrait(): boolean {
    return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
  },

  /** Touch devices only: portrait means "rotate your phone". */
  needsRotate(): boolean {
    return this.isTouch() && this.isPortrait();
  },

  /** Best-effort fullscreen + landscape lock. Resolves regardless of success. */
  async enterFullscreenLandscape(): Promise<void> {
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
    } catch {
      /* not supported (e.g. iPhone Safari) */
    }
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (o?.lock) await o.lock('landscape');
    } catch {
      /* lock fails silently on many browsers */
    }
  },

  vibrate(ms: number): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
    } catch {
      /* iOS has no vibrate */
    }
  },
};
