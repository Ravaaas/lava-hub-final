import { Icone } from './Icone';

/** Puces cochables (allergènes, régimes). */
export function Puces({ choix, selection, onChange }: { choix: readonly string[]; selection: readonly string[]; onChange: (s: string[]) => void }) {
  const basculer = (a: string) => { onChange(selection.includes(a) ? selection.filter(x => x !== a) : [...selection, a]); };
  return (
    <div className="allerg-picker">
      {choix.map(a => {
        const coche = selection.includes(a);
        return (
          <div key={a} className={`allerg-chip${coche ? ' active' : ''}`} tabIndex={0} role="checkbox" aria-checked={coche}
            onClick={() => { basculer(a); }}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); basculer(a); } }}>
            <span className="achk">{coche && <Icone nom="check" taille={12} />}</span>{a}
          </div>
        );
      })}
    </div>
  );
}

/** Étiquettes d'allergènes (lecture seule). */
export const Etiquettes = ({ liste }: { liste: readonly string[] }) => (
  <>{liste.map(a => <span key={a} className="fr-allerg-tag">{a}</span>)}</>
);

/** Au plus 4 étiquettes à droite d'une ligne de liste, le reste en « +n ». */
export function EtiquettesCompactes({ liste }: { liste: readonly string[] }) {
  if (!liste.length) return null;
  return (
    <div className="fc-tags">
      <Etiquettes liste={liste.slice(0, 4)} />
      {liste.length > 4 && <span className="tag">+{liste.length - 4}</span>}
    </div>
  );
}

/** État vide d'une liste (aucune fiche, aucun résultat…). */
export const Vide = ({ icone, titre, texte }: { icone: 'file' | 'search' | 'book' | 'users'; titre: string; texte: string }) => (
  <div className="es" style={{ gridColumn: '1/-1' }}>
    <div className="es-icon"><Icone nom={icone} taille={20} /></div>
    <h3>{titre}</h3>
    <p>{texte}</p>
  </div>
);
