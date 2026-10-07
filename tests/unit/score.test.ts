import { beforeEach, describe, expect, it } from 'vitest';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { ScoreSystem, pointsForKill } from '@/systems/ScoreSystem';

describe('score (cosmetic, Story only)', () => {
  beforeEach(() => {
    GameStore.state.score = 0;
    GameStore.state.rescued = 0;
  });

  it('uses the brief point table', () => {
    expect([pointsForKill('imp'), pointsForKill('raider'), pointsForKill('boneArcher'), pointsForKill('mireHexer'), pointsForKill('skyCaller'), pointsForKill('brute'), pointsForKill('boss')]).toEqual([10, 30, 40, 50, 80, 150, 1000]);
  });

  it('scores kills, rescues, chests and liberation with the flawless bonus', () => {
    const s = new ScoreSystem(() => ({ x: 0, y: 0 }));
    GameEvents.emit('enemy:killed', { type: 'raider', killType: 'slash', elite: false, x: 0, y: 0 });
    GameEvents.emit('rescue:changed', { rescued: 1, total: 12 });
    GameEvents.emit('chest:opened', { x: 0, y: 0 });
    expect(GameStore.state.score).toBe(30 + 200 + 50);
    GameEvents.emit('district:changed', { id: 'gate', name: 'Gate' });
    GameEvents.emit('district:liberated', { id: 'gate' });
    expect(GameStore.state.score).toBe(280 + 500 + 250);
    GameEvents.emit('district:changed', { id: 'market', name: 'Market' });
    GameEvents.emit('player:hurt', { amount: 5 });
    GameEvents.emit('district:liberated', { id: 'market' });
    expect(GameStore.state.score).toBe(1030 + 500);
    s.destroy();
    GameEvents.emit('enemy:killed', { type: 'brute', killType: 'slash', elite: false, x: 0, y: 0 });
    expect(GameStore.state.score).toBe(1530);
  });

  it('does nothing when disabled (Creative)', () => {
    const s = new ScoreSystem(() => ({ x: 0, y: 0 }), false);
    GameEvents.emit('enemy:killed', { type: 'imp', killType: 'slash', elite: false, x: 0, y: 0 });
    expect(GameStore.state.score).toBe(0);
    s.destroy();
  });
});
