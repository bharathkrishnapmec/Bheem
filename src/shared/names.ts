/** Display-name rules shared by the game and the server (v2 §A3.2). Extend DENY freely. */
export const DENY = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'whore', 'slut', 'rape', 'nazi', 'dick', 'pussy', 'asshole', 'bastard'];

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/(.)\1{2,}/g, '$1$1');
}

export type NameIssue = 'length' | 'chars' | 'profanity';

export function nameIssue(raw: string, extra: readonly string[] = []): NameIssue | null {
  const n = normalizeName(raw);
  if (n.length < 3 || n.length > 12) return 'length';
  if (!/^[A-Za-z0-9 _-]+$/.test(n)) return 'chars';
  const flat = n.toLowerCase().replace(/[ _-]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
  if ([...DENY, ...extra].some((w) => flat.includes(w))) return 'profanity';
  return null;
}

export const generatedName = (rnd: () => number = Math.random): string => `Bheem${1000 + Math.floor(rnd() * 9000)}`;
