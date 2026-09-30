import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import type { EnemyType } from '@/core/types';
import type { DistrictDef, WaveDef, WaveSpawn } from '@/level/levelSchema';
import { createEnemy } from '@/entities/enemies/types';
import type { Enemy, EnemyOpts } from '@/entities/enemies/Enemy';
import type { World } from '@/game/World';
import { AudioManager } from '@/audio/AudioManager';

type WaveState = 'waiting' | 'active' | 'done';
interface Pending {
  spawn: WaveSpawn;
  wave: WaveDef;
  district: string;
  t: number;
}

/** Data-driven wave spawner with active-enemy cap (§11.3). */
export class SpawnDirector {
  private state = new Map<string, WaveState>();
  private members = new Map<string, Set<Enemy>>();
  private pending: Pending[] = [];
  private live = new Set<string>();
  private waveDistrict = new Map<string, DistrictDef>();

  constructor(private world: World) {
    for (const d of world.level.districts)
      for (const w of d.waves) {
        this.state.set(w.id, 'waiting');
        this.waveDistrict.set(w.id, d);
      }
  }

  startDistrict(d: DistrictDef): void {
    this.live.add(d.id);
    for (const w of d.waves) if (w.trigger === 'onEnter') this.activate(w, d.id);
  }

  /** Skip all waves (district restored as liberated). */
  completeDistrict(d: DistrictDef): void {
    for (const w of d.waves) this.state.set(w.id, 'done');
  }

  private activate(w: WaveDef, district: string): void {
    if (this.state.get(w.id) !== 'waiting') return;
    this.state.set(w.id, 'active');
    this.members.set(w.id, new Set());
    for (const s of w.spawns) this.pending.push({ spawn: s, wave: w, district, t: s.delayMs ?? 0 });
  }

  spawnEnemy(type: EnemyType, x: number, y: number, o: EnemyOpts = {}): Enemy | null {
    const w = this.world;
    const alive = [...w.enemies].filter((e) => e.isAlive()).length;
    if (alive >= balance.world.activeEnemyCap) return null;
    const gy = w.geo.groundBelow(x, y - 40, true, 400) ?? y;
    const e = createEnemy(w, type, x, gy - 1, o);
    w.enemies.add(e);
    if (!e.flying) w.groundGroup.add(e);
    w.fx.burst(x, gy - 30, 10, [PAL.ruinViolet, PAL.ruinGlow, PAL.ichor], { speed: 90, g: -60, life: 500 });
    return e;
  }

  update(dt: number): void {
    const w = this.world;
    // x-triggered waves in live districts
    for (const id of this.live) {
      const d = w.level.districts.find((dd) => dd.id === id)!;
      for (const wave of d.waves) {
        const t = wave.trigger;
        if (typeof t === 'object' && 'x' in t && this.state.get(wave.id) === 'waiting' && w.player.x >= t.x) this.activate(wave, id);
      }
    }
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i]!;
      p.t -= dt;
      if (p.t > 0) continue;
      const e = this.spawnEnemy(p.spawn.type, p.spawn.x, p.spawn.y, { elite: p.spawn.elite, waveId: p.wave.id, required: p.wave.requiredToClear, districtId: p.district, aggro: true });
      if (!e) continue; // cap reached; retry next frame
      if (p.spawn.type === 'brute' || p.spawn.elite) AudioManager.play('roar', { vol: 0.4, pan: w.cam.panFor(p.spawn.x) });
      this.members.get(p.wave.id)?.add(e);
      this.pending.splice(i--, 1);
    }
    for (const [id, st] of this.state) {
      if (st !== 'active') continue;
      if (this.pending.some((p) => p.wave.id === id)) continue;
      const m = this.members.get(id);
      if (m && [...m].some((e) => e.isAlive())) continue;
      this.state.set(id, 'done');
      const d = this.waveDistrict.get(id)!;
      for (const wave of d.waves) {
        const t = wave.trigger;
        if (typeof t === 'object' && 'afterWave' in t && t.afterWave === id) this.activate(wave, d.id);
      }
    }
  }

  districtCleared(d: DistrictDef): boolean {
    return d.waves.filter((w) => w.requiredToClear).every((w) => this.state.get(w.id) === 'done');
  }

  /** Remaining required enemies (alive + queued + not-yet-triggered estimate). */
  remaining(d: DistrictDef): number {
    let n = 0;
    for (const w of d.waves) {
      if (!w.requiredToClear) continue;
      const st = this.state.get(w.id);
      if (st === 'waiting') n += w.spawns.length;
      else if (st === 'active') {
        n += this.pending.filter((p) => p.wave.id === w.id).length;
        n += [...(this.members.get(w.id) ?? [])].filter((e) => e.isAlive()).length;
      }
    }
    return n;
  }

  anyActive(): boolean {
    return this.pending.length > 0 || [...this.state.values()].some((s) => s === 'active');
  }

  /** On respawn: reset unfinished waves so encounters replay cleanly. */
  resetUnfinished(): void {
    this.pending = [];
    for (const [id, st] of this.state) if (st === 'active') this.state.set(id, 'waiting');
    for (const d of this.world.level.districts) {
      if (!this.live.has(d.id)) continue;
      const anyDone = d.waves.some((w) => this.state.get(w.id) === 'done');
      if (!this.districtCleared(d)) {
        this.live.delete(d.id);
        if (!anyDone) continue;
      }
    }
  }

  isLive(id: string): boolean {
    return this.live.has(id);
  }
}
