import Phaser from 'phaser';
import { GAME_W } from '@/config/gameConfig';
import { PAL } from '@/config/palette';
import { STR } from '@/config/strings';
import { AudioManager } from '@/audio/AudioManager';
import { pxText } from '@/ui/text';
import { MenuList, drawPanel } from '@/ui/widgets';
import { TouchControls } from '@/ui/touch/TouchControls';
import { MenuScene } from '@/modes/creative/scenes';
import { bossRegistry } from '@/modes/creative/bossRegistry';
import { GameContext, type CreativeStart } from '@/modes/creative/GameContext';
import { Leaderboard } from '@/leaderboard/LeaderboardService';
import { BOARDS, boardDef } from '@/shared/boards';
import type { BoardId, Entry, Period, RunResult, RunTicket, SubmitOutcome } from '@/shared/types';
import { fmtMs, trialBoard } from './trial';

const setSceneName = (name: string): void => {
  const h = (window as unknown as { __BHEEM__?: { scene?: string } }).__BHEEM__;
  if (h) h.scene = name;
};

function startTrial(scene: Phaser.Scene, bossId: string): void {
  const b = bossRegistry.find((e) => e.id === bossId)!;
  const start: CreativeStart = { kind: 'boss', bossId: b.id, arena: b.arenas[0], phase: 1, allies: 'none', skipIntro: true };
  AudioManager.unlock();
  scene.scene.stop('Game');
  scene.scene.stop('UI');
  scene.scene.start('Game', { creative: start, trial: true });
}

/** Main Menu -> Boss Trials: one card per trial-eligible boss (v2 §A4.1). */
export class TrialsScene extends MenuScene {
  constructor() {
    super('Trials');
  }
  create(): void {
    this.backdrop();
    TouchControls.setPlaying(false);
    pxText(this, GAME_W / 2, 50, STR.trials.title.toUpperCase(), 4, PAL.cleanseGold).setOrigin(0.5, 0);
    pxText(this, GAME_W / 2, 100, STR.trials.sub, 1, PAL.statusCyan).setOrigin(0.5, 0);
    const bosses = bossRegistry.filter((b) => b.trialEligible);
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      150,
      [
        ...bosses.map((b) => ({
          label: () => `${b.name}  ${'*'.repeat(b.difficulty)}`,
          value: () => `${STR.trials.best} ${fmtMs(Leaderboard.local.best(trialBoard(b.id)))}`,
          onConfirm: () => startTrial(this, b.id),
        })),
        { label: () => STR.trials.leaderboard, onConfirm: () => this.scene.start('Leaderboard', { from: 'Trials' }) },
        { label: () => STR.board.back, onConfirm: () => this.onBack() },
      ],
      { width: 600, spacing: 44, scale: 2 },
    );
    this.setupInput();
    setSceneName('Trials');
  }
  protected onBack(): void {
    this.scene.start('MainMenu');
  }
}

interface TrialResultData {
  won: boolean;
  board: BoardId;
  result: RunResult;
  tainted: boolean;
  ticket: Promise<RunTicket>;
  local: Promise<SubmitOutcome> | null;
}

/** Fight time, hits (+penalty), adjusted time, PB and submit/retry (v2 §A4.3-A4.4). */
export class TrialResultScene extends MenuScene {
  private status!: Phaser.GameObjects.Text | Phaser.GameObjects.BitmapText;
  private submitted = false;
  constructor() {
    super('TrialResult');
  }
  create(d: TrialResultData): void {
    this.submitted = false;
    this.add.rectangle(0, 0, GAME_W, 540, 0x05040a, 0.6).setOrigin(0);
    drawPanel(this.add.graphics(), GAME_W / 2 - 240, 40, 480, 470, { alpha: 0.96, trim: d.won ? PAL.cleanseGold : PAL.danger });
    pxText(this, GAME_W / 2, 56, d.won ? STR.trials.victory : STR.trials.defeat, 3, d.won ? PAL.cleanseGold : PAL.danger).setOrigin(0.5, 0);
    const pen = d.result.hitsTaken * 6;
    const adj = d.result.timeMs + d.result.hitsTaken * 6000;
    const rows: [string, string][] = [
      [STR.trials.fightTime, fmtMs(d.result.timeMs)],
      [STR.trials.hits, `${d.result.hitsTaken} (+${pen}s)`],
      [STR.trials.adjusted, d.won ? fmtMs(adj) : '--'],
      [STR.trials.personalBest, fmtMs(Leaderboard.local.best(d.board))],
    ];
    const vals = rows.map(([k, v], i) => {
      pxText(this, GAME_W / 2 - 200, 100 + i * 26, k, 2, PAL.statusCyan);
      return pxText(this, GAME_W / 2 + 200, 100 + i * 26, v, 2, 0xffffff).setOrigin(1, 0);
    });
    this.status = pxText(this, GAME_W / 2, 208, d.tainted ? STR.trials.practice : '', 2, d.tainted ? PAL.statusCyan : PAL.ember).setOrigin(0.5, 0);
    void d.local?.then((o) => {
      vals[3]!.setText(fmtMs(Leaderboard.local.best(d.board)));
      if (!d.tainted) this.status.setText(o.status === 'accepted' ? STR.trials.outcome.accepted! : `${STR.trials.outcome.not_best}`);
    });
    const leave = (key: string, data?: object) => {
      this.scene.stop('Game');
      this.scene.stop('UI');
      this.scene.start(key, data);
    };
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      250,
      [
        {
          label: () => STR.trials.submit,
          enabled: () => d.won && !d.tainted && Leaderboard.online && !this.submitted,
          onConfirm: () => {
            this.submitted = true;
            this.status.setText(STR.trials.submitting);
            void d.ticket
              .then((t) => Leaderboard.submitRemote(t, d.result))
              .then((o) => this.status.setText(`${STR.trials.outcome[o.status] ?? o.status}${o.rank ? `  ${STR.trials.rank}${o.rank}` : ''}`));
          },
        },
        { label: () => STR.trials.retry, onConfirm: () => GameContext.start?.kind === 'boss' && startTrial(this, GameContext.start.bossId!) },
        { label: () => STR.trials.select, onConfirm: () => leave('Trials') },
        { label: () => STR.trials.leaderboard, onConfirm: () => leave('Leaderboard', { from: 'Trials', board: d.board }) },
        { label: () => STR.trials.quit, onConfirm: () => this.onBack() },
      ],
      { width: 360, spacing: 44, scale: 2 },
    );
    this.setupInput();
    setSceneName('TrialResult');
  }
  protected onBack(): void {
    this.scene.stop('Game');
    this.scene.stop('UI');
    this.scene.start('MainMenu');
  }
}

const boardName = (id: BoardId): string => {
  const b = boardDef(id)!;
  if (!b.boss) return STR.board.story;
  return bossRegistry.find((e) => trialBoard(e.id) === id)?.name ?? b.boss;
};

/** Leaderboard screen (v2 §A3.1): board tabs, period toggle, top list, pinned "You" row, all states. */
export class LeaderboardScene extends MenuScene {
  private bi = 0;
  private period: Period = 'all';
  private list!: Phaser.GameObjects.Container;
  private req = 0;
  private from = 'MainMenu';
  constructor() {
    super('Leaderboard');
  }
  create(d?: { from?: string; board?: BoardId }): void {
    this.from = d?.from ?? 'MainMenu';
    this.bi = Math.max(0, BOARDS.findIndex((b) => b.id === d?.board));
    this.backdrop();
    TouchControls.setPlaying(false);
    pxText(this, GAME_W / 2, 20, STR.board.title.toUpperCase(), 3, PAL.cleanseGold).setOrigin(0.5, 0);
    if (!Leaderboard.online) pxText(this, GAME_W / 2, 52, STR.board.local, 1, PAL.statusCyan).setOrigin(0.5, 0);
    this.list = this.add.container(0, 0);
    const step = (dir: number) => {
      this.bi = (this.bi + dir + BOARDS.length) % BOARDS.length;
      this.reload();
    };
    const flip = () => {
      this.period = this.period === 'all' ? 'week' : 'all';
      this.reload();
    };
    this.menu = new MenuList(
      this,
      GAME_W / 2,
      380,
      [
        { label: () => STR.board.board, value: () => `< ${boardName(BOARDS[this.bi]!.id)} >`, onLeft: () => step(-1), onRight: () => step(1), onConfirm: () => step(1) },
        { label: () => STR.board.period, value: () => `< ${this.period === 'all' ? STR.board.all : STR.board.week} >`, onLeft: flip, onRight: flip, onConfirm: flip },
        { label: () => STR.board.refresh, onConfirm: () => this.reload() },
        { label: () => STR.board.back, onConfirm: () => this.onBack() },
      ],
      { width: 520, spacing: 36, scale: 2 },
    );
    this.setupInput();
    this.reload();
    setSceneName('Leaderboard');
  }
  private row(y: number, e: Entry, trial: boolean, you = false): void {
    const medal = [PAL.cleanseGold, 0xc8d0e0, 0xd08850][e.rank - 1];
    const col = you ? PAL.ember : (medal ?? 0xffffff);
    this.list.add([
      pxText(this, GAME_W / 2 - 260, y, `${you ? STR.board.you + ' ' : ''}#${e.rank}`, 2, col),
      pxText(this, GAME_W / 2 - 150, y, e.name, 2, col),
      pxText(this, GAME_W / 2 + 160, y, trial ? fmtMs(e.value) : String(e.value), 2, col).setOrigin(1, 0),
      pxText(this, GAME_W / 2 + 260, y, trial ? `${e.hits ?? 0} hits` : '', 1, 0xb8b0c8).setOrigin(1, 0),
    ]);
  }
  private reload(): void {
    const id = ++this.req;
    const def = BOARDS[this.bi]!;
    const trial = def.mode === 'trial';
    this.menu?.refresh();
    this.list.removeAll(true);
    this.list.add(pxText(this, GAME_W / 2, 180, STR.board.loading, 2, PAL.statusCyan).setOrigin(0.5, 0));
    Promise.all([Leaderboard.getTop(def.id, this.period, 10, 0), Leaderboard.getMine(def.id, this.period)])
      .then(([page, mine]) => {
        if (id !== this.req || !this.sys.isActive()) return;
        this.list.removeAll(true);
        if (!page.entries.length) {
          this.list.add(pxText(this, GAME_W / 2, 180, STR.board.empty, 3, PAL.cleanseGold).setOrigin(0.5, 0));
          return;
        }
        page.entries.forEach((e, i) => this.row(80 + i * 26, e, trial));
        if (mine) this.row(346, mine.entry, trial, true);
      })
      .catch(() => {
        if (id !== this.req || !this.sys.isActive()) return;
        this.list.removeAll(true);
        this.list.add(pxText(this, GAME_W / 2, 180, STR.board.error, 2, PAL.danger).setOrigin(0.5, 0));
      });
  }
  protected onBack(): void {
    this.scene.start(this.from);
  }
}
