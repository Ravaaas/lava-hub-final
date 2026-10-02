/** Choix unique parmi quelques options, en boutons côte à côte (remplace un menu déroulant court). */
export function Choix<T extends string>({ libelle, options, valeur, onChange, desactive }: {
  libelle: string; options: readonly { valeur: T; libelle: string }[]; valeur: T; onChange: (v: T) => void; desactive?: boolean;
}) {
  return (
    <div className="choix" role="group" aria-label={libelle}>
      {options.map(o => (
        <button key={o.valeur} type="button" className={`log-filter${o.valeur === valeur ? ' active' : ''}`} aria-pressed={o.valeur === valeur}
          disabled={desactive} onClick={() => { onChange(o.valeur); }}>{o.libelle}</button>
      ))}
    </div>
  );
}
