import type { EvenementJournal } from './types';

export type LigneJournal =
  | { type: 'app'; ts: number; titre: string; desc: string }
  | { type: 'data'; ts: number; tsDebut: number; action: string; ficheNom: string; par: string; detail: string[]; nombre: number };

/** Type d'une action du journal : libellé et couleur (variable CSS). */
export function natureAction(action: string): { libelle: string; couleur: string } {
  const a = action.toLowerCase();
  if (a.includes('suppression')) return { libelle: 'Suppression', couleur: 'var(--danger-tx)' };
  if (a.includes('création')) return { libelle: 'Création', couleur: 'var(--ok)' };
  return { libelle: 'Modification', couleur: 'var(--ink3)' };
}

const ECART_MAX = 3 * 60 * 1000;

/**
 * Lignes du journal, de la plus récente à la plus ancienne. Les modifications rapprochées
 * (même fiche, même action, même personne, moins de 3 min d'écart) sont fusionnées en une ligne « ×n ».
 */
export function lignesJournal(maj: readonly { date: string; titre: string; desc: string }[], evts: readonly EvenementJournal[]): LigneJournal[] {
  const toutes: LigneJournal[] = [
    ...maj.map(c => ({ type: 'app' as const, ts: new Date(c.date).getTime(), titre: c.titre, desc: c.desc })),
    ...evts.map(e => ({ type: 'data' as const, ts: e.ts, tsDebut: e.ts, action: e.action, ficheNom: e.ficheNom, par: e.par, detail: e.detail, nombre: 1 })),
  ].sort((a, b) => b.ts - a.ts);
  const out: LigneJournal[] = [];
  for (const l of toutes) {
    const prec = out[out.length - 1];
    if (l.type === 'data' && prec?.type === 'data' && prec.action === l.action && prec.ficheNom === l.ficheNom && prec.par === l.par && prec.tsDebut - l.ts <= ECART_MAX) {
      prec.nombre++;
      prec.tsDebut = l.ts;
      prec.detail = [...new Set([...prec.detail, ...l.detail])];
    } else out.push(l.type === 'data' ? { ...l, detail: [...l.detail] } : l);
  }
  return out;
}

/** « Aujourd'hui », « Hier », sinon « lundi 28 septembre ». */
export function libelleJour(d: Date, maintenant = new Date()): string {
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(maintenant) - jour(d)) / 864e5);
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export const heure = (ts: number): string => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};
