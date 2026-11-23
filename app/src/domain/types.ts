// Modèle de l'application : les données telles que les écrans les utilisent (déjà normalisées par src/db/).
import type { Equipe, Role } from '../db/database.types';
export type { Equipe, Role };

export interface Ingredient {
  nom: string;
  quantite: string;
  unite: string;
  /** Lien vers une autre fiche technique utilisée comme ingrédient. */
  ficheId?: string;
  /** Quantité brute (avec parure) ; `quantite_net` = quantité après épluchage. */
  brut?: boolean;
  quantite_net?: string;
}

export interface Fiche {
  id: string;
  nom: string;
  categorie: string;
  quantite_nette: string;
  conditionnement: string[];
  allergenes: string[];
  ingredients: Ingredient[];
  process: string[];
}

/** Élément d'une fiche recette, dans l'ordre de dressage : une fiche technique liée ou un élément libre. */
export type Element =
  | { type: 'fiche'; id: string; grammage: string; grammageMenu?: string }
  | { type: 'libre'; texte: string; grammage: string; grammageMenu?: string };
/** Portion d'un plat : à la carte (grammage) ou dans les menus (grammageMenu, sinon le grammage carte). */
export type Portion = 'carte' | 'menu';

export type StatutFR = 'carte' | 'partages' | 'lunch' | 'bestof' | 'archive';

export interface FicheRecette {
  id: string;
  nom: string;
  statut: StatutFR;
  /** Calculés par la base d'après les fiches liées. */
  allergenes: string[];
  elements: Element[];
  /** undefined = pas encore chargée (chargée à la demande) ; null = pas de photo. */
  photo?: string | null;
}

export type Plat = { frId: string } | { texte: string };
export interface Service { nom: string; plats: Plat[] }
export interface Menu { id: string; nom: string; services: Service[] }
/** Plat d'un groupe : le nombre commandé à l'avance (null = pas encore connu). */
export type PlatCompte = Plat & { qte: number | null };
/** Niveau du menu d'un groupe (Entrée, Plat, Dessert…), copié du menu choisi ou composé pour le groupe. */
export interface Niveau { nom: string; plats: PlatCompte[] }

export interface Groupe {
  id: string;
  nom: string;
  date: string;
  heure: string;
  pax: number;
  salle: string;
  menu_id: string | null;
  menu_nom: string | null;
  /** Niveaux du menu du groupe, avec le nombre de chaque plat. Vide = pas encore composé (on reprend alors le menu choisi). */
  niveaux: Niveau[];
  /** Personnes avec allergies ou régimes : une ligne par personne (ou par personnes qui ont exactement les mêmes). */
  profils: Profil[];
  /** Résumé des profils (calculé) : allergies et régimes du groupe, et nombre de personnes concernées par chacun. */
  allergenes: string[];
  regimes: string[];
  effectifs: Record<string, number>;
  notes: string;
  /** Boissons précommandées (texte libre). */
  boissons: string;
  reglement: Reglement;
  /** Montant de l'empreinte, de l'acompte ou du règlement, en euros ; null = non précisé (toujours null si rien reçu). */
  montant: number | null;
  /** Nom de la personne référente du groupe (imprimé sur la fiche). */
  referent: string;
}

/** nb personnes qui ont toutes ces allergies et ces régimes (ex. 1 personne Œuf + Moutarde). */
export interface Profil { nb: number; allergenes: string[]; regimes: string[] }

/** Coordonnées du référent d'un groupe (table groupes_contacts : admin et salle seulement). groupe_id null = groupe supprimé. */
export interface ContactGroupe {
  groupe_id: string | null;
  nom: string;
  email: string;
  telephone: string;
  groupe: string;
  date_groupe: string | null;
}

/** Où en est le paiement du groupe. */
export type Reglement = 'aucun' | 'empreinte' | 'acompte' | 'regle';

export interface Membre {
  email: string;
  prenom: string;
  nom: string;
  poste: string;
  equipe: Equipe;
  role: Role;
  actif: boolean;
  compte_cree: boolean;
  doit_changer_mdp: boolean;
}

export interface ProfilConnexion {
  email: string;
  prenom: string;
  nom: string;
  poste: string;
  equipe: Equipe;
  /** « ouvert » = pas encore de mot de passe : première connexion. */
  premiereConnexion: boolean;
}

export interface EvenementJournal {
  ts: number;
  action: string;
  ficheNom: string;
  par: string;
  detail: string[];
}
