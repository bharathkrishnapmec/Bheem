import Phaser from 'phaser';
import { GameContext } from '@/modes/creative/GameContext';
import type { DistrictId } from '@/core/types';
import { TouchControls } from '@/ui/touch/TouchControls';
import { GAME_H, GAME_W } from '@/config/gameConfig';
import { balance } from '@/config/balance';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { GameEvents, type GameEventMap } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { SaveManager } from '@/core/SaveManager';
import type { WeaponId } from '@/core/types';
import { pxText } from '@/ui/text';
import { drawPanel } from '@/ui/widgets';

const TOAST_COLORS = { gold: PAL.cleanseGold, red: PAL.danger, cyan: PAL.statusCyan, violet: PAL.ruinGlow } as const;

/** HUD overlay (UI_DESIGN §HUD): bottom-left status line, bottom-right resource panel, boss bar, toasts, cards. */
export class UIScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private gl!: Phaser.GameObjects.Graphics;
  private gr!: Phaser.GameObjects.Graphics;
  private blC!: Phaser.GameObjects.Container;
  private brC!: Phaser.GameObjects.Container;
  private touchLayout = false;
  private scoreText!: Phaser.GameObjects.BitmapText;
  private scoreShown = 0;
  private creativeHud: Phaser.GameObjects.Container | null = null;
  private styleText: Phaser.GameObjects.BitmapText | null = null;
  private styleN = 0;
  private styleT = 0;
  private healthLine!: Phaser.GameObjects.BitmapText;
  private hpText!: Phaser.GameObjects.BitmapText;
  private statusText!: Phaser.GameObjects.BitmapText;
  private coinText!: Phaser.GameObjects.BitmapText;
  private ammoText!: Phaser.GameObjects.BitmapText;
  private rescueText!: Phaser.GameObjects.BitmapText;
  private rallyText!: Phaser.GameObjects.BitmapText;
  private weaponName!: Phaser.GameObjects.BitmapText;
  private objective!: Phaser.GameObjects.BitmapText;
  private districtText!: Phaser.GameObjects.BitmapText;
  private bossName!: Phaser.GameObjects.BitmapText;
  private prompt!: Phaser.GameObjects.BitmapText;
  private cardTitle!: Phaser.GameObjects.BitmapText;
  private cardSub!: Phaser.GameObjects.BitmapText;
  private flash!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Graphics;
  private weaponIcons: Record<WeaponId, Phaser.GameObjects.Image> = {} as Record<WeaponId, Phaser.GameObjects.Image>;
  private toasts: Phaser.GameObjects.BitmapText[] = [];
  private shownHp = 100;
  private lagHp = 100;
  private shownRally = 0;
  private promptProgress: number | undefined;
  private promptOn = false;
  private bossOn = false;
  private bossLag = 1;
  private guardSnap: { guard: number; max: number; broken: boolean; recoveryUntil?: number } | null = null;
  private bossTicks: readonly number[] = balance.bosses.global.thresholds;
  private bannerInfo: { hp: number; max: number; t: number } | null = null;
  private summonCd = 0;
  private dashCd = 0;
  private dashTotal = 1;
  private pranaDenyT = 0;
  private hurtT = 0;
  private multiText: Phaser.GameObjects.BitmapText | null = null;
  private offs: (() => void)[] = [];
  private t = 0;

  constructor() {
    super('UI');
  }

  create(): void {
    this.offs = [];
    this.toasts = [];
    this.bossOn = false;
    this.bannerInfo = null;
    this.g = this.add.graphics();
    this.vignette = this.add.graphics().setDepth(-1);
    const s = GameStore.state;
    this.shownHp = this.lagHp = s.hp;

    // bottom-left: status line
    this.gl = this.add.graphics();
    this.blC = this.add.container(0, 0, [
      this.gl,
      this.add.image(22, GAME_H - 58, 'icon_heart').setOrigin(0.5),
      (this.healthLine = pxText(this, 38, GAME_H - 66, STR.health(1), 2, PAL.statusCyan)),
      (this.hpText = pxText(this, 210, GAME_H - 36, '', 1, 0xffffff)),
      (this.statusText = pxText(this, 16, GAME_H - 86, '', 1, PAL.statusCyan)),
    ]);
    this.touchLayout = false;

    // bottom-right: resource panel
    const px = GAME_W - 236;
    const py = GAME_H - 100;
    this.gr = this.add.graphics();
    this.brC = this.add.container(0, 0, [this.gr]);
    this.brC.add([
      this.add.image(px + 20, py + 18, 'icon_coin'),
      (this.coinText = pxText(this, px + 34, py + 12, '0', 2, PAL.cleanseGold)),
      this.add.image(px + 120, py + 18, 'icon_arrow'),
      (this.ammoText = pxText(this, px + 134, py + 12, '0', 2, 0xffffff)),
      this.add.image(px + 20, py + 44, 'icon_captive'),
      (this.rescueText = pxText(this, px + 34, py + 38, '0/12', 2, 0xe8e0f0)),
      (this.rallyText = pxText(this, px + 14, py + 62, STR.hud.rally, 1, PAL.allyGold)),
    ]);
    (['sword', 'bow', 'staff'] as WeaponId[]).forEach((wp, i) => {
      this.weaponIcons[wp] = this.add.image(px + 140 + i * 30, py + 46, `icon_${wp}`);
      this.brC.add(this.weaponIcons[wp]);
    });
    this.weaponName = pxText(this, px + 126, py + 62, '', 1, PAL.statusCyan);
    this.brC.add(this.weaponName);

    // top
    this.districtText = pxText(this, 16, 12, '', 1, PAL.cleanseGold);
    this.scoreText = pxText(this, GAME_W / 2, 20, '0', 2, PAL.cleanseGold).setOrigin(0.5, 0);
    this.creativeHud = null;
    this.styleText = null;
    if (GameContext.creative) this.buildCreativeHud();
    this.objective = pxText(this, 16, 26, '', 2, 0xf0e8ff);
    this.bossName = pxText(this, GAME_W / 2, 58, '', 2, PAL.danger).setOrigin(0.5, 0).setVisible(false);
    this.prompt = pxText(this, GAME_W / 2, GAME_H - 150, '', 2, 0xffffff).setOrigin(0.5).setVisible(false);
    this.cardTitle = pxText(this, GAME_W / 2, GAME_H / 2 - 70, '', 5, PAL.cleanseGold).setOrigin(0.5).setAlpha(0);
    this.cardSub = pxText(this, GAME_W / 2, GAME_H / 2 - 20, '', 2, PAL.statusCyan).setOrigin(0.5).setAlpha(0);
    this.flash = this.add.rectangle(0, 0, GAME_W, GAME_H, 0xffffff, 0).setOrigin(0).setDepth(100);

    const on = <K extends keyof GameEventMap>(k: K, fn: (p: GameEventMap[K]) => void) => {
      GameEvents.on(k, fn);
      this.offs.push(() => GameEvents.off(k, fn));
    };
    on('player:hp', (p) => {
      if (p.delta < 0) this.hurtT = 400;
    });
    on('toast', (p) => this.toast(p.text, TOAST_COLORS[p.color ?? 'gold']));
    on('intro:card', (p) => this.card(p.title, p.subtitle, p.durationMs));
    on('objective:changed', (p) => this.objective.setText(p.text));
    on('district:changed', (p) => this.districtText.setText(p.name.toUpperCase()));
    on('prompt:show', (p) => {
      const k = SaveManager.settings.bindings?.interact?.[0] ?? 'E';
      this.prompt.setText(`[${k}] ${p.label}`).setVisible(true);
      this.promptProgress = p.progress;
      this.promptOn = true;
    });
    on('prompt:hide', () => {
      this.prompt.setVisible(false);
      this.promptOn = false;
    });
    on('boss:guard', (g) => (this.guardSnap = g));
    on('boss:spawned', (p) => {
      this.bossOn = true;
      this.guardSnap = null;
      this.bossTicks = p.phases === 2 ? [0.5] : p.phases === 1 ? [] : balance.bosses.global.thresholds;
      this.bossName.setText(`${p.name} - ${p.title ?? STR.boss.title}`).setVisible(true);
      this.districtText.setText(`${p.name.toUpperCase()}'S ARENA`);
    });
    on('boss:died', () => {
      this.bossOn = false;
      this.bossName.setVisible(false);
    });
    on('banner:damaged', (p) => (this.bannerInfo = { hp: p.hp, max: p.max, t: 3000 }));
    on('summon:cooldown', (p) => {
      this.summonCd = p.remainingMs;
    });
    on('player:dash', (p) => {
      this.dashCd = p.cooldownMs;
      this.dashTotal = p.cooldownMs;
    });
    on('prana:denied', () => (this.pranaDenyT = 500));
    on('fx:screenFlash', (p) => {
      this.flash.setFillStyle(p.color, p.alpha);
      this.tweens.add({ targets: this.flash, fillAlpha: 0, duration: p.ms });
    });
    on('combo:multi', (p) => this.multi(p.count));
    on('district:liberated', (p) => this.card(STR.hud.bannerFallen, STR.hud.districtLiberated(STR.districts[p.id]), 2400));
    on('encounter:cleared', () => this.card(STR.hud.garrisonCleared, '', 1600));
    on('victory:title', () => this.card(STR.victory.title, STR.victory.subtitle, 3200));
    on('checkpoint:reached', () => this.toast('Checkpoint', PAL.cleanseGold));
    on('fx:desaturate', () => {
      this.vignette.clear();
      this.vignette.fillStyle(0x000000, 0.5).fillRect(0, 0, GAME_W, GAME_H);
      this.vignette.setAlpha(0);
      this.tweens.add({ targets: this.vignette, alpha: 1, duration: 800 });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offs.forEach((f) => f()));
  }

  /** Toasts and the Creative style counter sit below the boss bar while it is shown. */
  private toastTop(): number {
    return this.bossOn ? 128 : 90;
  }

  private toast(text: string, color: number): void {
    const top = this.toastTop();
    const t = pxText(this, GAME_W / 2, top, text, 2, color).setOrigin(0.5).setAlpha(0);
    this.toasts.push(t);
    this.toasts.forEach((o, i) => this.tweens.add({ targets: o, y: top + i * 22, duration: 150 }));
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2000,
      duration: 400,
      onComplete: () => {
        t.destroy();
        this.toasts = this.toasts.filter((o) => o !== t);
      },
    });
    if (this.toasts.length > 4) this.toasts.shift()?.destroy();
  }

  private card(title: string, sub: string, ms: number): void {
    this.tweens.killTweensOf([this.cardTitle, this.cardSub]);
    this.cardTitle.setText(title).setAlpha(0).setScale(1.2);
    this.cardSub.setText(sub).setAlpha(0);
    this.tweens.add({ targets: this.cardTitle, alpha: 1, scale: 1, duration: 300, ease: 'Back.out' });
    this.tweens.add({ targets: this.cardSub, alpha: 1, duration: 300, delay: 150 });
    this.tweens.add({ targets: [this.cardTitle, this.cardSub], alpha: 0, delay: Math.max(600, ms - 400), duration: 400 });
  }

  private multi(n: number): void {
    this.multiText?.destroy();
    const t = (this.multiText = pxText(this, GAME_W - 20, 140, `${STR.hud.multi} x${n}`, 3, PAL.ember).setOrigin(1, 0.5));
    t.setScale(1.6);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 300, onComplete: () => t.destroy() });
  }

  override update(_t: number, dt: number): void {
    this.t += dt;
    const s = GameStore.state;
    const g = this.g;
    g.clear();
    this.hurtT -= dt;
    this.pranaDenyT -= dt;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.shownHp += (s.hp - this.shownHp) * Math.min(1, dt / 80);
    if (this.lagHp < this.shownHp) this.lagHp = this.shownHp;
    else this.lagHp -= (dt / 1000) * s.maxHp * 0.6;
    this.shownRally += (s.rally - this.shownRally) * Math.min(1, dt / 120);

    // --- bottom-left
    const gl = this.gl;
    const gr = this.gr;
    gl.clear();
    gr.clear();
    this.applyLayout(TouchControls.visible);
    const pct = s.hp / s.maxHp;
    this.healthLine.setText(STR.health(pct)).setTint(pct < 0.2 && Math.floor(this.t / 250) % 2 ? PAL.danger : PAL.statusCyan);
    drawPanel(gl, 8, GAME_H - 96, 300, 88, { alpha: 0.72 });
    const bx = 16;
    const by = GAME_H - 38;
    gl.fillStyle(PAL.outline, 1).fillRect(bx - 2, by - 2, 184, 14);
    gl.fillStyle(0x3a1020, 1).fillRect(bx, by, 180, 10);
    gl.fillStyle(0xffffff, 0.8).fillRect(bx, by, (180 * Math.max(0, this.lagHp)) / s.maxHp, 10);
    gl.fillStyle(this.hurtT > 0 && Math.floor(this.t / 60) % 2 ? 0xffffff : PAL.danger, 1).fillRect(bx, by, (180 * Math.max(0, this.shownHp)) / s.maxHp, 10);
    gl.fillStyle(0xffffff, 0.25).fillRect(bx, by, (180 * Math.max(0, this.shownHp)) / s.maxHp, 3);
    this.hpText.setText(`${Math.ceil(s.hp)}/${s.maxHp}`).setPosition(bx + 188, by);
    const pyb = GAME_H - 22;
    gl.fillStyle(PAL.outline, 1).fillRect(bx - 2, pyb - 2, 144, 10);
    gl.fillStyle(0x10203a, 1).fillRect(bx, pyb, 140, 6);
    gl.fillStyle(this.pranaDenyT > 0 && Math.floor(this.t / 60) % 2 ? PAL.danger : PAL.prana, 1).fillRect(bx, pyb, (140 * s.prana) / s.maxPrana, 6);
    // dash pip
    const dashReady = this.dashCd <= 0;
    gl.fillStyle(dashReady ? PAL.statusCyan : 0x404060, 1).fillRect(bx + 150, pyb - 2, 10, 10);
    if (!dashReady) gl.fillStyle(PAL.statusCyan, 1).fillRect(bx + 150, pyb + 8 - (10 * (1 - this.dashCd / this.dashTotal)), 10, 10 * (1 - this.dashCd / this.dashTotal));
    const tags: string[] = [];
    if (s.statusEffects.includes('slow')) tags.push(STR.hud.slow);
    if (s.statusEffects.includes('shocked')) tags.push('SHOCKED');
    if (this.pranaDenyT > 0) tags.push(STR.hud.pranaDry);
    this.statusText.setText(tags.join('  ')).setTint(this.pranaDenyT > 0 ? PAL.danger : PAL.statusCyan);

    // --- bottom-right
    const px = GAME_W - 236;
    const py = GAME_H - 100;
    drawPanel(gr, px, py, 228, 92, { alpha: 0.72 });
    this.coinText.setText(String(s.coins));
    this.ammoText.setText(String(Math.floor(s.ammo))).setTint(s.ammo < 1 ? PAL.danger : 0xffffff);
    this.rescueText.setText(`${s.rescued}/${s.totalCaptives}`);
    const rx = px + 14;
    const ry = py + 74;
    const ready = s.rally >= s.summonCost && this.summonCd <= 0 && !s.squadActive;
    gr.fillStyle(PAL.outline, 1).fillRect(rx - 2, ry - 2, 104, 10);
    gr.fillStyle(0x2a2010, 1).fillRect(rx, ry, 100, 6);
    gr.fillStyle(ready && Math.floor(this.t / 200) % 2 ? 0xffffff : PAL.allyGold, 1).fillRect(rx, ry, (100 * this.shownRally) / s.maxRally, 6);
    gr.fillStyle(0xffffff, 0.8).fillRect(rx + (100 * s.summonCost) / s.maxRally, ry - 2, 1, 10);
    this.rallyText.setText(s.squadActive ? STR.hud.squadActive : ready ? STR.hud.summonReady : this.summonCd > 0 ? `${STR.hud.rally} ${Math.ceil(this.summonCd / 1000)}s` : STR.hud.rally);
    (Object.keys(this.weaponIcons) as WeaponId[]).forEach((wp) => {
      const sel = wp === s.weapon;
      const ic = this.weaponIcons[wp];
      ic.setAlpha(sel ? 1 : 0.45).setScale(sel ? 1.15 : 1);
      if (sel) gr.lineStyle(2, PAL.cleanseGold, 1).strokeRect(ic.x - 13, ic.y - 13, 26, 26);
    });
    this.weaponName.setText(STR.weapons[s.weapon].toUpperCase());

    // --- score + district progress strip (Story)
    if (this.creativeHud) this.updateCreativeHud(dt);
    else {
    this.scoreShown += (s.score - this.scoreShown) * Math.min(1, dt / 120);
    if (Math.abs(s.score - this.scoreShown) < 1) this.scoreShown = s.score;
    this.scoreText.setText(String(Math.round(this.scoreShown))).setVisible(!this.bossOn);
    if (!this.bossOn) {
      const ids: DistrictId[] = ['gate', 'market', 'temple', 'hall'];
      const sw = 44;
      const sx = GAME_W / 2 - (ids.length * (sw + 4)) / 2;
      ids.forEach((id, i) => {
        const x = sx + i * (sw + 4);
        const lib = s.districtsLiberated.includes(id);
        g.fillStyle(PAL.outline, 1).fillRect(x - 1, 7, sw + 2, 8);
        g.fillStyle(lib ? PAL.cleanseGold : PAL.ruinViolet, 1).fillRect(x, 8, sw, 6);
        if (id === s.districtId) g.lineStyle(1, 0xffffff, 1).strokeRect(x - 2, 6, sw + 4, 10);
      });
    }
    }

    // --- prompt progress
    if (this.promptOn && this.promptProgress !== undefined) {
      const w = 120;
      g.fillStyle(PAL.outline, 1).fillRect(GAME_W / 2 - w / 2 - 2, GAME_H - 134, w + 4, 8);
      g.fillStyle(PAL.cleanseGold, 1).fillRect(GAME_W / 2 - w / 2, GAME_H - 132, w * Math.min(1, this.promptProgress), 4);
    }

    // --- boss bar
    if (this.bossOn) {
      const w = 480;
      const x = GAME_W / 2 - w / 2;
      const y = 86;
      const f = s.bossMax ? s.bossHp / s.bossMax : 0;
      this.bossLag = Math.max(f, this.bossLag - dt / 2000);
      drawPanel(g, x - 8, y - 32, w + 16, 54, { alpha: 0.75 });
      g.fillStyle(PAL.outline, 1).fillRect(x - 2, y - 2, w + 4, 16);
      g.fillStyle(0x200a14, 1).fillRect(x, y, w, 12);
      g.fillStyle(0xffffff, 0.7).fillRect(x, y, w * this.bossLag, 12);
      g.fillStyle(s.bossPhase >= 3 ? PAL.danger : PAL.ruinViolet, 1).fillRect(x, y, w * f, 12);
      for (const th of this.bossTicks) g.fillStyle(PAL.cleanseGold, 1).fillRect(x + w * th - 1, y - 3, 2, 18);
      this.bossName.setTint(s.bossPhase >= 3 ? PAL.danger : PAL.ruinGlow);
      const gs = this.guardSnap;
      if (gs) {
        const gy = y + 15;
        const now = this.time.now;
        const rec = gs.recoveryUntil !== undefined;
        g.fillStyle(PAL.outline, 1).fillRect(x - 2, gy - 1, w + 4, 7);
        g.fillStyle(0x0a1420, 1).fillRect(x, gy, w, 5);
        if (gs.broken) g.fillStyle(Math.floor(now / 110) % 2 ? PAL.danger : 0xffffff, 1).fillRect(x, gy, w, 5);
        else g.fillStyle(rec ? 0xd8e8ff : PAL.statusCyan, rec ? 0.55 + 0.3 * Math.sin(now / 110) : 1).fillRect(x, gy, w * (gs.max ? gs.guard / gs.max : 0), 5);
        for (let i = 1; i < 4; i++) g.fillStyle(PAL.outline, 0.8).fillRect(x + (w * i) / 4, gy, 1, 5);
      }
    }
    // --- banner hp
    if (this.bannerInfo && !this.bossOn) {
      this.bannerInfo.t -= dt;
      const w = 200;
      const x = GAME_W / 2 - w / 2;
      g.fillStyle(PAL.outline, 1).fillRect(x - 2, 54, w + 4, 10);
      g.fillStyle(PAL.ruinViolet, 1).fillRect(x, 56, (w * this.bannerInfo.hp) / this.bannerInfo.max, 6);
      if (this.bannerInfo.t <= 0 || this.bannerInfo.hp <= 0) this.bannerInfo = null;
    }
  }

  /** Creative HUD: badge, style counter and Tools/Reset/Bosses buttons; no Story score, coins or districts. */
  private buildCreativeHud(): void {
    this.scoreText.setVisible(false);
    const game = () => this.scene.get('Game') as Phaser.Scene & { openToolbox(): boolean; creativeReset(): void; openBossSelect(): void };
    const btn = (x: number, label: string, fn: () => void) => {
      const t = pxText(this, x, 14, label, 1, 0xffffff).setOrigin(0.5, 0);
      const bg = this.add.rectangle(x, 10, t.width + 16, 18, PAL.outline, 0.75).setOrigin(0.5, 0).setStrokeStyle(1, PAL.statusCyan);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', fn);
      return [bg, t];
    };
    const badge = pxText(this, GAME_W / 2 + 240, 12, STR.creative.badge, 2, PAL.statusCyan).setOrigin(0, 0);
    this.styleText = pxText(this, GAME_W / 2, 58, '', 2, PAL.ember).setOrigin(0.5, 0).setAlpha(0);
    this.creativeHud = this.add.container(0, 0, [
      badge,
      this.styleText,
      ...btn(GAME_W / 2 - 150, STR.creative.toolsHint, () => game().openToolbox()),
      ...btn(GAME_W / 2, STR.creative.resetHint, () => game().creativeReset()),
      ...btn(GAME_W / 2 + 150, STR.creative.bossesHint, () => game().openBossSelect()),
    ]);
    for (const o of this.brC.list) if (o !== this.gr && o !== this.ammoText && o !== this.rallyText) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    this.ammoText.setVisible(true);
    const off = GameEvents.on('hit:landed', () => {
      this.styleN = this.styleT > 0 ? this.styleN + 1 : 1;
      this.styleT = 2000;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private updateCreativeHud(dt: number): void {
    const hud = this.creativeHud!;
    hud.setVisible(!TouchControls.visible);
    const boss = GameContext.start?.kind === 'boss';
    this.districtText.setText(boss ? STR.creative.bossSelect.toUpperCase() : `${STR.creative.sandboxArena} - ${STR.arena.names[GameContext.start?.arena ?? 'training_yard']}`.toUpperCase());
    this.objective.setText(boss ? STR.creative.objectiveBoss : STR.creative.objectiveSandbox);
    this.styleT -= dt;
    if (this.styleT <= 0) this.styleN = 0;
    const st = this.styleText!;
    st.setY(this.bossOn ? 112 : 58);
    if (this.styleN >= 3) st.setText(STR.creative.style(this.styleN)).setAlpha(Math.min(1, this.styleT / 400));
    else st.setAlpha(0);
  }

  /** Touch layout moves the primary HUD to the top so thumbs never cover HP, Prana or Rally. */
  private applyLayout(touch: boolean): void {
    if (touch === this.touchLayout) return;
    this.touchLayout = touch;
    this.blC.setPosition(0, touch ? -(GAME_H - 104) : 0);
    this.brC.setPosition(touch ? -56 : 0, touch ? -(GAME_H - 108) : 0);
    this.districtText.setPosition(16, touch ? 108 : 12);
    this.objective.setPosition(16, touch ? 122 : 26);
  }
}
