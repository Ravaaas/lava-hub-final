import { supabase } from '../lib/supabase';
import type { Groupe, Niveau, PlatCompte } from '../domain/types';
import { avecEffectifs, joindre, listeAllergenes, separerEffectifs } from '../domain/allergenes';
import { lirePlat } from './config';
import { objet, tableau, texte } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

// Plat d'un niveau : {frId, qte} ou {text, qte} ; qte absente ou illisible = pas encore connue.
function lirePlatCompte(v: unknown): PlatCompte | null {
  const p = lirePlat(v);
  const q = objet(v).qte;
  return p && { ...p, qte: typeof q === 'number' && Number.isFinite(q) ? q : null };
}
const lireNiveau = (v: unknown): Niveau => ({ nom: texte(objet(v).nom), plats: tableau(objet(v).plats).map(lirePlatCompte).filter(p => p !== null) });

/** Niveaux enregistrés ; à défaut, les anciens plats sur mesure en un seul niveau sans nom. */
function lireNiveaux(niveaux: unknown, platsSurMesure: unknown): Niveau[] {
  const n = tableau(niveaux).map(lireNiveau);
  if (n.length) return n;
  const plats = tableau(platsSurMesure).map(lirePlat).filter(p => p !== null).map(p => ({ ...p, qte: null }));
  return plats.length ? [{ nom: '', plats }] : [];
}

export async function chargerGroupes(): Promise<Groupe[]> {
  const { data, error } = await supabase.from('groupes').select('*').order('date');
  if (error) throw new Error(error.message);
  return data.map(l => {
    const al = separerEffectifs(listeAllergenes(l.allergenes));
    const re = separerEffectifs(listeAllergenes(l.regimes));
    return {
    id: l.id,
    nom: l.nom,
    date: l.date,
    heure: l.heure ?? '',
    pax: l.pax,
    salle: l.salle ?? '',
    menu_id: l.menu_id,
    menu_nom: l.menu_nom,
    niveaux: lireNiveaux(l.niveaux, l.plats_sur_mesure),
    allergenes: al.noms,
    regimes: re.noms,
    effectifs: { ...al.effectifs, ...re.effectifs },
    notes: l.notes ?? '',
    };
  });
}

// Les nombres de personnes sont rangés dans le texte des colonnes existantes : « Gluten (2), Lactose ».
const versPlat = (p: PlatCompte) => ('frId' in p ? { frId: p.frId, qte: p.qte } : { text: p.texte, qte: p.qte });
// plats_sur_mesure (liste plate, sans quantités) reste écrit pour un groupe sans menu choisi : lisible par les versions d'avant.
const versLigne = ({ effectifs, niveaux, ...g }: Omit<Groupe, 'id'>) => ({
  ...g,
  niveaux: niveaux.map(n => ({ nom: n.nom, plats: n.plats.map(versPlat) })),
  plats_sur_mesure: g.menu_id ? [] : niveaux.flatMap(n => n.plats).map(p => ('frId' in p ? { frId: p.frId } : { text: p.texte })),
  allergenes: joindre(avecEffectifs(g.allergenes, effectifs)), regimes: joindre(avecEffectifs(g.regimes, effectifs)),
});

export const creerGroupe = (g: Omit<Groupe, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').insert(versLigne(g)).select('id')));

export const modifierGroupe = (id: string, g: Omit<Groupe, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').update(versLigne(g)).eq('id', id).select('id')));

export const supprimerGroupe = (id: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').delete().eq('id', id).select('id')));
