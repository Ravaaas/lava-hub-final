import { denied, deniedMessage, type WriteResult } from '../lib/denied';

/** Résultat d'une écriture, toujours vérifié (RLS silencieuse comprise). */
export type Resultat = { ok: true } | { ok: false; message: string };

export const OK: Resultat = { ok: true };

export function verifier(res: WriteResult): Resultat {
  return denied(res) ? { ok: false, message: deniedMessage(res) } : OK;
}

/** Une coupure réseau devient un refus lisible au lieu d'une exception. */
export async function prudent(f: () => PromiseLike<Resultat>): Promise<Resultat> {
  try { return await f(); } catch { return { ok: false, message: 'erreur réseau — réessaie' }; }
}
