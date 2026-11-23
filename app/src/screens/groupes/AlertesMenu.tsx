import type { Alerte } from '../../domain/menus';
import { Icone } from '../../ui/Icone';

/** Encadré « Plats à adapter » : chaque plat qui contient une allergie déclarée (allergie libre : où elle a été trouvée), et combien de personnes sont concernées. */
export function AlertesMenu({ alertes }: { alertes: readonly Alerte[] }) {
  if (!alertes.length) return null;
  return (
    <div className="alerte-menu" role="note">
      <div className="alerte-menu-titre"><Icone nom="alert" taille={16} />Plats à adapter</div>
      {alertes.map(a => (
        <div key={a.plat} className="alerte-menu-ligne">
          <span className="alerte-menu-plat">{a.plat}</span> — {a.allergenes.map(x => (a.indices?.[x] ? `${x} (${a.indices[x]})` : x)).join(', ')} · {a.personnes} pers.
        </div>
      ))}
    </div>
  );
}
