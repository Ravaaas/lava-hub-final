// Pertes & Perso : repas du personnel (quantités utilisées par jour) et pertes diverses.
// Règles pures, sans base ni écran (testées dans domain.test.ts).

export const UNITES_PRODUIT = ['kg', 'L', 'pièce'] as const;
export const UNITES_PERTE = ['kg', 'L', 'pièce', 'portion'] as const;
export const RAISONS = ['DLC dépassée', 'Non conforme', 'Abîmé / cassé', 'Erreur de préparation', 'Retour client', 'Autre'] as const;
export type UniteProduit = typeof UNITES_PRODUIT[number];
export type UnitePerte = typeof UNITES_PERTE[number];
export type Raison = typeof RAISONS[number];

export interface ProduitPerso { cle: string; nom: string; unite: UniteProduit; categorie: string; actif: boolean }
export interface SaisiePerso { date: string; cle: string; quantite: number; par: string; email: string }
export interface CommentairePerso { date: string; email: string; nom: string; texte: string; heure: string }
export interface ValidationPerso { date: string; le: string; par: string }
export interface Perte { id: string; date: string; produit: string; quantite: number; unite: UnitePerte; raison: Raison; precision: string; par: string; email: string; heure: string }

/** « Sauté de dinde » → « saute_de_dinde » (identifiant stable d'un produit, comme dans l'ancien Google Sheet). */
export function cleProduit(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'produit';
}

/** Saisie d'une quantité : « 1,5 » → 1.5 ; vide → null ; invalide (lettres, négatif, ≥ max) → NaN. */
export function lireQuantite(s: string, max = 1000): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 && v < max ? v : NaN;
}

/** 1.5 → « 1,5 » ; arrondi au gramme. */
export const quantiteFr = (v: number | null | undefined): string => (v == null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));

/** Produits actifs groupés par catégorie, dans l'ordre d'apparition des catégories. */
export function parCategorie<T extends { categorie: string }>(produits: readonly T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const p of produits) m.set(p.categorie || 'Autres', [...(m.get(p.categorie || 'Autres') ?? []), p]);
  return [...m];
}

// ── Dates (format AAAA-MM-JJ, heure de Paris) ──
const enDate = (d: string) => { const [a, m, j] = d.split('-').map(Number); return new Date(a ?? 0, (m ?? 1) - 1, j ?? 1, 12); };
const versTexte = (x: Date) => x.toLocaleDateString('sv-SE');
export const decaler = (d: string, n: number): string => { const x = enDate(d); x.setDate(x.getDate() + n); return versTexte(x); };
/** Lundi de la semaine d'une date. */
export const lundi = (d: string): string => decaler(d, -((enDate(d).getDay() + 6) % 7));
/** Les 7 jours (lundi → dimanche) de la semaine commençant `l`. */
export const joursSemaine = (l: string): string[] => Array.from({ length: 7 }, (_, i) => decaler(l, i));
export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
/** « lundi 3 novembre » */
export const jourLong = (d: string): string => enDate(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
/** « 03/11 » */
export const jourCourt = (d: string): string => { const [, m, j] = d.split('-'); return `${j}/${m}`; };

/** Tableau de la semaine : une ligne par produit utilisé (quantité par jour + total), dans l'ordre de la liste. */
export interface LigneRecap { cle: string; nom: string; unite: string; categorie: string; parJour: number[]; total: number }
export function recapSemaine(l: string, saisies: readonly SaisiePerso[], produits: readonly ProduitPerso[]): LigneRecap[] {
  const jours = joursSemaine(l);
  const lignes = new Map<string, LigneRecap>();
  const connu = new Map(produits.map(p => [p.cle, p]));
  for (const s of saisies) {
    const i = jours.indexOf(s.date);
    if (i < 0 || !(s.quantite > 0)) continue;
    const p = connu.get(s.cle);
    const ligne = lignes.get(s.cle) ?? { cle: s.cle, nom: p?.nom ?? s.cle, unite: p?.unite ?? '', categorie: p?.categorie ?? 'Produits retirés', parJour: [0, 0, 0, 0, 0, 0, 0], total: 0 };
    ligne.parJour[i] = (ligne.parJour[i] ?? 0) + s.quantite;
    ligne.total += s.quantite;
    lignes.set(s.cle, ligne);
  }
  const ordre = new Map(produits.map((p, i) => [p.cle, i]));
  return [...lignes.values()].sort((a, b) => (ordre.get(a.cle) ?? 1e9) - (ordre.get(b.cle) ?? 1e9));
}

/** Message d'erreur d'une perte avant envoi, ou '' si elle est complète. */
export function erreurPerte(p: { produit: string; quantite: number | null; raison: string; precision: string }): string {
  if (!p.produit.trim()) return 'Indique le produit ou la recette.';
  if (p.quantite === null || Number.isNaN(p.quantite) || p.quantite <= 0) return 'Indique la quantité perdue.';
  if (!(RAISONS as readonly string[]).includes(p.raison)) return 'Choisis une raison.';
  if (p.raison === 'Autre' && !p.precision.trim()) return 'Précise la raison.';
  return '';
}

/** Une perte se supprime par la personne qui l'a saisie, ou par l'admin. */
export const peutSupprimerPerte = (p: Perte, email: string, admin: boolean): boolean => admin || p.email === email;

// ── Produits écrits dans les commentaires (« Poireau 260g Poitrine fumée 2.6kg ») ──
// L'équipe note dans le commentaire du jour des produits absents de la liste. Ces règles les retrouvent
// pour les proposer à l'écran ; rien n'est enregistré sans un clic (le texte peut être mal lu).

/** Produit lu dans un commentaire, quantité déjà convertie (g → kg, cl/ml → L). */
export interface ProduitLu { nom: string; quantite: number; unite: UniteProduit }

const MOTS_QTE = /(\d+(?:[.,]\d+)?)\s*(kilogrammes?|kilos?|kgs?|grammes?|grs?|g|litres?|l|cl|ml|pi[eè]ces?|pcs?|p)(?![a-zà-ÿ0-9])/giu;
const CONVERSION: Record<string, [UniteProduit, number]> = { kg: ['kg', 1], g: ['kg', 0.001], l: ['L', 1], cl: ['L', 0.01], ml: ['L', 0.001], p: ['pièce', 1] };
const uniteLue = (u: string): [UniteProduit, number] => {
  const x = u.toLowerCase();
  const k = x.startsWith('k') ? 'kg' : x.startsWith('g') ? 'g' : x.startsWith('cl') ? 'cl' : x.startsWith('ml') ? 'ml' : x.startsWith('l') ? 'l' : 'p';
  return CONVERSION[k] ?? ['kg', 1];
};
const SEPARATEURS = /[.;:!?\n()/]|,(?!\d)|\s[-–+&]\s/;
const MOTS_VIDES = new Set(['et', 'puis', 'avec', 'de', 'du', 'des', 'd', 'le', 'la', 'les', 'l', 'un', 'une', 'x', 'plus', '-', '+', '&']);
/** Nom lisible d'un morceau de texte : dernier membre de phrase, sans « et / de / du » autour, 5 mots au plus. */
function nomLu(morceau: string, garderDebut: boolean): string {
  const parties = morceau.split(SEPARATEURS).map(s => s.trim()).filter(Boolean);
  const partie = (garderDebut ? parties[0] : parties[parties.length - 1]) ?? '';
  const mots = partie.replace(/[’']/g, "' ").split(/\s+/).filter(Boolean);
  const vide = (m: string) => MOTS_VIDES.has(m.toLowerCase().replace(/'$/, ''));
  while (mots.length && vide(mots[0] ?? '')) mots.shift();
  while (mots.length && vide(mots[mots.length - 1] ?? '')) mots.pop();
  const garde = garderDebut ? mots.slice(0, 5) : mots.slice(-5);
  return garde.join(' ').replace(/' /g, "'");
}

/** Paires « nom + quantité + unité » d'un commentaire (formats 260g, 2.6kg, 2,6 kg, 1L, 50cl, 3 pièces / pcs) ;
 *  `reste` = ce qui reste un simple commentaire. Une quantité sans nom (ni avant, ni juste après) est ignorée. */
export function produitsDuCommentaire(texte: string): { produits: ProduitLu[]; reste: string } {
  const produits: ProduitLu[] = [];
  const retire: [number, number][] = [];
  const trouves = [...texte.matchAll(MOTS_QTE)];
  let curseur = 0;
  trouves.forEach((m, i) => {
    const debut = m.index, fin = debut + m[0].length;
    if (debut < curseur) return;
    const [unite, facteur] = uniteLue(m[2] ?? '');
    const valeur = Number((m[1] ?? '').replace(',', '.')) * facteur;
    let nom = nomLu(texte.slice(curseur, debut), false);
    let debutNom = curseur + Math.max(0, texte.slice(curseur, debut).toLowerCase().lastIndexOf(nom.toLowerCase().split(' ')[0] ?? ''));
    let finNom = fin;
    if (!nom) {   // « 260 g de poireau » : le nom vient après la quantité
      const suite = texte.slice(fin, trouves[i + 1]?.index ?? texte.length);
      nom = nomLu(suite, true);
      debutNom = debut;
      finNom = nom ? fin + suite.toLowerCase().indexOf(nom.toLowerCase().split(' ').slice(-1)[0] ?? '') + (nom.split(' ').slice(-1)[0] ?? '').length : fin;
    }
    curseur = Math.max(fin, finNom);
    if (!nom || !(valeur > 0)) return;
    produits.push({ nom: nom.toUpperCase().slice(0, 60), quantite: Math.round(valeur * 1000) / 1000, unite });
    retire.push([debutNom, Math.max(fin, finNom)]);
  });
  let reste = '';
  let pos = 0;
  for (const [a, b] of retire) { reste += texte.slice(pos, a) + ' '; pos = b; }
  reste += texte.slice(pos);
  reste = reste.split(SEPARATEURS).map(s => nomLu(s, true) ? s.trim() : '').filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
  return { produits, reste };
}

/** Clé de rapprochement : sans casse ni accents, au singulier (« Poireaux » = « POIREAU »). */
const cleSinguliere = (nom: string): string => cleProduit(nom.replace(/œ/gi, 'oe')).split('_').map(m => (m.length > 3 ? m.replace(/(s|x)$/, '') : m)).join('_');
/** Produit de la liste (actif d'abord, sinon retiré) qui porte ce nom. */
export function produitDuNom(nom: string, produits: readonly ProduitPerso[]): ProduitPerso | null {
  const c = cleSinguliere(nom);
  const memes = produits.filter(p => p.cle === cleProduit(nom) || cleSinguliere(p.nom) === c || cleSinguliere(p.cle) === c);
  return memes.find(p => p.actif) ?? memes[0] ?? null;
}

const FAMILLES: [string, string[]][] = [
  ['Légumes', ['poireau', 'oignon', 'cebette', 'ciboule', 'echalote', 'ail', 'carotte', 'tomate', 'salade', 'chou', 'champignon', 'poivron', 'courgette', 'aubergine', 'epinard', 'celeri', 'navet', 'betterave', 'radis', 'fenouil', 'potiron', 'courge', 'patate', 'haricot', 'petit_poi', 'persil', 'coriandre', 'ciboulette', 'basilic', 'menthe', 'concombre', 'brocoli', 'pomme_de_terre']],
  ['Charcuterie', ['poitrine', 'lard', 'lardon', 'bacon', 'chorizo', 'saucisson', 'pancetta', 'coppa']],
  ['Viandes', ['poulet', 'boeuf', 'porc', 'veau', 'agneau', 'dinde', 'canard', 'volaille', 'steak', 'hache', 'saucisse', 'jambon']],
  ['Poissons', ['saumon', 'cabillaud', 'thon', 'colin', 'merlu', 'crevette', 'poisson', 'calamar', 'moule']],
  ['Fromages & crèmerie', ['fromage', 'lait', 'creme', 'beurre', 'oeuf', 'yaourt', 'mozzarella', 'parmesan', 'comte', 'emmental', 'cheddar', 'ricotta', 'feta']],
  ['Épicerie', ['riz', 'pate', 'farine', 'sucre', 'huile', 'sel', 'fond', 'bouillon', 'sauce', 'vinaigre', 'semoule', 'lentille', 'pois_chiche', 'conserve', 'epice', 'frit', 'pain', 'chapelure', 'moutarde', 'miel']],
];
/** Catégorie à proposer pour un nouveau produit : celle d'un produit de la liste qui commence par le même mot (« OIGNON FRIT » ← « OIGNON ROUGE »),
 *  sinon d'après une courte liste d'aliments (le mot le plus tôt dans le nom l'emporte : « POITRINE FUMÉE » → Charcuterie), sinon « Autres ».
 *  L'admin la change avant d'ajouter. */
export function categorieProposee(nom: string, produits: readonly ProduitPerso[]): string {
  const mots = cleSinguliere(nom).split('_');
  const voisin = produits.find(p => cleSinguliere(p.nom).split('_')[0] === mots[0]);
  if (voisin) return voisin.categorie;
  const rang = (aliment: string): number => {
    const n = aliment.split('_').length;
    for (let i = 0; i + n <= mots.length; i++) if (mots.slice(i, i + n).join('_') === aliment) return i;
    return 99;
  };
  let meilleur = { cat: 'Autres', rang: 99 };
  for (const [cat, liste] of FAMILLES) for (const a of liste) { const r = rang(a); if (r < meilleur.rang) meilleur = { cat, rang: r }; }
  return meilleur.cat;
}

/** Proposition à valider : un produit lu dans le commentaire d'un jour. `produit` = produit déjà dans la liste (sinon à créer).
 *  `conflit` = raison qui empêche de reporter la quantité (unité différente). */
export interface PropositionPerso { id: string; date: string; auteur: string; nom: string; cle: string; quantite: number; unite: UniteProduit; categorie: string; produit: ProduitPerso | null; conflit: string }

/** Propositions tirées des commentaires, sauf les produits dont la quantité est déjà saisie ce jour-là (déjà traités)
 *  et ceux écartés (`ignores` : identifiants « date|clé »). Un même produit n'est proposé qu'une fois par jour. */
export function propositionsDesCommentaires(commentaires: readonly CommentairePerso[], produits: readonly ProduitPerso[], saisies: readonly SaisiePerso[], ignores: ReadonlySet<string> = new Set()): PropositionPerso[] {
  const saisi = new Set(saisies.filter(s => s.quantite > 0).map(s => `${s.date}|${s.cle}`));
  const vus = new Set<string>();
  const res: PropositionPerso[] = [];
  for (const c of [...commentaires].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const lu of produitsDuCommentaire(c.texte).produits) {
      const produit = produitDuNom(lu.nom, produits);
      const cle = produit?.cle ?? cleProduit(lu.nom);
      const id = `${c.date}|${cle}`;
      if (vus.has(id) || saisi.has(id) || ignores.has(id)) continue;
      vus.add(id);
      res.push({
        id, date: c.date, auteur: c.nom, nom: produit?.nom ?? lu.nom, cle, quantite: lu.quantite, unite: produit?.unite ?? lu.unite,
        categorie: produit?.categorie ?? categorieProposee(lu.nom, produits), produit,
        conflit: produit && produit.unite !== lu.unite ? `La liste compte ce produit en ${produit.unite}, le commentaire en ${lu.unite}.` : '',
      });
    }
  }
  return res;
}
