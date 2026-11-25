import { Fragment, useState } from 'react';
import type { Menu } from '../../domain/types';
import { MENUS_DE_DEPART, platAffiche, servicesAffiches } from '../../domain/menus';
import { etatFiche, parTemps, repartir, type EtatFiche } from '../../domain/allergenesMenus';
import { ALLERGENES } from '../../domain/allergenes';
import { pluriel } from '../../domain/texte';
import { enregistrerMenus } from '../../db/config';
import { enregistrerFicheImprimee } from '../../db/allergenesImprimes';
import { Choix } from '../../ui/Choix';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';
import { Etiquettes } from '../../ui/Puces';
import { MenuFormulaire } from './MenuFormulaire';

/** Enregistre la liste complète des menus (une seule ligne en base) et journalise. */
export function useEnregistrerMenus() {
  const { recharger, journal } = useDonnees();
  const notifier = useNotifier();
  return async (menus: readonly Menu[], action: string, nom: string): Promise<boolean> => {
    const r = await enregistrerMenus(menus);
    if (!r.ok) { notifier('Enregistrement impossible : ' + r.message, 'err'); await recharger(); return false; }
    await journal(action, nom);
    await recharger();
    return true;
  };
}

type Vue = 'menu' | 'allergenes';

export function Menus() {
  const { menus, fichesRecette, fichesImprimees, recharger, journal } = useDonnees();
  const { admin } = useMoi();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const enregistrer = useEnregistrerMenus();
  const [choisi, setChoisi] = useState('');
  const [vue, setVue] = useState<Vue>('menu');
  const [edition, setEdition] = useState<{ menu: Menu | null } | null>(null);
  const etat = (m: Menu) => etatFiche(m, fichesRecette, fichesImprimees);

  /** Retient la fiche allergènes telle qu'elle est maintenant : « À réimprimer » disparaît jusqu'au prochain changement. */
  const marquerImprimee = async (m: Menu, e: EtatFiche, apresImpression: boolean) => {
    const r = await enregistrerFicheImprimee(m.id, m.nom, e.lignes);
    if (!r.ok) { notifier('Impossible de noter la fiche comme imprimée : ' + r.message, 'err'); return; }
    await journal('impression fiche allergènes', m.nom);
    await recharger();
    if (!apresImpression) notifier('Fiche allergènes notée comme imprimée');
  };

  const creerMenusDeDepart = () => enregistrer(
    MENUS_DE_DEPART.map(m => ({ id: crypto.randomUUID(), nom: m.nom, services: m.temps.map(nom => ({ nom, plats: [] })) })), 'création menus', 'menus');

  const menu = menus.find(m => m.id === choisi) ?? menus[0];
  const etatMenu = menu ? etat(menu) : null;

  return (
    <>
      <div className="ph">
        <div><div className="ph-title">Menus</div><div className="ph-sub">Formules et contenu de chaque menu</div></div>
        <div className="ph-actions">
          {admin && <button type="button" className="btn btn-p" onClick={() => { setEdition({ menu: null }); }}><Icone nom="plus" />Nouveau menu</button>}
        </div>
      </div>
      {!menu ? (
        <div className="es">
          <div className="es-icon"><Icone nom="book" taille={20} /></div>
          <h3>Aucun menu</h3>
          <p>{admin ? 'Crée les menus LAVA en un clic, puis ajoute leurs plats.' : 'Les menus seront affichés ici.'}</p>
          {admin && <button type="button" className="btn btn-p" style={{ marginTop: '1rem' }} onClick={() => void creerMenusDeDepart()}>Créer les 4 menus (Lunch, Carte du soir, 3 temps, 5 temps)</button>}
        </div>
      ) : (
        <>
          <div className="log-filters" role="tablist" style={{ flexWrap: 'wrap' }}>
            {menus.map(m => (
              <button key={m.id} type="button" role="tab" aria-selected={m.id === menu.id} className={`log-filter${m.id === menu.id ? ' active' : ''}`} onClick={() => { setChoisi(m.id); }}>
                {m.nom}{etat(m).ecart && <span className="tag tag-danger alg-pastille">À réimprimer</span>}
              </button>
            ))}
          </div>
          {etatMenu && <AlerteReimpression etat={etatMenu} vue={vue} onVoir={() => { setVue('allergenes'); }}
            onMarquer={() => void (async () => {
              if (await confirmer('Noter la fiche allergènes de « ' + menu.nom + ' » comme réimprimée ? Fais-le seulement si la fiche affichée en salle est bien la nouvelle.', 'Marquer comme imprimée')) await marquerImprimee(menu, etatMenu, false);
            })()} />}
          <div className="menu-actions">
            <Choix libelle="Feuille affichée" valeur={vue} onChange={setVue} options={[{ valeur: 'menu', libelle: 'Menu' }, { valeur: 'allergenes', libelle: 'Fiche allergènes' }]} />
            <span className="menu-actions-espace" />
            <button type="button" className="btn btn-g btn-sm" onClick={() => {
              window.print();
              if (vue === 'allergenes' && etatMenu) void marquerImprimee(menu, etatMenu, true);
            }}><Icone nom="printer" />Imprimer</button>
            {admin && <>
              <button type="button" className="btn btn-g btn-sm" onClick={() => { setEdition({ menu }); }}>Modifier</button>
              <button type="button" className="btn btn-d btn-sm" onClick={() => void (async () => {
                if (!await confirmer(`Supprimer le menu "${menu.nom}" ?`)) return;
                if (await enregistrer(menus.filter(m => m.id !== menu.id), 'suppression menu', menu.nom)) notifier('Menu supprimé');
              })()}>Supprimer</button>
            </>}
          </div>
          {vue === 'allergenes' && etatMenu ? <FeuilleAllergenes menu={menu} etat={etatMenu} /> : <FeuilleMenu menu={menu} />}
        </>
      )}
      {edition && <MenuFormulaire menu={edition.menu} onFermer={(id?: string) => { setEdition(null); if (id) setChoisi(id); }} />}
    </>
  );
}

/** Feuille du menu, même mise en page que les autres fiches (écran = impression) : temps, plats numérotés, éléments, allergènes. */
function FeuilleMenu({ menu }: { menu: Menu }) {
  const { fichesRecette, fiches } = useDonnees();
  const services = servicesAffiches(menu).filter(s => s.plats.length || s.nom);
  const total = services.reduce((n, s) => n + s.plats.length, 0);
  // numéro du premier plat de chaque temps : la numérotation continue d'un temps à l'autre
  const debuts = services.map((_, i) => services.slice(0, i).reduce((n, x) => n + x.plats.length, 0));
  return (
    <div className="fdoc fdoc-menu">
      <div className="fdoc-hdr"><div className="fdoc-sur">Menu</div><div className="fdoc-nom">{menu.nom}</div>
        <div className="fdoc-cles"><span>{total ? pluriel(total, 'plat') : 'Aucun plat pour le moment'}</span></div>
      </div>
      <div className="fdoc-body">
        <hr className="fdoc-sep" />
        {services.map((s, i) => (
          <Fragment key={i}>
            <div className="fdoc-ptitle">{s.nom || 'Plats'}</div>
            {!s.plats.length && <div className="ci-label">Aucun plat</div>}
            {s.plats.length > 0 && <div className="fdoc-steps">{s.plats.map((p, k) => {
              const d = platAffiche(p, fichesRecette, fiches);
              return (
                <div key={k} className="fdoc-step"><div className="fdoc-snum">{(debuts[i] ?? 0) + k + 1}</div>
                  <div className="fdoc-stxt fdoc-plat"><span className="fdoc-plat-nom">{d.nom}</span>
                    {d.elements.length > 0 && <div className="fdoc-sous">{d.elements.join(' · ')}</div>}
                    {d.allergenes.length > 0 && <div className="fr-sr-allerg"><Etiquettes liste={d.allergenes} /></div>}
                  </div>
                </div>
              );
            })}</div>}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const dateFr = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
};

/** Hors de la feuille (jamais imprimé) : fiche allergènes à réimprimer, avec ce qui a changé ; ou jamais imprimée depuis le Hub. */
function AlerteReimpression({ etat, vue, onVoir, onMarquer }: { etat: EtatFiche; vue: Vue; onVoir: () => void; onMarquer: () => void }) {
  const { imprimee, changements } = etat;
  if (imprimee && !changements.length) {
    return vue === 'allergenes' ? <div className="alg-etat alg-ok" role="status">Fiche allergènes à jour · imprimée le {dateFr(imprimee.imprimeLe)}{imprimee.imprimePar && ` par ${imprimee.imprimePar}`}</div> : null;
  }
  if (!imprimee) {
    if (vue !== 'allergenes') return null;
    return (
      <div className="alg-etat" role="status">
        <div>Fiche allergènes jamais imprimée depuis le Hub. Imprime-la (ou note-la comme imprimée si la fiche affichée est déjà à jour) : le Hub préviendra dès qu'un plat ou un allergène change.</div>
        <div className="alg-etat-actions"><button type="button" className="btn btn-g btn-sm" onClick={onMarquer}>Marquer comme imprimée</button></div>
      </div>
    );
  }
  return (
    <div className="alg-etat alg-alerte" role="alert">
      <div className="alg-etat-titre">Fiche allergènes à réimprimer</div>
      <div>Imprimée le {dateFr(imprimee.imprimeLe)}{imprimee.imprimePar && ` par ${imprimee.imprimePar}`}. Depuis :</div>
      <ul className="alg-changements">{changements.map(c => <li key={c}>{c}</li>)}</ul>
      <div className="alg-etat-actions">
        {vue !== 'allergenes' && <button type="button" className="btn btn-p btn-sm" onClick={onVoir}>Voir la fiche allergènes</button>}
        <button type="button" className="btn btn-g btn-sm" onClick={onMarquer}>Marquer comme imprimée</button>
      </div>
    </div>
  );
}

/** Fiche allergènes du menu : un tableau plats × 13 allergènes, même dessin que les autres feuilles (écran = impression). */
function FeuilleAllergenes({ menu, etat }: { menu: Menu; etat: EtatFiche }) {
  const groupes = parTemps(etat.lignes);
  const libres = etat.lignes.some(l => l.libre);
  return (
    <div className="fdoc fdoc-allerg">
      <div className="fdoc-hdr"><div className="fdoc-sur">Fiche allergènes</div><div className="fdoc-nom">{menu.nom}</div>
        <div className="fdoc-cles"><span>{etat.lignes.length ? pluriel(etat.lignes.length, 'plat') : 'Aucun plat pour le moment'}</span><span>Édition du {dateFr(new Date().toISOString())}</span></div>
      </div>
      <div className="fdoc-body">
        <hr className="fdoc-sep" />
        {etat.lignes.length > 0 && <div className="alg-defile">
          <table className="fdoc-table alg-table">
            <thead><tr><th scope="col">Plat</th>{ALLERGENES.map(a => <th key={a} scope="col" className="alg-col"><span>{a}</span></th>)}</tr></thead>
            <tbody>{groupes.map((g, i) => (
              <Fragment key={i}>
                {g.temps && <tr className="alg-temps"><td colSpan={ALLERGENES.length + 1}>{g.temps}</td></tr>}
                {g.lignes.map(l => {
                  const { colonnes, autres } = repartir(l.allergenes);
                  return (
                    <tr key={l.cle}>
                      <th scope="row" className="alg-plat">{l.nom}
                        {l.libre && <div className="fdoc-sous">Plat libre : allergènes à vérifier</div>}
                        {autres.length > 0 && <div className="fdoc-sous">Aussi : {autres.join(', ')}</div>}
                      </th>
                      {ALLERGENES.map(a => <td key={a} className="alg-c">{colonnes.has(a) && <span className="alg-x" role="img" aria-label={a}>●</span>}</td>)}
                    </tr>
                  );
                })}
              </Fragment>
            ))}</tbody>
          </table>
        </div>}
        <div className="alg-legende"><span className="alg-x">●</span> = l'allergène est présent dans le plat (calculé depuis les fiches techniques).{libres && ' Les plats libres n\'ont pas de fiche : leurs allergènes sont à vérifier à part.'}</div>
      </div>
    </div>
  );
}
