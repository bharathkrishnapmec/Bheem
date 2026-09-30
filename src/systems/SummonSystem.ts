import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import type { AllyType } from '@/core/types';
import { allyHpMultiplier, squadComposition, squadSize, summonDenial } from '@/logic/summon';
import { AudioManager } from '@/audio/AudioManager';
import { Ally } from '@/entities/allies/Ally';
import type { World } from '@/game/World';

/** Rally-powered soldier summons (§10). */
export class SummonSystem {
  cooldown = 0;
  private wasActive = false;
  private cdEmitT = 0;
  constructor(private world: World) {}

  get active(): boolean {
    for (const a of this.world.allies) if (a.isAlive()) return true;
    return false;
  }

  tryStart(): void {
    const w = this.world;
    const denial = summonDenial(GameStore.state.rally, this.cooldown, this.active);
    if (denial) {
      GameEvents.emit('summon:denied', { reason: denial });
      AudioManager.play('deny');
      const msg = denial === 'active' ? 'Squad already fighting' : denial === 'cooldown' ? `Summon ready in ${Math.ceil(this.cooldown / 1000)}s` : 'Not enough Rally';
      w.fx.popText(w.player.x, w.player.body.y - 8, msg, PAL.statusCyan, 1, 800);
      return;
    }
    GameStore.setRally(GameStore.state.rally - balance.rally.summonCost);
    w.player.startSummon();
    AudioManager.play('squadHorn');
    w.fx.ring(w.player.x, w.player.cy, PAL.allyGold, 4, 500);
    w.scene.time.delayedCall(balance.summon.castMs, () => this.spawnSquad());
  }

  private spawnSquad(): void {
    const w = this.world;
    const p = w.player;
    if (p.dead) return;
    const comp = squadComposition(GameStore.state.rescued);
    const hpMul = allyHpMultiplier(GameStore.state.upgrades.rally);
    const kinds: AllyType[] = [];
    for (const k of ['shieldbearer', 'captain', 'spearman', 'archer'] as const) for (let i = 0; i < comp[k]; i++) kinds.push(k);
    kinds.forEach((k, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const d = balance.summon.spawnMinDist + ((balance.summon.spawnMaxDist - balance.summon.spawnMinDist) * i) / Math.max(1, kinds.length - 1);
      let x = p.x + side * d;
      const gy = w.geo.groundBelow(x, p.y - 60, true, 300);
      if (gy === null || w.geo.solidAt(x, p.y - 20)) x = p.x;
      const y = (gy ?? p.y) - 1;
      w.scene.time.delayedCall(i * 90, () => {
        const a = new Ally(w, x, y, k, hpMul, comp.durationMs, i);
        w.allies.add(a);
        w.groundGroup.add(a);
        w.fx.burst(x, y - 26, 14, [PAL.allyGold, 0xffffff, PAL.cleanseGold], { speed: 160, g: -80, life: 500, additive: true });
        w.fx.decal('fx_glyph', x, y + 4, 700, PAL.allyGold);
      });
    });
    AudioManager.play('summon');
    GameStore.state.squadActive = true;
    this.wasActive = true;
    GameEvents.emit('summon:started', { durationMs: comp.durationMs, squadSize: squadSize(comp) });
  }

  update(dt: number): void {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      this.cdEmitT -= dt;
      if (this.cdEmitT <= 0 || this.cooldown <= 0) {
        this.cdEmitT = 200;
        GameEvents.emit('summon:cooldown', { remainingMs: Math.max(0, this.cooldown), totalMs: balance.summon.cooldownMs });
      }
    }
    for (const a of this.world.allies) if (!a.active) this.world.allies.delete(a);
    if (this.wasActive && !this.active) {
      this.wasActive = false;
      this.cooldown = balance.summon.cooldownMs;
      GameStore.state.squadActive = false;
      GameEvents.emit('summon:ended', {});
    }
  }

  dismissAll(): void {
    for (const a of this.world.allies) a.expire();
  }
}
