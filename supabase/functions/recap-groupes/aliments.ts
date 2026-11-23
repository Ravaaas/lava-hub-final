// Aliments reconnus dans les plats : familles de mots (viande, fromage, fruits de mer…) et ce que chaque régime exclut.
// Une seule liste pour l'app (alertes « Plats à adapter » du formulaire et de la fiche) et pour la fonction d'envoi du lundi :
// l'app importe ce fichier (app/src/domain/menus.ts), la fonction le déploie avec ses autres fichiers.
// C'est une AIDE : seuls les ingrédients écrits dans les fiches techniques, les éléments des fiches recette et le nom du plat sont lus,
// et un aliment absent de ces listes n'est trouvé que s'il est écrit tel quel. Aucune dépendance (Deno et Vitest lisent ce fichier).

export interface Famille {
  /** Mots qu'on peut écrire à la main pour désigner cette famille (« fromage », « fromages », « fruits de mer »…). */
  cles: string[];
  /** Aliments de la famille, tels qu'ils s'écrivent dans une fiche (accents, majuscules et pluriels n'ont pas d'importance). */
  termes: string[];
  /** Ce qui ressemble à la famille sans en être (« lait de coco » n'est pas du lait) : retiré du texte avant la recherche. */
  sans?: RegExp;
}

/** Texte comparé sans accents ni majuscules, œ = oe, tirets et apostrophes = espaces. */
export const norm = (t: string): string =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();

const VEGETAL = /\b(lait|creme|beurre|fromage|yaourt|yogourt|yoghourt|chantilly)( de | d | )(coco|amande|soja|avoine|riz|noisette|cajou|cacahuete|cacao|karite|sesame|vegetal|vegan|marron|chataigne|cassis|menthe|banane|mure|peche|framboise|pistache)\b/g;

const CHARCUTERIE_PORC = ["porc", "cochon", "cochonnet", "jambon", "lard", "lardons", "bacon", "chorizo", "saucisson", "saucisse", "pancetta", "guanciale", "coppa", "mortadelle",
  "rillettes", "boudin", "andouille", "andouillette", "couenne", "speck", "prosciutto", "serrano", "ibérique", "pata negra", "nduja", "lomo", "travers", "echine", "saindoux", "lardo"];

const FROMAGES = ["fromage", "fromage blanc", "petit suisse", "faisselle", "mascarpone", "ricotta", "mozzarella", "burrata", "stracciatella", "parmesan", "parmigiano", "grana padano",
  "pecorino", "comté", "beaufort", "abondance", "gruyère", "emmental", "cheddar", "raclette", "reblochon", "cantal", "salers", "laguiole", "morbier", "munster", "maroilles", "époisses",
  "livarot", "pont-l'évêque", "camembert", "brie", "coulommiers", "chaource", "roquefort", "bleu d'auvergne", "bleu de Bresse", "bleu des Causses", "gorgonzola", "stilton", "fourme d'ambert",
  "saint-nectaire", "tomme", "mimolette", "boursin", "feta", "halloumi", "chèvre", "brebis", "ossau-iraty", "manchego", "mahon", "taleggio", "fontina", "provolone", "paneer", "quark"];

const VOLAILLE = ["volaille", "poulet", "poule", "poularde", "chapon", "dinde", "pintade", "caille", "pigeon", "pigeonneau", "canard", "magret", "oie", "foie gras", "blanc de poulet"];

const VIANDE = ["viande", "charcuterie", ...VOLAILLE, ...CHARCUTERIE_PORC, "bœuf", "veau", "agneau", "mouton", "sanglier", "cerf", "biche", "chevreuil", "lapin", "lièvre", "gibier", "entrecôte",
  "filet mignon", "onglet", "bavette", "hampe", "jarret", "ris de veau", "tripes", "foie", "merguez", "steak", "bourguignon", "daube", "osso buco", "kebab", "cuisse"];

const POISSON = ["poisson", "saumon", "truite", "thon", "cabillaud", "morue", "bar", "loup de mer", "dorade", "daurade", "sole", "turbot", "lotte", "raie", "merlu", "lieu jaune", "lieu noir",
  "maquereau", "sardine", "anchois", "hareng", "esturgeon", "caviar", "tarama", "bonite", "rouget", "saint-pierre", "barbue", "flétan", "haddock", "anguille", "brochet", "sandre", "perche",
  "omble", "surimi", "bottarga", "poutargue", "garum", "nuoc mam", "dashi", "katsuobushi", "espadon", "carpe", "éperlan", "églefin", "limande", "mulet", "tilapia", "pangasius", "colin", "congre",
  "requin", "ikura", "tobiko", "sashimi", "sushi", "ceviche", "gravlax", "œufs de poisson", "œufs de saumon"];

const FRUITS_DE_MER = ["fruits de mer", "fruit de mer", "crevette", "gambas", "gamba", "langoustine", "homard", "crabe", "tourteau", "araignée de mer", "étrille", "langouste", "écrevisse",
  "crustace", "bisque", "huître", "moule", "saint-jacques", "palourde", "praire", "bulot", "bigorneau", "escargot", "poulpe", "seiche", "calamar", "calmar", "encornet", "oursin", "ormeau",
  "couteau", "pétoncle", "coquillage", "mollusque", "cigale de mer"];

const LAITAGE = ["lait", "laitage", "produit laitier", "crème", "crème fraîche", "chantilly", "beurre", "ghee", "yaourt", "yogourt", "yoghourt", "kefir", "lait ribot", "skyr", ...FROMAGES];

export const FAMILLES: Record<string, Famille> = {
  viande: { cles: ["viande", "charcuterie"], termes: VIANDE, sans: /\bpieds? de mouton\b/g },
  volaille: { cles: ["volaille"], termes: VOLAILLE },
  porc: { cles: ["porc", "cochon"], termes: [...CHARCUTERIE_PORC, "gélatine", "pied de porc"] },
  poisson: { cles: ["poisson"], termes: POISSON },
  "fruits de mer": { cles: ["fruit de mer", "fruits de mer", "coquillage"], termes: FRUITS_DE_MER },
  laitage: { cles: ["laitage", "produit laitier", "produits laitiers", "lait"], termes: LAITAGE, sans: VEGETAL },
  fromage: { cles: ["fromage"], termes: FROMAGES, sans: VEGETAL },
  oeuf: { cles: ["œuf"], termes: ["œuf", "jaune d'œuf", "blanc d'œuf", "meringue", "mayonnaise", "mayo", "aioli", "hollandaise", "béarnaise", "sabayon", "omelette", "crème anglaise", "crème brûlée", "crème pâtissière"] },
  miel: { cles: ["miel"], termes: ["miel", "hydromel"] },
  alcool: { cles: ["alcool"], termes: ["alcool", "vin", "cognac", "armagnac", "calvados", "rhum", "whisky", "vodka", "gin", "bière", "champagne", "prosecco", "porto", "xérès", "madère", "marsala",
    "vermouth", "pastis", "anisette", "liqueur", "kirsch", "grand marnier", "cointreau", "amaretto", "sake", "mirin", "cidre", "eau-de-vie", "tequila", "mezcal", "limoncello", "chartreuse",
    "bourbon", "brandy", "sherry", "sangria", "sauternes", "banyuls", "pineau", "flambé"] },
  "fruits rouges": { cles: ["fruit rouge", "fruits rouges", "baie"], termes: ["fruits rouges", "fruit rouge", "fraise", "framboise", "cerise", "griotte", "myrtille", "mûre", "groseille", "cassis",
    "airelle", "canneberge", "cranberry", "baie", "fruits des bois", "goji"] },
  agrumes: { cles: ["agrume"], termes: ["agrume", "citron", "citron vert", "citron caviar", "orange", "pamplemousse", "mandarine", "clémentine", "pomelo", "yuzu", "bergamote", "lime", "kumquat",
    "combava", "cédrat"] },
  "fruits exotiques": { cles: ["fruit exotique", "fruits exotiques"], termes: ["fruits exotiques", "fruit exotique", "mangue", "ananas", "kiwi", "papaye", "fruit de la passion", "passion", "litchi",
    "banane", "goyave", "pitaya", "carambole", "ramboutan", "mangoustan"] },
  champignon: { cles: ["champignon"], termes: ["champignon", "champignon de paris", "cèpe", "girolle", "morille", "pleurote", "shiitake", "shitake", "truffe", "trompette", "chanterelle", "enoki",
    "bolet", "mousseron", "eryngi", "maitake"] },
  alliacee: { cles: ["alliacée"], termes: ["ail", "oignon", "échalote", "poireau", "ciboulette", "ciboule", "ail des ours"] },
  legumineuse: { cles: ["légumineuse", "légume sec"], termes: ["pois chiche", "lentille", "haricot", "fève", "flageolet", "pois casse", "pois", "edamame", "houmous", "falafel", "dahl", "dal"] },
  chocolat: { cles: ["chocolat"], termes: ["chocolat", "cacao", "gianduja", "ganache"] },
};

/** Ce que chaque régime exclut : familles d'aliments à repérer dans les plats (Casher : aucune, il dépend de la préparation). */
export const REGLES_REGIMES: Record<string, readonly string[]> = {
  "Végétarien": ["viande", "poisson", "fruits de mer"],
  "Végétalien": ["viande", "poisson", "fruits de mer", "laitage", "oeuf", "miel"],
  "Sans viande": ["viande"],
  "Sans porc": ["porc"],
  "Sans alcool": ["alcool"],
  "Halal": ["porc", "alcool"],
};

/** Allergènes déclarés sur la fiche d'un plat qui contredisent déjà un régime (sans lire les ingrédients). */
const ALLERGENES_REGIMES: Record<string, readonly string[]> = {
  "Végétarien": ["Poisson", "Crustacé", "Mollusque"],
  "Végétalien": ["Poisson", "Crustacé", "Mollusque", "Lactose", "Œuf"],
};

/** Famille désignée par un mot écrit à la main (« Fromages » → fromage), sinon undefined. */
export function familleDuMot(mot: string): Famille | undefined {
  const m = norm(mot), sing = m.replace(/[sx]$/, "");
  return Object.values(FAMILLES).find((f) => f.cles.some((c) => norm(c) === m || norm(c) === sing));
}

const regexes = new Map<string, RegExp>();
function regexTerme(terme: string): RegExp {
  let re = regexes.get(terme);
  if (!re) {
    const t = norm(terme).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(^|[^a-z0-9])${t}(s|x)?($|[^a-z0-9])`);
    regexes.set(terme, re);
  }
  return re;
}

/** Premier aliment de la liste écrit dans l'un des textes : le mot trouvé (comme dans la liste) et le texte où il se trouve. */
export function trouverTerme(termes: readonly string[], textes: readonly string[], sans?: RegExp): { terme: string; texte: string } | undefined {
  const normes = textes.map((t) => ({ t, n: sans ? norm(t).replace(sans, " ") : norm(t) }));
  for (const terme of termes) {
    const re = regexTerme(terme);
    const trouve = normes.find((x) => re.test(x.n));
    if (trouve) return { terme, texte: trouve.t };
  }
  return undefined;
}

/** Ce qu'un régime exclut, trouvé dans les allergènes déclarés du plat, puis dans ses textes : l'aliment (par exemple « bœuf » pour un végétarien). */
export function trouverPourRegime(regime: string, textes: readonly string[], allergenes: readonly string[] = []): { terme: string; texte: string } | undefined {
  const declare = allergenes.find((a) => ALLERGENES_REGIMES[regime]?.includes(a));
  if (declare) return { terme: declare, texte: declare };
  for (const id of REGLES_REGIMES[regime] ?? []) {
    const f = FAMILLES[id];
    const trouve = f && trouverTerme(f.termes, textes, f.sans);
    if (trouve) return trouve;
  }
  return undefined;
}
