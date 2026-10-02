// Types des tables Supabase (projet « LAVA HUB »), au format attendu par supabase-js.
// Écrits d'après la base et les fichiers supabase-*.sql. Les colonnes jsonb restent en `Json` ici :
// leur forme réelle (deux formats d'allergènes, anciens menus…) est lue et normalisée par src/db/ (étape 3).
// Pour les régénérer depuis la base : npx supabase gen types typescript --project-id qmvxmxzsmpigvseuidcd
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Role = 'admin' | 'salle' | 'cuisine';
export type Equipe = 'cuisine' | 'salle';

export interface Database {
  public: {
    Tables: {
      fiches: Table<{
        id: string;
        nom: string;
        categorie: string | null;
        quantite_nette: string | null;
        conditionnement: string | null;   // tableau JSON sérialisé en texte : '["Sac sous vide — 850 g"]'
        allergenes: Json;                 // « Gluten, Lactose » OU ["Gluten","Lactose"]
        ingredients: Json;
        process: Json;
        modifie_par: string | null;
        modifie_le: string | null;
      }, 'nom'>;
      fiches_recette: Table<{
        id: string;
        nom: string;
        statut: string | null;
        photo: string | null;             // image en base64 (data:image/jpeg…), chargée à la demande
        allergenes: string | null;        // calculé par la base
        sous_recettes: Json;
        modifie_par: string | null;
        modifie_le: string | null;
      }, 'nom'>;
      groupes: Table<{
        id: string;
        nom: string;
        date: string;
        heure: string | null;
        pax: number;
        salle: string | null;
        source: string | null;
        menu_id: string | null;
        menu_nom: string | null;
        plats_sur_mesure: Json | null;
        allergenes: string | null;
        regimes: string | null;
        notes: string | null;
        modifie_par: string | null;
        modifie_le: string | null;
      }, 'nom' | 'date' | 'pax'>;
      lava_config: Table<{ id: string; data: Json }, 'id' | 'data'>;
      membres: Table<{
        email: string;
        prenom: string;
        nom: string;
        poste: string;
        equipe: Equipe;
        role: Role;
        actif: boolean;
        compte_cree: boolean;
        doit_changer_mdp: boolean;
      }, 'email' | 'prenom' | 'role'>;
      audit_log: Table<{
        ts: number;
        action: string;
        fiche_nom: string | null;
        profil: string | null;
        detail: Json;
      }, 'ts' | 'action'>;
      sauvegardes: Table<{ id: number; cree_le: string; contenu: Json }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      profils_connexion: { Args: { [_ in never]: never }; Returns: { email: string; prenom: string; nom: string; poste: string; equipe: Equipe; statut: 'actif' | 'ouvert' }[] };
      mdp_change: { Args: { [_ in never]: never }; Returns: undefined };
      sauvegarder_maintenant: { Args: { [_ in never]: never }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
