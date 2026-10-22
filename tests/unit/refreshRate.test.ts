import { describe, expect, it } from 'vitest';
import { snapRefreshHz } from '@/platform/RefreshRate';

describe('snapRefreshHz', () => {
  it('snaps measured frame intervals to common panel rates', () => {
    expect(snapRefreshHz(16.67)).toBe(60);
    expect(snapRefreshHz(11.1)).toBe(90);
    expect(snapRefreshHz(8.33)).toBe(120);
    expect(snapRefreshHz(6.94)).toBe(144);
  });
  it('falls back to 60 for throttled or odd timings', () => {
    expect(snapRefreshHz(33.3)).toBe(60);
    expect(snapRefreshHz(0)).toBe(60);
    expect(snapRefreshHz(Number.NaN)).toBe(60);
    expect(snapRefreshHz(9.8)).toBe(60);
  });
});
