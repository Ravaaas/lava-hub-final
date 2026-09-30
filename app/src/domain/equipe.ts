import type { Equipe, Membre, ProfilConnexion, Role } from './types';
import { compareFr, slug } from './texte';

/** Propriétaire : toujours admin, même absent de la table membres (secours, comme mon_role() dans la base). */
export const ADMIN_SECOURS = 'alexandre.ravasio@outlook.com';
/** Identifiant de connexion fabriqué par l'app, jamais saisi ni affiché. */
export const DOMAINE_CONNEXION = '@lava-hub.local';
export const MDP_MIN = 8;

/** Postes par équipe, du plus haut au plus bas : ordre d'affichage des profils. */
export const POSTES: Record<Equipe, readonly string[]> = {
  cuisine: ['Chef', 'Sous-chef', 'Chef de partie', 'Demi-chef de partie', 'Commis', 'Apprenti'],
  salle: ['Directeur', "Maître d'hôtel", 'Chef de rang', 'Commis', 'Apprenti'],
};

export const ROLES: readonly { valeur: Role; libelle: string }[] = [
  { valeur: 'cuisine', libelle: 'Cuisine (lecture)' },
  { valeur: 'salle', libelle: 'Salle (groupes)' },
  { valeur: 'admin', libelle: 'Admin (tout)' },
];

/** « Julie MARTIN » (écran de connexion) */
export const nomAffiche = (p: { prenom: string; nom: string }): string => `${p.prenom} ${p.nom.toUpperCase()}`.trim();
/** « MARTIN Julie » (liste de l'équipe, classée par nom) */
export const nomListe = (p: { prenom: string; nom: string }): string => `${p.nom.toUpperCase()} ${p.prenom}`.trim();

const parNom = (a: { nom: string; prenom: string }, b: { nom: string; prenom: string }) => compareFr(`${a.nom} ${a.prenom}`, `${b.nom} ${b.prenom}`);

/** Profils d'une équipe : Admin d'abord, puis par poste (hiérarchie), postes inconnus en dernier, puis par nom. */
export function profilsClasses(profils: readonly ProfilConnexion[], equipe: Equipe): ProfilConnexion[] {
  const rang = (p: ProfilConnexion) => {
    if (p.poste === 'Admin') return -1;
    const i = POSTES[equipe].indexOf(p.poste);
    return i < 0 ? 99 : i;
  };
  return profils.filter(p => p.equipe === equipe).sort((a, b) => rang(a) - rang(b) || parNom(a, b));
}

export const membresClasses = (m: readonly Membre[]): Membre[] => [...m].sort(parNom);

/** prenom.nom@lava-hub.local, avec un suffixe (2, 3…) si l'identifiant est déjà pris. '' si le prénom n'a ni lettre ni chiffre. */
export function identifiantPour(prenom: string, nom: string, pris: readonly string[]): string {
  const base = [slug(prenom), slug(nom)].filter(Boolean).join('.');
  if (!base) return '';
  let e = base + DOMAINE_CONNEXION;
  for (let i = 2; pris.includes(e); i++) e = `${base}${i}${DOMAINE_CONNEXION}`;
  return e;
}

/** Liste des postes proposés : celle de l'équipe, plus le poste actuel s'il n'y figure pas (ancien poste conservé). */
export function postesProposes(equipe: Equipe, actuel: string): string[] {
  const l = [...POSTES[equipe]];
  if (actuel && !l.includes(actuel)) l.unshift(actuel);
  return l;
}

/** État affiché d'un membre dans la liste de l'équipe. */
export function etatMembre(m: Membre): string {
  if (!m.actif) return 'Désactivé';
  if (m.doit_changer_mdp) return 'Mot de passe temporaire';
  if (!m.compte_cree) return 'Pas encore connecté';
  return '';
}

export function verifierMotDePasse(a: string, b: string): string | null {
  if (a.length < MDP_MIN) return `${MDP_MIN} caractères minimum`;
  if (a !== b) return 'Les deux mots de passe sont différents';
  return null;
}
