import { supabase } from '../lib/supabase';
import type { ContactGroupe, Groupe, Niveau, PlatCompte, Profil } from '../domain/types';
import { avecEffectifs, joindre, listeAllergenes, separerEffectifs } from '../domain/allergenes';
import { lirePlat } from './config';
import { lireMontant, lireReglement, profilsDepuisAnciens, resumeProfils } from '../domain/groupes';
import { objet, tableau, texte, textes } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

// Plat d'un niveau : {frId, qte, remplace?} ou {text, qte, remplace?} ; qte absente ou illisible = pas encore connue.
function lirePlatCompte(v: unknown): PlatCompte | null {
  const p = lirePlat(v);
  const { qte: q, remplace } = objet(v);
  if (!p) return null;
  const lu = { ...p, qte: typeof q === 'number' && Number.isFinite(q) ? q : null };
  return texte(remplace) ? { ...lu, remplace: texte(remplace) } : lu;
}
const lireNiveau = (v: unknown): Niveau => ({ nom: texte(objet(v).nom), plats: tableau(objet(v).plats).map(lirePlatCompte).filter(p => p !== null) });

/** Niveaux enregistrés ; à défaut, les anciens plats sur mesure en un seul niveau sans nom. */
function lireNiveaux(niveaux: unknown, platsSurMesure: unknown): Niveau[] {
  const n = tableau(niveaux).map(lireNiveau);
  if (n.length) return n;
  const plats = tableau(platsSurMesure).map(lirePlat).filter(p => p !== null).map(p => ({ ...p, qte: null }));
  return plats.length ? [{ nom: '', plats }] : [];
}

// Profil : {nb, allergenes, regimes} ; nombre illisible = 1 personne ; ligne sans allergie ni régime ignorée.
function lireProfil(v: unknown): Profil | null {
  const o = objet(v);
  const nb = typeof o.nb === 'number' && Number.isInteger(o.nb) && o.nb > 0 ? o.nb : 1;
  const p = { nb, allergenes: textes(o.allergenes), regimes: textes(o.regimes) };
  return p.allergenes.length || p.regimes.length ? p : null;
}

export async function chargerGroupes(): Promise<Groupe[]> {
  const { data, error } = await supabase.from('groupes').select('*').order('date');
  if (error) throw new Error(error.message);
  return data.map(l => {
    // profils enregistrés ; à défaut (anciens groupes), une ligne par allergie et par régime des colonnes texte
    const lus = tableau(l.profils).map(lireProfil).filter(p => p !== null);
    const al = separerEffectifs(listeAllergenes(l.allergenes));
    const re = separerEffectifs(listeAllergenes(l.regimes));
    const profils = lus.length ? lus : profilsDepuisAnciens(al.noms, re.noms, { ...al.effectifs, ...re.effectifs });
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
    profils,
    ...resumeProfils(profils),
    notes: l.notes ?? '',
    boissons: texte(l.boissons),
    reglement: lireReglement(l.reglement),
    montant: lireMontant(l.montant),
    referent: texte(l.referent),
    };
  });
}

// Les colonnes texte gardent le résumé des profils, nombres compris (« Gluten (2), Lactose (1) ») : lisible par les versions d'avant.
const versPlat = (p: PlatCompte) => ({ ...('frId' in p ? { frId: p.frId } : { text: p.texte }), qte: p.qte, ...(p.remplace ? { remplace: p.remplace } : {}) });
// plats_sur_mesure (liste plate, sans quantités) reste écrit pour un groupe sans menu choisi : lisible par les versions d'avant.
const versLigne = ({ effectifs, niveaux, profils, ...g }: Omit<Groupe, 'id'>) => ({
  ...g,
  profils: profils.map(p => ({ nb: p.nb, allergenes: p.allergenes, regimes: p.regimes })),
  niveaux: niveaux.map(n => ({ nom: n.nom, plats: n.plats.map(versPlat) })),
  plats_sur_mesure: g.menu_id ? [] : niveaux.flatMap(n => n.plats).map(p => ('frId' in p ? { frId: p.frId } : { text: p.texte })),
  allergenes: joindre(avecEffectifs(g.allergenes, effectifs)), regimes: joindre(avecEffectifs(g.regimes, effectifs)),
});

/** id choisi par l'app : les coordonnées du référent s'enregistrent juste après avec le même id. */
export const creerGroupe = (id: string, g: Omit<Groupe, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').insert({ id, ...versLigne(g) }).select('id')));

export const modifierGroupe = (id: string, g: Omit<Groupe, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').update(versLigne(g)).eq('id', id).select('id')));

export const supprimerGroupe = (id: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').delete().eq('id', id).select('id')));

// ── Coordonnées des référents (table groupes_contacts : admin et salle ; la cuisine reçoit une liste vide) ──

export async function chargerContacts(): Promise<ContactGroupe[]> {
  const { data, error } = await supabase.from('groupes_contacts').select('groupe_id, nom, email, telephone, groupe, date_groupe');
  if (error) throw new Error(error.message);
  return data.map(l => ({ groupe_id: l.groupe_id ?? null, nom: texte(l.nom), email: texte(l.email), telephone: texte(l.telephone), groupe: texte(l.groupe), date_groupe: l.date_groupe ?? null }));
}

/** Une ligne par groupe (remplacée à chaque enregistrement) ; nom et date du groupe recopiés pour la base de contacts. */
export const enregistrerContact = (c: ContactGroupe & { groupe_id: string }): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes_contacts').upsert(c, { onConflict: 'groupe_id' }).select('groupe_id')));
