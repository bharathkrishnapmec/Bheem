import { EventBus, GameEvents } from './GameEvents';
import type { DistrictId, StatusId, WeaponId } from './types';
import type { UpgradeId } from '@/config/balance';

export interface StoreState {
  hp: number;
  maxHp: number;
  prana: number;
  maxPrana: number;
  ammo: number;
  maxAmmo: number;
  weapon: WeaponId;
  statusEffects: StatusId[];
  rally: number;
  maxRally: number;
  summonCost: number;
  coins: number;
  rescued: number;
  totalCaptives: number;
  districtId: DistrictId;
  objectiveText: string;
  upgrades: Record<UpgradeId, number>;
  checkpointId: string;
  bossHp: number;
  bossMax: number;
  bossPhase: 1 | 2 | 3;
  deaths: number;
  playtimeMs: number;
  kills: number;
  squadActive: boolean;
}

export function defaultStoreState(): StoreState {
  return {
    hp: 100,
    maxHp: 100,
    prana: 100,
    maxPrana: 100,
    ammo: 30,
    maxAmmo: 30,
    weapon: 'sword',
    statusEffects: [],
    rally: 0,
    maxRally: 100,
    summonCost: 60,
    coins: 0,
    rescued: 0,
    totalCaptives: 12,
    districtId: 'gate',
    objectiveText: '',
    upgrades: { might: 0, vitality: 0, quiver: 0, prana: 0, rally: 0 },
    checkpointId: '',
    bossHp: 0,
    bossMax: 0,
    bossPhase: 1,
    deaths: 0,
    playtimeMs: 0,
    kills: 0,
    squadActive: false,
  };
}

type Dirty = 'hp' | 'prana' | 'ammo' | 'weapon' | 'status' | 'rally' | 'coins' | 'rescue' | 'boss';

/**
 * Single source of truth for HUD-relevant state. Mutations mark channels dirty; `flush()` (end of frame)
 * emits the matching events so the UI updates at most once per frame per channel.
 */
export class Store {
  state: StoreState = defaultStoreState();
  private dirty = new Set<Dirty>();
  private hpDelta = 0;
  private coinDelta = 0;

  constructor(private bus: EventBus) {}

  reset(partial: Partial<StoreState> = {}): void {
    this.state = { ...defaultStoreState(), ...partial };
    this.markAll();
  }

  markAll(): void {
    (['hp', 'prana', 'ammo', 'weapon', 'status', 'rally', 'coins', 'rescue'] as Dirty[]).forEach((d) => this.dirty.add(d));
  }

  setHp(hp: number, max = this.state.maxHp): void {
    const clamped = Math.max(0, Math.min(max, hp));
    if (clamped === this.state.hp && max === this.state.maxHp) return;
    this.hpDelta += clamped - this.state.hp;
    this.state.hp = clamped;
    this.state.maxHp = max;
    this.dirty.add('hp');
  }

  setPrana(prana: number, max = this.state.maxPrana): void {
    const clamped = Math.max(0, Math.min(max, prana));
    if (Math.floor(clamped) === Math.floor(this.state.prana) && max === this.state.maxPrana) {
      this.state.prana = clamped;
      return;
    }
    this.state.prana = clamped;
    this.state.maxPrana = max;
    this.dirty.add('prana');
  }

  setAmmo(ammo: number, max = this.state.maxAmmo): void {
    if (ammo === this.state.ammo && max === this.state.maxAmmo) return;
    this.state.ammo = Math.max(0, Math.min(max, ammo));
    this.state.maxAmmo = max;
    this.dirty.add('ammo');
  }

  setWeapon(w: WeaponId): void {
    if (w === this.state.weapon) return;
    this.state.weapon = w;
    this.dirty.add('weapon');
  }

  setStatuses(list: StatusId[]): void {
    const cur = this.state.statusEffects;
    if (cur.length === list.length && cur.every((s, i) => s === list[i])) return;
    this.state.statusEffects = [...list];
    this.dirty.add('status');
  }

  setRally(v: number): void {
    const clamped = Math.max(0, Math.min(this.state.maxRally, v));
    if (clamped === this.state.rally) return;
    this.state.rally = clamped;
    this.dirty.add('rally');
  }

  addCoins(delta: number): void {
    if (delta === 0) return;
    this.state.coins = Math.max(0, this.state.coins + delta);
    this.coinDelta += delta;
    this.dirty.add('coins');
  }

  setRescued(n: number, total = this.state.totalCaptives): void {
    this.state.rescued = n;
    this.state.totalCaptives = total;
    this.dirty.add('rescue');
  }

  setBoss(hp: number, max: number, phase: 1 | 2 | 3): void {
    this.state.bossHp = hp;
    this.state.bossMax = max;
    this.state.bossPhase = phase;
    this.dirty.add('boss');
  }

  flush(): void {
    if (this.dirty.size === 0) return;
    const s = this.state;
    for (const d of this.dirty) {
      switch (d) {
        case 'hp':
          this.bus.emit('player:hp', { hp: s.hp, max: s.maxHp, delta: this.hpDelta });
          this.hpDelta = 0;
          break;
        case 'prana':
          this.bus.emit('player:prana', { prana: s.prana, max: s.maxPrana });
          break;
        case 'ammo':
          this.bus.emit('player:ammo', { ammo: s.ammo, max: s.maxAmmo });
          break;
        case 'weapon':
          this.bus.emit('player:weapon', { weapon: s.weapon });
          break;
        case 'status':
          this.bus.emit('player:status', { effects: [...s.statusEffects] });
          break;
        case 'rally':
          this.bus.emit('rally:changed', {
            value: s.rally,
            max: s.maxRally,
            ready: s.rally >= s.summonCost,
          });
          break;
        case 'coins':
          this.bus.emit('coins:changed', { coins: s.coins, delta: this.coinDelta });
          this.coinDelta = 0;
          break;
        case 'rescue':
          this.bus.emit('rescue:changed', { rescued: s.rescued, total: s.totalCaptives });
          break;
        case 'boss':
          this.bus.emit('boss:hp', { hp: s.bossHp, max: s.bossMax, phase: s.bossPhase });
          break;
      }
    }
    this.dirty.clear();
  }
}

export const GameStore = new Store(GameEvents);
