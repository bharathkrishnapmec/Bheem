const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** HMAC_SHA256(secret, runId|board|issuedAt|build|nonce) (v2 §A5.1). Token format: "<nonce>.<hex sig>". */
export async function signRun(secret: string, runId: string, board: string, issuedAt: number, build: string, nonce: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(`${runId}|${board}|${issuedAt}|${build}|${nonce}`));
  return `${nonce}.${hex(sig)}`;
}

export async function verifyRun(secret: string, token: string, runId: string, board: string, issuedAt: number, build: string): Promise<boolean> {
  const nonce = token.split('.')[0] ?? '';
  const want = await signRun(secret, runId, board, issuedAt, build, nonce);
  if (want.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
