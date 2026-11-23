import type { ReactNode } from 'react';
import type { Alerte } from '../../domain/menus';
import { Icone } from '../../ui/Icone';

/**
 * Encadré « Plats à adapter » : chaque plat qui contient une allergie déclarée (allergie libre : où elle a été trouvée),
 * combien de personnes sont concernées et, s'il est prévu, le plat servi à sa place (ligne grise « adapté »).
 * Rouge tant qu'un plat n'est pas adapté ; gris (« Plats adaptés ») quand tous le sont.
 */
export function AlertesMenu({ alertes, adapter }: { alertes: readonly Alerte[]; adapter?: (a: Alerte) => ReactNode }) {
  if (!alertes.length) return null;
  const restants = alertes.filter(a => !a.adapte).length;
  return (
    <div className={`alerte-menu${restants ? '' : ' alerte-menu-ok'}`} role="note">
      <div className="alerte-menu-titre"><Icone nom={restants ? 'alert' : 'check'} taille={16} />{restants ? 'Plats à adapter' : 'Plats adaptés'}</div>
      {alertes.map(a => (
        <div key={a.plat} className={`alerte-menu-ligne${a.adapte ? ' alerte-menu-adapte' : ''}`}>
          <span className="alerte-menu-plat">{a.plat}</span> — {a.allergenes.map(x => (a.indices?.[x] ? `${x} (${a.indices[x]})` : x)).join(', ')} · {a.personnes} pers.
          {a.remplacants && (a.adapte ? ` → remplacé par ${a.remplacants.join(', ')}` : ` → ${a.remplacants.join(', ')} : pas assez pour ${a.personnes} pers.`)}
          {adapter?.(a)}
        </div>
      ))}
    </div>
  );
}
