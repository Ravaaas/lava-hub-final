// PostgREST ne renvoie pas d'erreur quand la RLS filtre une modification ou une suppression : seulement 0 ligne.
// Toute écriture demande donc les lignes touchées (.select()) et passe par `denied`.
export interface WriteResult {
  error: { message: string } | null;
  data: unknown;
}

export function denied(res: WriteResult): boolean {
  return res.error !== null || (Array.isArray(res.data) && res.data.length === 0);
}

export function deniedMessage(res: WriteResult): string {
  return res.error ? res.error.message : 'droits insuffisants — reconnecte-toi en admin';
}
