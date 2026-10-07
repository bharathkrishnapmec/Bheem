import { describe, expect, it } from 'vitest';
import { TouchInput, TOUCH, clapDistanceFromDrag } from '@/input/TouchInput';
import { FpsMonitor } from '@/core/FpsMonitor';

describe('touch input mapping', () => {
  it('maps joystick displacement to analog moveX with dead zone and radius clamp', () => {
    const t = new TouchInput();
    t.down(1, 'stick', 100, 200);
    t.move(1, 100 + TOUCH.stickRadius * 0.1, 200);
    expect(t.stick()!.x).toBe(0);
    t.move(1, 100 + TOUCH.stickRadius * 0.5, 200);
    expect(t.stick()!.x).toBeCloseTo(0.5);
    t.move(1, 100 - TOUCH.stickRadius * 3, 200);
    expect(t.stick()!.x).toBeCloseTo(-1);
    expect(t.stick()!.knobX).toBeCloseTo(-TOUCH.stickRadius);
    t.move(1, 100, 200 + TOUCH.stickRadius);
    expect(t.stick()!.y).toBeCloseTo(1);
    t.up(1);
    expect(t.stick()).toBeNull();
  });

  it('maps drag-from-attack to an aim angle and strength', () => {
    const t = new TouchInput();
    t.down(7, 'attack', 500, 300);
    t.move(7, 500, 300 - 40);
    const a = t.aim()!;
    expect(a.angle).toBeCloseTo(-Math.PI / 2);
    expect(a.frac).toBeCloseTo(40 / TOUCH.aimMaxDrag);
    t.move(7, 500 - 200, 300);
    expect(t.aim()!.angle).toBeCloseTo(Math.PI);
    expect(t.aim()!.frac).toBe(1);
    expect(clapDistanceFromDrag(1)).toBe(480);
    expect(clapDistanceFromDrag(0.5)).toBe(240);
  });

  it('falls back to auto-aim (null angle) under the minimum drag', () => {
    const t = new TouchInput();
    t.down(3, 'attack', 10, 10);
    t.move(3, 10 + TOUCH.aimMinDrag - 1, 10);
    expect(t.aim()!.angle).toBeNull();
  });

  it('keeps simultaneous pointers independent', () => {
    const t = new TouchInput();
    t.down(1, 'stick', 50, 300);
    t.down(2, 'attack', 800, 300);
    t.down(3, 'jump', 700, 320);
    t.move(1, 50 + TOUCH.stickRadius, 300);
    t.move(2, 800, 250);
    expect(t.stick()!.x).toBeCloseTo(1);
    expect(t.aim()!.angle).toBeCloseTo(-Math.PI / 2);
    expect(t.held('jump')).toBe(true);
    t.up(3);
    expect(t.held('jump')).toBe(false);
    expect(t.held('attack')).toBe(true);
    expect(t.stick()!.x).toBeCloseTo(1);
  });

  it('latches taps shorter than a frame', () => {
    const t = new TouchInput();
    t.down(9, 'dash', 0, 0);
    t.up(9);
    expect(t.held('dash')).toBe(false);
    expect(t.takePressed('dash')).toBe(true);
    expect(t.takePressed('dash')).toBe(false);
  });
});

describe('fps monitor', () => {
  it('fires once after 3s under 45 fps', () => {
    const m = new FpsMonitor();
    let fired = 0;
    for (let i = 0; i < 300; i++) if (m.update(16.7)) fired++;
    expect(fired).toBe(0);
    for (let i = 0; i < 200; i++) if (m.update(33)) fired++;
    expect(fired).toBe(1);
  });
});
