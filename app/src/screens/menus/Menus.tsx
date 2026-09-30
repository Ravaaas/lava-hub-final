import { Fragment, useState } from 'react';
import type { Menu } from '../../domain/types';
import { MENUS_DE_DEPART, platAffiche, servicesAffiches } from '../../domain/menus';
import { enregistrerMenus } from '../../db/config';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';
import { Etiquettes } from '../../ui/Puces';
import { ouvrirPdf } from '../../pdf/commun';
import { pdfMenu } from '../../pdf/menuGroupe';
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
  const { menus, fichesRecette, fiches } = useDonnees();
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
          <div className="cs">
            <div className="cs-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span>{menu.nom}</span>
              <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-g btn-sm" onClick={() => void ouvrirPdf(o => pdfMenu(o, menu, fichesRecette, fiches)).then(ok => { if (!ok) notifier('Erreur à la génération du PDF', 'err'); })}><Icone nom="printer" />Imprimer</button>
                {admin && <>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => { setEdition({ menu }); }}>Modifier</button>
                  <button type="button" className="btn btn-d btn-sm" onClick={() => void (async () => {
                    if (!await confirmer(`Supprimer le menu "${menu.nom}" ?`)) return;
                    if (await enregistrer(menus.filter(m => m.id !== menu.id), 'suppression menu', menu.nom)) notifier('Menu supprimé');
                  })()}>Supprimer</button>
                </>}
              </span>
            </div>
            <div className="cl">
              {servicesAffiches(menu).every(s => !s.plats.length && !s.nom) && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucun plat pour le moment.</div>}
              {servicesAffiches(menu).map((s, i) => (!s.plats.length && !s.nom) ? null : (
                <Fragment key={i}>
                  {s.nom && <div className="fsect">{s.nom}</div>}
                  {!s.plats.length && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucun plat</div>}
                  {s.plats.map((p, k) => {
                    const d = platAffiche(p, fichesRecette, fiches);
                    return (
                      <div key={k} className="ci">
                        <span className="ci-label">{d.nom}
                          {d.elements.length > 0 && <div className="ph-sub" style={{ fontWeight: 400, marginTop: '0.15rem' }}>{d.elements.join(' · ')}</div>}
                        </span>
                        <span><Etiquettes liste={d.allergenes} /></span>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </>
      )}
      {edition && <MenuFormulaire menu={edition.menu} onFermer={(id?: string) => { setEdition(null); if (id) setChoisi(id); }} />}
    </>
  );
}
