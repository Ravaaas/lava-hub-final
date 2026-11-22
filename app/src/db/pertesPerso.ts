// Pertes & Perso : tables perso_* et pertes, Edge Function « recap-pertes » (email hebdomadaire).
import { supabase } from '../lib/supabase';
import { RAISONS, UNITES_PERTE, UNITES_PRODUIT, type CommentairePerso, type Perte, type ProduitPerso, type Raison, type SaisiePerso, type UnitePerte, type UniteProduit, type ValidationPerso } from '../domain/pertesPerso';
import { texte } from './lecture';
import { OK, prudent, verifier, type Resultat } from './resultat';

const unite = <T extends string>(liste: readonly T[], v: string, defaut: T): T => (liste as readonly string[]).includes(v) ? v as T : defaut;
const heure = (iso: string | null | undefined): string => {
  const d = new Date(texte(iso));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
};

export interface Periode {
  produits: ProduitPerso[];
  saisies: SaisiePerso[];
  commentaires: CommentairePerso[];
  validations: ValidationPerso[];
  pertes: Perte[];
}

/** Tout ce qui concerne les jours `du` → `au` (inclus), plus la liste complète des produits. */
export async function chargerPeriode(du: string, au: string): Promise<Periode> {
  const [p, s, c, v, l] = await Promise.all([
    supabase.from('perso_produits').select('*').order('cree_le'),
    supabase.from('perso_saisies').select('*').gte('date', du).lte('date', au),
    supabase.from('perso_commentaires').select('*').gte('date', du).lte('date', au).order('modifie_le'),
    supabase.from('perso_validations').select('*').gte('date', du).lte('date', au),
    supabase.from('pertes').select('*').gte('date', du).lte('date', au).order('cree_le'),
  ]);
  const erreur = [p, s, c, v, l].find(r => r.error)?.error;
  if (erreur) throw new Error(erreur.message);
  return {
    produits: (p.data ?? []).map(x => ({ cle: x.cle, nom: x.nom, unite: unite<UniteProduit>(UNITES_PRODUIT, x.unite, 'kg'), categorie: x.categorie || 'Autres', actif: x.actif })),
    saisies: (s.data ?? []).map(x => ({ date: x.date, cle: x.produit_cle, quantite: Number(x.quantite) || 0, par: x.saisi_par, email: x.saisi_email })),
    commentaires: (c.data ?? []).map(x => ({ date: x.date, email: x.email, nom: x.nom, texte: x.texte, heure: heure(x.modifie_le) })),
    validations: (v.data ?? []).map(x => ({ date: x.date, le: x.valide_le, par: x.valide_par })),
    pertes: (l.data ?? []).map(x => ({
      id: x.id, date: x.date, produit: x.produit, quantite: Number(x.quantite) || 0, unite: unite<UnitePerte>(UNITES_PERTE, x.unite, 'kg'),
      raison: unite<Raison>(RAISONS, x.raison, 'Autre'), precision: x.precision, par: x.saisi_par, email: x.saisi_email, heure: heure(x.cree_le),
    })),
  };
}

/** Quantités d'un jour : null = effacer la ligne. Le nom de la personne est rempli par la base. */
export const enregistrerQuantites = (date: string, items: readonly [cle: string, quantite: number | null][], moi: { prenom: string; email: string }): Promise<Resultat> =>
  prudent(async () => {
    const aGarder = items.filter((x): x is [string, number] => x[1] !== null);
    const aEffacer = items.filter(x => x[1] === null).map(x => x[0]);
    if (aGarder.length) {
      const r = verifier(await supabase.from('perso_saisies')
        .upsert(aGarder.map(([cle, quantite]) => ({ date, produit_cle: cle, quantite, saisi_par: moi.prenom, saisi_email: moi.email })), { onConflict: 'date,produit_cle' })
        .select('produit_cle'));
      if (!r.ok) return r;
    }
    // effacer une ligne déjà absente n'est pas une erreur : pas de vérification du nombre de lignes ici
    for (const cle of aEffacer) {
      const { error } = await supabase.from('perso_saisies').delete().eq('date', date).eq('produit_cle', cle).select('produit_cle');
      if (error) return { ok: false, message: error.message };
    }
    return OK;
  });

/** Mon commentaire du jour (texte vide = le retirer). */
export const enregistrerCommentaire = (date: string, moi: { prenom: string; email: string }, t: string): Promise<Resultat> =>
  prudent(async () => {
    if (!t.trim()) {
      const { error } = await supabase.from('perso_commentaires').delete().eq('date', date).eq('email', moi.email).select('date');
      return error ? { ok: false, message: error.message } : OK;
    }
    return verifier(await supabase.from('perso_commentaires')
      .upsert({ date, email: moi.email, nom: moi.prenom, texte: t.trim().slice(0, 1000) }, { onConflict: 'date,email' }).select('date'));
  });

export const validerJournee = (date: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('perso_validations').upsert({ date }, { onConflict: 'date' }).select('date')));

export const rouvrirJournee = (date: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('perso_validations').delete().eq('date', date).select('date')));

export const ajouterPerte = (p: Omit<Perte, 'id' | 'heure'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('pertes').insert({
    date: p.date, produit: p.produit.trim().toUpperCase().slice(0, 80), quantite: p.quantite, unite: p.unite, raison: p.raison,
    precision: p.precision.trim().slice(0, 300), saisi_par: p.par, saisi_email: p.email,
  }).select('id')));

export const supprimerPerte = (id: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('pertes').delete().eq('id', id).select('id')));

/** Nouveau produit, ou produit retiré remis dans la liste. */
export const enregistrerProduit = (p: ProduitPerso): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('perso_produits').upsert({ cle: p.cle, nom: p.nom, unite: p.unite, categorie: p.categorie, actif: p.actif }, { onConflict: 'cle' }).select('cle')));

/** Retirer = masquer de la saisie : les quantités déjà notées restent dans les récaps. */
export const retirerProduit = (cle: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('perso_produits').update({ actif: false }).eq('cle', cle).select('cle')));

export async function recapDejaEnvoye(semaine: string): Promise<{ le: string; a: string } | null> {
  const { data } = await supabase.from('perso_recaps').select('*').eq('semaine', semaine).maybeSingle();
  return data ? { le: data.envoye_le, a: data.destinataire } : null;
}

/** Edge Function « recap-pertes » : envoie par email le récap de la semaine commençant `semaine` (lundi). */
export async function envoyerRecap(semaine: string): Promise<Resultat & { destinataire?: string }> {
  try {
    const res: { data: { ok: boolean; message?: string; destinataire?: string } | null; error: unknown } =
      await supabase.functions.invoke<{ ok: boolean; message?: string; destinataire?: string }>('recap-pertes', { body: { semaine } });
    const data = res.data;
    if (res.error || !data) return { ok: false, message: 'La fonction « recap-pertes » est absente ou en erreur' };
    return data.ok ? { ok: true, ...(data.destinataire ? { destinataire: data.destinataire } : {}) } : { ok: false, message: data.message ?? 'Refusé' };
  } catch { return { ok: false, message: 'La fonction « recap-pertes » est indisponible' }; }
}

/** Mise à jour en direct des tables Pertes & Perso. Renvoie la fonction d'arrêt. */
export function surModificationPerso(rappel: () => void): () => void {
  const canal = (['perso_produits', 'perso_saisies', 'perso_commentaires', 'perso_validations', 'pertes'] as const)
    .reduce((c, table) => c.on('postgres_changes', { event: '*', schema: 'public', table }, rappel), supabase.channel('lava-perso'))
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}
