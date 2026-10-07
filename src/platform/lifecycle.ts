import { STR } from '@/config/strings';
import { GameEvents } from '@/core/GameEvents';
import { AudioManager } from '@/audio/AudioManager';
import { Device } from './Device';

/** Page-level hooks: audio unlock on first gesture, portrait overlay, auto-pause on blur/hidden. */
export function installLifecycle(): void {
  const unlock = () => AudioManager.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const txt = document.getElementById('rotate-text');
  if (txt) txt.textContent = STR.rotate;
  let rotate = false;
  const checkOrientation = () => {
    const need = Device.needsRotate();
    if (need === rotate) return;
    rotate = need;
    document.body.classList.toggle('needs-rotate', need);
    if (need) GameEvents.emit('app:background', { reason: 'portrait' });
  };
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 50));
  screen.orientation?.addEventListener?.('change', checkOrientation);
  checkOrientation();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) GameEvents.emit('app:background', { reason: 'hidden' });
  });
  window.addEventListener('blur', () => GameEvents.emit('app:background', { reason: 'blur' }));
}
