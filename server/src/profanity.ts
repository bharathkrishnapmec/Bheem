/** Server-side name moderation: same rules as the client (src/shared/names.ts). Extend EXTRA_DENY freely. */
export { DENY, nameIssue, normalizeName } from '../../src/shared/names';
export const EXTRA_DENY: string[] = [];
