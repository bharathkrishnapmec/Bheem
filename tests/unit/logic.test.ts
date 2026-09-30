import { describe, expect, it } from 'vitest';
import { balance } from '@/config/balance';
import { RNG } from '@/core/RNG';
import { Cooldown } from '@/core/Cooldown';
import { TimeControllerCore } from '@/core/TimeController';
import { SaveManagerCore, MemoryStorage, defaultSave } from '@/core/SaveManager';
import { computeFinalDamage, clampArmor, killTypeFor, bowShot, chainDamage, coinLossOnDeath } from '@/logic/damage';
import { nextDistrictState, bannerIsVulnerable } from '@/logic/district';
import { upgradeCost, canPurchase, derivedPlayerStats } from '@/logic/economy';
import { splitCoins, rollDrops } from '@/logic/loot';
import { squadComposition, summonDenial, addRally, rallyForKill } from '@/logic/summon';
import { phaseForHp, chooseBossAttack, darkRainColumns, shouldDesperation, bossDamageMultiplier } from '@/logic/boss';
import { StatusEffectSystem, type StatusTarget } from '@/systems/StatusEffectSystem';
import { pickTarget } from '@/systems/TargetingSystem';
import { AttackTokenSystem } from '@/systems/AttackTokenSystem';
import { validateLevel } from '@/level/levelSchema';
import { checkReachability } from '@/level/reachability';
import raw from '@/level/village.level.json';

describe('damage & armor', () => {
  it('applies armor and multipliers', () => {
    expect(computeFinalDamage(100, 1, 0.25)).toBe(75);
    expect(computeFinalDamage(10, 2, 0)).toBe(20);
  });
  it('clamps armor and floors to min damage', () => {
    expect(clampArmor(5)).toBe(balance.combat.armorMax);
    expect(clampArmor(-1)).toBe(0);
    expect(computeFinalDamage(0.1, 1, 0.9)).toBe(balance.combat.minDamage);
  });
  it('selects kill types', () => {
    expect(killTypeFor('melee')).toBe('slash');
    expect(killTypeFor('arrow')).toBe('arrow');
    expect(killTypeFor('lightning')).toBe('lightning');
    expect(killTypeFor('crush')).toBe('crush');
    expect(killTypeFor('melee', { byAlly: true })).toBe('generic');
  });
  it('bow charge scales damage', () => {
    expect(bowShot(0).damage).toBeLessThan(bowShot(10_000).damage);
    expect(bowShot(10_000).damage).toBe(balance.weapons.bow.full.damage);
  });
  it('chain falloff and coin loss', () => {
    expect(chainDamage(20, 0)).toBe(20);
    expect(chainDamage(20, 1)).toBeLessThan(20);
    expect(coinLossOnDeath(100)).toBe(Math.floor(100 * balance.economy.deathCoinLoss));
  });
});

describe('status effects', () => {
  const mk = (): StatusTarget => ({ statuses: new Map() });
  it('applies, slows and expires', () => {
    const t = mk();
    expect(StatusEffectSystem.apply(t, { id: 'slow', durationMs: 500, sourceId: 1 })).toBe(true);
    expect(StatusEffectSystem.has(t, 'slow')).toBe(true);
    expect(StatusEffectSystem.speedMultiplier(t)).toBeLessThan(1);
    StatusEffectSystem.tick(t, 600);
    expect(StatusEffectSystem.has(t, 'slow')).toBe(false);
    expect(StatusEffectSystem.speedMultiplier(t)).toBe(1);
  });
  it('removes by source (hexer death cleanses slow)', () => {
    const t = mk();
    StatusEffectSystem.apply(t, { id: 'slow', durationMs: 5000, sourceId: 7 });
    expect(StatusEffectSystem.removeBySource(t, 7)).toBe(true);
    expect(StatusEffectSystem.has(t, 'slow')).toBe(false);
  });
  it('stun-immune targets ignore knockdown', () => {
    const t: StatusTarget = { statuses: new Map(), stunImmune: true };
    StatusEffectSystem.apply(t, { id: 'knockdown', durationMs: 500, sourceId: 1 });
    expect(StatusEffectSystem.has(t, 'knockdown')).toBe(false);
  });
});

describe('cooldowns', () => {
  it('counts down', () => {
    const c = new Cooldown();
    c.start(100);
    expect(c.ready).toBe(false);
    c.tick(60);
    expect(c.ready).toBe(false);
    c.tick(60);
    expect(c.ready).toBe(true);
  });
});

describe('rally & summon', () => {
  it('gates summons', () => {
    expect(summonDenial(0, 0, false)).toBe('rally');
    expect(summonDenial(100, 1000, false)).toBe('cooldown');
    expect(summonDenial(100, 0, true)).toBe('active');
    expect(summonDenial(balance.rally.summonCost, 0, false)).toBeNull();
  });
  it('clamps rally and grows squads with rescues', () => {
    expect(addRally(balance.rally.max - 1, 50)).toBe(balance.rally.max);
    expect(addRally(5, -50)).toBe(0);
    expect(rallyForKill(true, 0)).toBeGreaterThan(rallyForKill(false, 0));
    const a = squadComposition(0);
    const b = squadComposition(12);
    expect(b.captain + b.shieldbearer).toBeGreaterThan(a.captain + a.shieldbearer);
    expect(b.durationMs).toBeGreaterThanOrEqual(a.durationMs);
  });
});

describe('targeting & tokens', () => {
  it('prefers weighted targets', () => {
    const hero = { x: 100, y: 0, targetWeight: 2, isAlive: () => true };
    const ally = { x: 80, y: 0, targetWeight: 1, isAlive: () => true };
    expect(pickTarget(0, 0, [hero, ally])).toBe(hero);
    expect(pickTarget(0, 0, [hero, ally], 90)).toBe(ally);
    expect(pickTarget(0, 0, [{ ...hero, isAlive: () => false }])).toBeNull();
  });
  it('caps attack tokens', () => {
    const t = new AttackTokenSystem();
    expect(t.request(1)).toBe(true);
    expect(t.request(2)).toBe(true);
    expect(t.request(3)).toBe(balance.enemyAI.meleeTokens >= 3);
    t.release(1);
    expect(t.request(3)).toBe(true);
    t.setBossMode(true);
    expect(t.capacity).toBe(balance.enemyAI.bossTokens);
  });
});

describe('districts', () => {
  it('follows the liberation chain', () => {
    let s = nextDistrictState('occupied', 'enter');
    expect(s).toBe('combat');
    expect(nextDistrictState(s, 'bannerDestroyed')).toBe('combat');
    s = nextDistrictState(nextDistrictState(s, 'wavesCleared'), 'shieldDown');
    expect(bannerIsVulnerable(s)).toBe(true);
    expect(nextDistrictState(s, 'bannerDestroyed')).toBe('liberated');
    expect(nextDistrictState('occupied', 'restoreLiberated')).toBe('liberated');
  });
});

describe('economy & loot', () => {
  it('upgrade costs and caps', () => {
    const c = upgradeCost('might', 0)!;
    expect(c).toBeGreaterThan(0);
    expect(canPurchase('might', 0, c)).toBe(true);
    expect(canPurchase('might', 0, c - 1)).toBe(false);
    expect(upgradeCost('might', balance.economy.upgrades.might.tiers)).toBeNull();
    expect(derivedPlayerStats({ might: 0, vitality: 1, quiver: 0, prana: 0, rally: 0 }).maxHp).toBeGreaterThan(balance.player.maxHp);
  });
  it('splits coins and rolls drops deterministically', () => {
    const s = splitCoins(23);
    expect(s.reduce((n, d) => n + d.value, 0)).toBe(23);
    expect(s.every((d) => d.value <= balance.drops.coinValueCap)).toBe(true);
    const a = rollDrops(new RNG(5), 10, false, 0.5);
    const b = rollDrops(new RNG(5), 10, false, 0.5);
    expect(a).toEqual(b);
  });
});

describe('boss', () => {
  it('phases by hp', () => {
    expect(phaseForHp(900, 900)).toBe(1);
    expect(phaseForHp(900 * 0.6, 900)).toBe(2);
    expect(phaseForHp(900 * 0.2, 900)).toBe(3);
  });
  it('never repeats an attack and keeps a safe column', () => {
    const r = new RNG(3);
    let last = chooseBossAttack(1, null, r);
    for (let i = 0; i < 50; i++) {
      const n = chooseBossAttack(2, last, r);
      expect(n).not.toBe(last);
      last = n;
    }
    const { safe, columns } = darkRainColumns(r);
    expect(columns).not.toContain(safe);
    expect(columns.length).toBe(balance.boss.attacks.darkRain.columns - 1);
    expect(shouldDesperation(100, 900, false)).toBe(true);
    expect(shouldDesperation(100, 900, true)).toBe(false);
    expect(bossDamageMultiplier(balance.boss.shieldMinions, false)).toBeLessThan(1);
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new RNG(42);
    const b = new RNG(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    const r = new RNG(1);
    for (let i = 0; i < 100; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('time controller', () => {
  it('resolves by priority and expires', () => {
    let now = 0;
    const tc = new TimeControllerCore(() => now);
    tc.slowMo(0.5, 1000, 20);
    tc.hitStop(50, 10);
    expect(tc.update()).toBe(0.5);
    tc.slowMo(0.2, 100, 30);
    expect(tc.update()).toBe(0.2);
    now = 200;
    expect(tc.update()).toBe(0.5);
    now = 2000;
    expect(tc.update()).toBe(1);
  });
});

describe('save manager', () => {
  it('round-trips progress', () => {
    const st = new MemoryStorage();
    const s = new SaveManagerCore(st, 'k');
    s.load();
    const p = {
      checkpointId: 'shrine_gate',
      districtStates: { gate: 'liberated', market: 'occupied', temple: 'occupied', hall: 'occupied' } as const,
      coins: 42,
      upgrades: { might: 1, vitality: 0, quiver: 0, prana: 0, rally: 0 },
      rescued: ['gate:c0'],
      bannersDestroyed: ['gate'],
      chestsOpened: [],
      deaths: 1,
      playtimeMs: 1000,
      kills: 5,
    };
    s.saveProgress({ ...p, districtStates: { ...p.districtStates } });
    const s2 = new SaveManagerCore(st, 'k');
    expect(s2.load().progress?.coins).toBe(42);
    expect(s2.hasProgress()).toBe(true);
  });
  it('recovers from corrupted saves', () => {
    const st = new MemoryStorage();
    st.setItem('k', '{not json');
    const s = new SaveManagerCore(st, 'k');
    expect(s.load().version).toBe(defaultSave().version);
    expect(s.hasProgress()).toBe(false);
  });
});

describe('level', () => {
  it('validates and is reachable', () => {
    const lvl = validateLevel(raw);
    expect(lvl.districts.map((d) => d.id)).toEqual(['gate', 'market', 'temple', 'hall']);
    expect(checkReachability(lvl).unreachable.length).toBe(0);
    expect(() => validateLevel({})).toThrow();
  });
});
