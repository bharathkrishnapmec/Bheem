import { GameEvents } from '@/core/GameEvents';
import { GameStore } from '@/core/GameStore';
import { SaveManager } from '@/core/SaveManager';
import type { WeaponId } from '@/core/types';
import { touchInput, TOUCH, type TouchControl } from '@/input/TouchInput';
import { Device } from '@/platform/Device';

const SIZE_MUL = { S: 0.85, M: 1, L: 1.2 } as const;
const WEAPON_LABEL: Record<WeaponId, string> = { sword: 'SWD', bow: 'BOW', staff: 'STF' };

const CSS = `
#touch-controls { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: none; font: bold 12px monospace; color: #fff; }
#touch-controls.show { display: block; }
#touch-controls .tc-zone { position: absolute; top: 22%; bottom: 0; width: 40%; pointer-events: auto; touch-action: none; }
#touch-controls .tc-btn { position: absolute; pointer-events: auto; touch-action: none; box-sizing: border-box; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; line-height: 1.1;
  background: rgba(26,22,40,0.85); border: 3px solid #4a4266; box-shadow: 0 0 0 2px #1e1b2e; opacity: var(--tc-op); transition: transform 40ms; }
#touch-controls .tc-btn.on { opacity: 1; transform: scale(0.94); border-color: #ffd25a; background: rgba(43,37,64,0.95); }
#touch-controls .tc-btn.square { border-radius: 10px; }
#touch-controls .tc-btn.active-weapon { border-color: #5ee6f2; }
#touch-controls .tc-btn.ready { border-color: #ffe28a; box-shadow: 0 0 12px 2px #ffd25a; }
#touch-controls .tc-btn.hidden { display: none; }
#touch-controls .tc-ring { position: absolute; inset: -3px; border-radius: 50%; pointer-events: none;
  background: conic-gradient(var(--tc-ring-c, #5ee6f2) calc(var(--p, 0) * 360deg), transparent 0);
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 64%); mask: radial-gradient(circle, transparent 62%, #000 64%); }
#touch-controls .tc-sub { font-size: 10px; color: #5ee6f2; }
#touch-controls .tc-stick-base, #touch-controls .tc-stick-knob { position: absolute; border-radius: 50%; pointer-events: none; display: none; transform: translate(-50%, -50%); }
#touch-controls .tc-stick-base { border: 3px solid rgba(94,230,242,0.6); background: rgba(26,22,40,0.35); }
#touch-controls .tc-stick-knob { background: rgba(255,210,90,0.85); border: 3px solid #1e1b2e; }
#touch-controls .tc-aim { position: absolute; height: 4px; background: linear-gradient(90deg, rgba(255,210,90,0.2), #ffd25a); transform-origin: 0 50%; pointer-events: none; display: none; }
#touch-controls .tc-aim::after { content: ''; position: absolute; right: -6px; top: -5px; border-left: 10px solid #ffd25a; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
`;

interface Btn {
  el: HTMLDivElement;
  label: HTMLSpanElement;
  sub: HTMLSpanElement;
  ring: HTMLDivElement | null;
  control: TouchControl | 'chip';
  weapon?: WeaponId;
}

/**
 * DOM overlay of on-screen controls (#touch-controls), anchored to the real screen corners with safe-area
 * padding. Pointer Events + setPointerCapture; one pointer id per control. Feeds `touchInput` only.
 */
class TouchControlsImpl {
  private root!: HTMLDivElement;
  private zone!: HTMLDivElement;
  private base!: HTMLDivElement;
  private knob!: HTMLDivElement;
  private aimLine!: HTMLDivElement;
  private btns = new Map<string, Btn>();
  private mounted = false;
  private playing = false;
  private paused = false;
  private creative = false;
  private promptOn = false;
  private promptProgress = 0;
  private dashEnd = 0;
  private dashTotal = 1;
  private summonCdEnd = 0;
  private squadEnd = 0;
  private lastHaptic = 0;
  private attackPtr: number | null = null;

  mount(): void {
    if (this.mounted || typeof document === 'undefined') return;
    this.mounted = true;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    document.body.appendChild(this.root);

    this.zone = this.div('tc-zone');
    this.base = this.div('tc-stick-base');
    this.knob = this.div('tc-stick-knob');
    this.aimLine = this.div('tc-aim');
    this.bindZone();

    this.btn('attack', 'ATTACK');
    this.btn('jump', 'JUMP');
    this.btn('dash', 'DASH', true);
    this.btn('summon', 'SUMMON', true);
    this.btn('interact', 'HOLD', true);
    for (const w of ['sword', 'bow', 'staff'] as WeaponId[]) this.btn('chip', WEAPON_LABEL[w], false, w);
    this.btn('pause', 'II', false, undefined, true);
    this.btn('toolbox', 'TOOLS', false, undefined, true);
    this.btn('reset', '\u21bb RESET', false, undefined, true);
    this.btn('bossSelect', 'BOSSES', false, undefined, true);

    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !touchInput.active) {
          touchInput.active = true;
          this.refresh();
        }
      },
      { capture: true },
    );
    window.addEventListener('resize', () => this.layout());
    GameEvents.on('settings:changed', () => this.layout());
    GameEvents.on('game:paused', (p) => {
      this.paused = p.paused;
      if (p.paused) this.releaseAll();
      this.refresh();
    });
    GameEvents.on('prompt:show', (p) => {
      this.promptOn = true;
      this.promptProgress = p.progress ?? 0;
    });
    GameEvents.on('prompt:hide', () => (this.promptOn = false));
    GameEvents.on('player:dash', (p) => {
      this.dashTotal = Math.max(1, p.cooldownMs);
      this.dashEnd = performance.now() + p.cooldownMs;
    });
    GameEvents.on('summon:cooldown', (p) => (this.summonCdEnd = performance.now() + p.remainingMs));
    GameEvents.on('summon:started', (p) => {
      this.squadEnd = performance.now() + p.durationMs;
      this.haptic(50);
    });
    GameEvents.on('summon:ended', () => (this.squadEnd = 0));
    GameEvents.on('player:hurt', () => this.haptic(30));
    GameEvents.on('damage:number', (p) => {
      if (p.kind === 'normal' || p.kind === 'heavy') this.haptic(10, 60);
    });
    this.layout();
    const loop = () => {
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Called by GameScene: controls only show during gameplay. */
  setPlaying(on: boolean, creative = false): void {
    this.playing = on;
    this.creative = creative;
    this.paused = false;
    if (!on) this.releaseAll();
    this.refresh();
  }

  get visible(): boolean {
    return this.mounted && this.root.classList.contains('show');
  }

  private haptic(ms: number, throttle = 0): void {
    if (!SaveManager.settings.haptics || !touchInput.active) return;
    const now = performance.now();
    if (throttle && now - this.lastHaptic < throttle) return;
    this.lastHaptic = now;
    Device.vibrate(ms);
  }

  private div(cls: string, parent: HTMLElement = this.root): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    parent.appendChild(d);
    return d;
  }

  private releaseAll(): void {
    touchInput.releaseAll();
    this.attackPtr = null;
    for (const b of this.btns.values()) b.el.classList.remove('on');
    this.base.style.display = this.knob.style.display = this.aimLine.style.display = 'none';
  }

  private bindZone(): void {
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (touchInput.held('stick')) return;
      try {
        z.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      touchInput.down(e.pointerId, 'stick', e.clientX, e.clientY);
      const r = TOUCH.stickRadius;
      Object.assign(this.base.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px`, width: `${r * 2}px`, height: `${r * 2}px` });
      Object.assign(this.knob.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px`, width: `${r}px`, height: `${r}px` });
    });
    z.addEventListener('pointermove', (e) => touchInput.move(e.pointerId, e.clientX, e.clientY));
    const end = (e: PointerEvent) => {
      touchInput.up(e.pointerId);
      if (!touchInput.held('stick')) this.base.style.display = this.knob.style.display = 'none';
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  private btn(control: TouchControl | 'chip', text: string, ring = false, weapon?: WeaponId, square = false): void {
    const el = this.div('tc-btn' + (square ? ' square' : ''));
    el.dataset.control = weapon ?? control;
    const label = document.createElement('span');
    label.textContent = text;
    const sub = document.createElement('span');
    sub.className = 'tc-sub';
    el.append(label, sub);
    const ringEl = ring ? this.div('tc-ring', el) : null;
    const b: Btn = { el, label, sub, ring: ringEl, control, weapon };
    this.btns.set(weapon ?? control, b);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      let c: TouchControl;
      if (b.control === 'chip') c = GameStore.state.weapon === b.weapon ? 'cycle' : b.weapon!;
      else c = b.control;
      touchInput.down(e.pointerId, c, e.clientX, e.clientY);
      if (c === 'attack') this.attackPtr = e.pointerId;
      el.classList.add('on');
    });
    el.addEventListener('pointermove', (e) => touchInput.move(e.pointerId, e.clientX, e.clientY));
    const end = (e: PointerEvent) => {
      touchInput.up(e.pointerId);
      if (this.attackPtr === e.pointerId) {
        this.attackPtr = null;
        this.aimLine.style.display = 'none';
      }
      el.classList.remove('on');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  /** Position every control from the real screen corners (safe-area aware). */
  private layout(): void {
    if (!this.mounted) return;
    const st = SaveManager.settings;
    const m = SIZE_MUL[st.touchSize] ?? 1;
    this.root.style.setProperty('--tc-op', String(st.touchOpacity));
    const near = st.leftHanded ? 'left' : 'right';
    const far = st.leftHanded ? 'right' : 'left';
    const sx = `env(safe-area-inset-${near}, 0px)`;
    const sb = 'env(safe-area-inset-bottom, 0px)';
    const st0 = 'env(safe-area-inset-top, 0px)';
    const place = (key: string, size: number, side: number, bottom: number, fs = 12) => {
      const b = this.btns.get(key);
      if (!b) return;
      const s = Math.round(size * m);
      Object.assign(b.el.style, { width: `${s}px`, height: `${s}px`, fontSize: `${Math.round(fs * m)}px`, bottom: `calc(${sb} + ${Math.round(bottom * m)}px)`, top: '', left: '', right: '' });
      b.el.style[near] = `calc(${sx} + ${Math.round(side * m)}px)`;
    };
    const top = (key: string, size: number, side: number, onFar: boolean) => {
      const b = this.btns.get(key);
      if (!b) return;
      const s = Math.round(size * m);
      Object.assign(b.el.style, { width: `${Math.round(s * (key === 'pause' ? 1 : 1.5))}px`, height: `${s}px`, top: `calc(${st0} + 8px)`, bottom: '', left: '', right: '', fontSize: `${Math.round(11 * m)}px` });
      const sd = onFar ? far : near;
      b.el.style[sd] = `calc(env(safe-area-inset-${sd}, 0px) + ${Math.round(side * m)}px)`;
    };
    place('attack', 88, 16, 24, 14);
    place('jump', 64, 116, 16);
    place('dash', 64, 36, 124);
    place('summon', 56, 192, 16, 10);
    place('interact', 56, 124, 100, 11);
    place('sword', 56, 152, 200);
    place('bow', 56, 84, 200);
    place('staff', 56, 16, 200);
    top('pause', 56, 8, false);
    top('toolbox', 52, 8, true);
    top('reset', 52, 104, true);
    top('bossSelect', 52, 200, true);
    this.zone.style.left = this.zone.style.right = '';
    this.zone.style[far] = '0';
    this.refresh();
  }

  private refresh(): void {
    if (!this.mounted) return;
    const show = this.playing && !this.paused && (touchInput.active || SaveManager.settings.touchAlways);
    this.root.classList.toggle('show', show);
    for (const k of ['toolbox', 'reset', 'bossSelect']) this.btns.get(k)?.el.classList.toggle('hidden', !this.creative);
  }

  private tick(): void {
    const wasShown = this.root.classList.contains('show');
    this.refresh();
    if (!this.root.classList.contains('show')) {
      if (wasShown) this.releaseAll();
      return;
    }
    const now = performance.now();
    const s = GameStore.state;
    // joystick knob
    const stick = touchInput.stick();
    if (stick) {
      this.knob.style.left = `${stick.ox + stick.knobX}px`;
      this.knob.style.top = `${stick.oy + stick.knobY}px`;
    }
    // aim line from the attack button
    const atk = this.btns.get('attack')!;
    const aim = touchInput.aim();
    if (aim && aim.angle !== null && this.attackPtr !== null) {
      const r = atk.el.getBoundingClientRect();
      const len = 40 + aim.frac * 90;
      Object.assign(this.aimLine.style, { display: 'block', left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2 - 2}px`, width: `${len}px`, transform: `rotate(${aim.angle}rad)` });
    } else this.aimLine.style.display = 'none';
    atk.sub.textContent = s.weapon === 'sword' ? '' : s.weapon === 'bow' ? 'HOLD' : 'HOLD/DRAG';
    // dash cooldown ring
    const dash = this.btns.get('dash')!;
    const dcd = Math.max(0, this.dashEnd - now);
    dash.ring!.style.setProperty('--p', String(dcd > 0 ? 1 - dcd / this.dashTotal : 1));
    dash.el.style.setProperty('--tc-ring-c', dcd > 0 ? '#6a6480' : '#5ee6f2');
    // summon: rally fill, glow when ready, squad timer
    const sm = this.btns.get('summon')!;
    const ready = s.rally >= s.summonCost && this.summonCdEnd <= now && !s.squadActive;
    sm.ring!.style.setProperty('--p', String(s.rally / Math.max(1, s.maxRally)));
    sm.el.style.setProperty('--tc-ring-c', '#ffe28a');
    sm.el.classList.toggle('ready', ready);
    sm.sub.textContent = s.squadActive && this.squadEnd > now ? `${Math.ceil((this.squadEnd - now) / 1000)}s` : this.summonCdEnd > now ? `${Math.ceil((this.summonCdEnd - now) / 1000)}s` : `${Math.floor(s.rally)}`;
    // interact: only when a prompt is active; hold progress ring
    const it = this.btns.get('interact')!;
    it.el.classList.toggle('hidden', !this.promptOn);
    it.ring!.style.setProperty('--p', String(this.promptProgress));
    it.ring!.parentElement!.style.setProperty('--tc-ring-c', '#ffd25a');
    // weapon chips
    for (const w of ['sword', 'bow', 'staff'] as WeaponId[]) {
      const b = this.btns.get(w)!;
      b.el.classList.toggle('active-weapon', s.weapon === w);
      b.sub.textContent = w === 'bow' ? String(Math.floor(s.ammo)) : w === 'staff' ? String(Math.floor(s.prana)) : '';
    }
  }
}

export const TouchControls = new TouchControlsImpl();
