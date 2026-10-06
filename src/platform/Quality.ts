import { SaveManager } from '@/core/SaveManager';
import { Device } from './Device';

/** Visual budget preset. Only ever reduces visuals; gameplay numbers are identical on every device. */
export const Quality = {
  /** Mobile preset: auto on touch devices, or forced via settings. */
  mobile(): boolean {
    const q = SaveManager.settings.quality;
    return q === 'low' || (q === 'auto' && Device.isTouch());
  },
  /** Reduced-effects path (particles, flashes, weather): user toggle or mobile preset. */
  reduced(): boolean {
    return SaveManager.settings.reducedEffects || this.mobile();
  },
  particleBudget(base: number): number {
    return this.mobile() ? Math.round(base * 0.5) : base;
  },
};
