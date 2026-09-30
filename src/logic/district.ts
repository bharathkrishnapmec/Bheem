export type DistrictState = 'occupied' | 'combat' | 'cleared' | 'bannerVulnerable' | 'liberated';
export type DistrictEvent = 'enter' | 'wavesCleared' | 'shieldDown' | 'bannerDestroyed' | 'restoreLiberated';

const TRANSITIONS: Record<DistrictState, Partial<Record<DistrictEvent, DistrictState>>> = {
  occupied: { enter: 'combat', restoreLiberated: 'liberated' },
  combat: { wavesCleared: 'cleared', restoreLiberated: 'liberated' },
  cleared: { shieldDown: 'bannerVulnerable', restoreLiberated: 'liberated' },
  bannerVulnerable: { bannerDestroyed: 'liberated', restoreLiberated: 'liberated' },
  liberated: {},
};

/** §14.2: Occupied → Combat → Garrison Cleared → Banner Vulnerable → Liberated. */
export function nextDistrictState(state: DistrictState, ev: DistrictEvent): DistrictState {
  return TRANSITIONS[state][ev] ?? state;
}

export function bannerIsVulnerable(state: DistrictState): boolean {
  return state === 'bannerVulnerable';
}
