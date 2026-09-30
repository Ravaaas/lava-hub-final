// Table lava_config : ligne « main » (catégories des fiches techniques) et ligne « menus » ({ items: [...] }).
import { supabase } from '../lib/supabase';
import type { Menu, Plat, Service } from '../domain/types';
import { objet, tableau, texte, textes, versJson } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

export const CATEGORIES_PAR_DEFAUT = ['Base', 'Sauce', 'Garniture', 'Dessert', 'Autre'];

/** Contenu de la ligne « main », gardé tel quel pour ne rien perdre des autres réglages en enregistrant. */
export interface Reglages { categories: string[]; autres: Record<string, unknown> }

export async function chargerReglages(): Promise<Reglages> {
  const { data } = await supabase.from('lava_config').select('data').eq('id', 'main').maybeSingle();
  const { cats, ...autres } = objet(data?.data);
  const categories = textes(cats);
  return { categories: categories.length ? categories : CATEGORIES_PAR_DEFAUT, autres };
}

export const enregistrerReglages = (r: Reglages): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('lava_config').upsert({ id: 'main', data: versJson({ ...r.autres, cats: r.categories }) }).select('id')));

// Anciens menus : liste plate de plats {plats:[...]} → un seul temps sans nom. Plats : {frId} ou {text}.
function lirePlat(v: unknown): Plat | null {
  const o = objet(v);
  if (texte(o.frId)) return { frId: texte(o.frId) };
  return texte(o.text) ? { texte: texte(o.text) } : null;
}
const lireService = (v: unknown): Service => ({ nom: texte(objet(v).nom), plats: tableau(objet(v).plats).map(lirePlat).filter(p => p !== null) });

export function lireMenu(v: unknown): Menu {
  const o = objet(v);
  const services = Array.isArray(o.services) ? o.services.map(lireService) : [{ nom: '', plats: tableau(o.plats).map(lirePlat).filter(p => p !== null) }];
  return { id: texte(o.id), nom: texte(o.nom), services };
}
const ecrireMenu = (m: Menu) => ({ id: m.id, nom: m.nom, services: m.services.map(s => ({ nom: s.nom, plats: s.plats.map(p => ('frId' in p ? { frId: p.frId } : { text: p.texte })) })) });

export async function chargerMenus(): Promise<Menu[]> {
  const { data, error } = await supabase.from('lava_config').select('data').eq('id', 'menus').maybeSingle();
  if (error) throw new Error(error.message);
  return tableau(objet(data?.data).items).map(lireMenu).filter(m => m.id);
}

export const enregistrerMenus = (menus: readonly Menu[]): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('lava_config').upsert({ id: 'menus', data: versJson({ items: menus.map(ecrireMenu) }) }).select('id')));
