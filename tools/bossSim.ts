import { balance } from '@/config/balance';
import type { BossId } from '@/entities/boss/BossBase';
import { fmtMs, inTarget, simulate, type SkillProfile } from '@/logic/bossSim';

const bosses = Object.keys(balance.bosses.stats) as BossId[];
const profiles = Object.keys(balance.bosses.sim.profiles) as SkillProfile[];
let failed = false;
console.info('boss         profile   phases                          total   target (mid)');
for (const id of bosses) {
  const T = balance.bosses.targets[id];
  for (const p of profiles) {
    const r = simulate(id, p);
    const ok = inTarget(r);
    if (p === 'mid' && !ok) failed = true;
    const mark = p === 'mid' ? (ok ? 'OK ' : 'OUT') + ` ${fmtMs(T.minMs)}-${fmtMs(T.maxMs)}` : '';
    console.info(`${id.padEnd(12)} ${p.padEnd(9)} ${r.phaseMs.map(fmtMs).join(' / ').padEnd(31)} ${fmtMs(r.totalMs).padEnd(7)} ${mark}`);
  }
}
if (failed) {
  console.error('\nMid-skill modelled time outside the target range. Adjust HP first (Boss Buff v3 §B12.3).');
  process.exit(1);
}
