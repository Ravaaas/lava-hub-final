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
  | { type: 'fiche'; id: string; grammage: string }
  | { type: 'libre'; texte: string; grammage: string };

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

export interface Groupe {
  id: string;
  nom: string;
  date: string;
  heure: string;
  pax: number;
  salle: string;
  source: string;
  menu_id: string | null;
  menu_nom: string | null;
  allergenes: string[];
  regimes: string[];
  /** Nombre de personnes concernées par allergie ou régime (facultatif, par nom). */
  effectifs: Record<string, number>;
  notes: string;
}

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
