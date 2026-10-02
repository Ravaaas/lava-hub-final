import { Fragment, useState } from 'react';
import type { Menu } from '../../domain/types';
import { MENUS_DE_DEPART, platAffiche, servicesAffiches } from '../../domain/menus';
import { pluriel } from '../../domain/texte';
import { enregistrerMenus } from '../../db/config';
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

export function Menus() {
  const { menus } = useDonnees();
  const { admin } = useMoi();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const enregistrer = useEnregistrerMenus();
  const [choisi, setChoisi] = useState('');
  const [edition, setEdition] = useState<{ menu: Menu | null } | null>(null);

  const creerMenusDeDepart = () => enregistrer(
    MENUS_DE_DEPART.map(m => ({ id: crypto.randomUUID(), nom: m.nom, services: m.temps.map(nom => ({ nom, plats: [] })) })), 'création menus', 'menus');

  const menu = menus.find(m => m.id === choisi) ?? menus[0];

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
              <button key={m.id} type="button" role="tab" aria-selected={m.id === menu.id} className={`log-filter${m.id === menu.id ? ' active' : ''}`} onClick={() => { setChoisi(m.id); }}>{m.nom}</button>
            ))}
          </div>
          <div className="menu-actions">
            <button type="button" className="btn btn-g btn-sm" onClick={() => { window.print(); }}><Icone nom="printer" />Imprimer</button>
            {admin && <>
              <button type="button" className="btn btn-g btn-sm" onClick={() => { setEdition({ menu }); }}>Modifier</button>
              <button type="button" className="btn btn-d btn-sm" onClick={() => void (async () => {
                if (!await confirmer(`Supprimer le menu "${menu.nom}" ?`)) return;
                if (await enregistrer(menus.filter(m => m.id !== menu.id), 'suppression menu', menu.nom)) notifier('Menu supprimé');
              })()}>Supprimer</button>
            </>}
          </div>
          <FeuilleMenu menu={menu} />
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
    <div className="fdoc">
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
                  <div className="fdoc-stxt">{d.nom}
                    {d.elements.length > 0 && <div className="fdoc-sous">{d.elements.join(' · ')}</div>}
                    {d.allergenes.length > 0 && <div className="fr-sr-allerg" style={{ margin: '0.3rem 0 0' }}><Etiquettes liste={d.allergenes} /></div>}
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
