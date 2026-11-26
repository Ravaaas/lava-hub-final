import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ACTION, carteARelier, coef, ecartEuros, euros, lireMontant, plafondMatiere, pourcent, PROBLEME_COURT, recettesARanger, resume, totalBudgets, verifierCarte, verifierMenu,
  type BudgetMenu, type LigneCarte, type MenuVerifie, type Pastille, type PlatVerifie, type Regles, type Renvoi } from '../../domain/ratio';
import { heureFr, pluriel } from '../../domain/texte';
import { chargerRatio, enregistrerBudget, enregistrerPrixCarte, enregistrerRegles, type DonneesRatio } from '../../db/ratio';
import { lireYokitup } from '../../db/yokitup';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Fenetre } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';

const LIBELLE: Record<Pastille, string> = { vert: 'dans le budget', ambre: 'proche du budget', rouge: 'au-dessus du budget' };

/** Fait défiler jusqu'à une ligne de la feuille et la fait clignoter un instant. */
function viser(ancre: string) {
  const el = document.getElementById(ancre);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('rt-vise');
  void el.getBoundingClientRect();
  el.classList.add('rt-vise');
  window.setTimeout(() => { el.classList.remove('rt-vise'); }, 2200);
}

const dateLecture = (iso: string): string =>
  heureFr(new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }));

/** Onglet Ratio (admin) : coût matière de chaque plat lu dans Yokitup, comparé aux budgets des menus et au prix de la carte. */
export function Ratio() {
  const { menus, fichesRecette, journal } = useDonnees();
  const { moi } = useMoi();
  const notifier = useNotifier();
  const [d, setD] = useState<DonneesRatio | null>(null);
  const [lecture, setLecture] = useState(false);
  const [edition, setEdition] = useState<BudgetMenu | 'regles' | null>(null);

  const charger = useCallback(async () => { setD(await chargerRatio()); }, []);
  // Lecture initiale (système externe) : les données arrivent de façon asynchrone.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void charger(); }, [charger]);

  const relire = async () => {
    setLecture(true);
    const r = await lireYokitup();
    setLecture(false);
    if (!r.ok) notifier(r.message, 'err'); else notifier(`Yokitup relu : ${pluriel(r.recettes ?? 0, 'recette')}`, 'ok');
    await charger();
  };

  if (!d) return <div className="spinner" />;
  const verifies = d.budgets.map(b => verifierMenu(b, menus, fichesRecette, d.recettes, d.liens, d.regles));
  const carte = verifierCarte(d.recettes, d.prixCarte, d.liens, fichesRecette, d.regles);
  const alertes = resume(verifies, carte);
  const aRanger = recettesARanger(d.recettes, verifies, d.liens);
  const aRelier = carteARelier(d.recettes, d.liens);
  // Produits sans prix dans Yokitup (eau, parures, pain rassis…) : comptés 0 €, comme Yokitup ; signalés une seule fois.
  const sansPrix = [...new Set(d.recettes.flatMap(r => r.manquants))].sort((a, b) => a.localeCompare(b, 'fr'));
  const nbLignes = carte.length + verifies.reduce((n, m) => n + m.temps.reduce((k, t) => k + Math.max(1, t.plats.length), 0), 0);

  const enregistrerPrix = async (l: LigneCarte, prix: number | null) => {
    if (prix === l.prixReel) return;
    const r = await enregistrerPrixCarte(l.plat, prix, moi.prenom);
    if (!r.ok) { notifier('Prix non enregistré : ' + r.message, 'err'); return; }
    await journal('prix carte (Ratio)', l.plat, [`${l.prixReel === null ? '—' : euros(l.prixReel)} → ${prix === null ? '—' : euros(prix)}`]);
    await charger();
  };

  return (
    <>
      <div className="ph">
        <div><div className="ph-title">Ratio</div>
          <div className="ph-sub">{d.derniere
            ? <>Coûts Yokitup du {dateLecture(d.derniere.le)}{!d.derniere.ok && <span className="rt-err"> · échec : {d.derniere.message}</span>} · relus chaque nuit</>
            : 'Yokitup n\'a pas encore été lu'}</div></div>
        <div className="ph-actions">
          <button type="button" className="btn btn-o btn-sm" disabled={lecture} onClick={() => void relire()}><Icone nom="refresh" />{lecture ? 'Lecture…' : 'Relire Yokitup'}</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => { setEdition('regles'); }}>Règles</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => { window.print(); }}><Icone nom="printer" />Imprimer</button>
        </div>
      </div>
      {d.sansCouts && d.recettes.length > 0 && <div className="alg-etat" role="status">Les coûts n'ont pas encore été lus : clique « Relire Yokitup ».</div>}
      <Alertes alertes={alertes} />
      {/* longue carte : encore plus serré à l'impression pour rester sur une page */}
      <div className={`fdoc fdoc-ratio${nbLignes > 44 ? ' rt-serre' : ''}`}>
        <div className="fdoc-hdr"><div className="fdoc-sur">Ratio matière</div><div className="fdoc-nom">Budgets et coûts</div>
          <div className="fdoc-cles"><span>Coefficient {coef(d.regles.coefficient)}</span><span>TVA {pourcent(d.regles.tva)}</span><span>Budgets après perte de {pourcent(d.regles.perte)}</span>
            {d.derniere && <span>Yokitup du {new Date(d.derniere.le).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}</span>}</div>
        </div>
        <div className="fdoc-body">
          <hr className="fdoc-sep" />
          <div className="rt-legende" aria-hidden="true">
            {(['vert', 'ambre', 'rouge'] as const).map(p => <span key={p}><span className={`rt-point rt-${p}`} />{LIBELLE[p]}</span>)}
          </div>
          {/* à l'impression, les deux menus du soir côte à côte : la feuille tient sur une page avec toute la carte */}
          <div className="rt-duo">{verifies.filter(m => m.budget.version === 'MENU').map(m => <SectionMenu key={m.budget.id} m={m} onModifier={() => { setEdition(m.budget); }} />)}</div>
          {verifies.filter(m => m.budget.version !== 'MENU').map(m => <SectionMenu key={m.budget.id} m={m} onModifier={() => { setEdition(m.budget); }} />)}
          <SectionCarte lignes={carte} regles={d.regles} onPrix={(l, p) => void enregistrerPrix(l, p)} />
          {(aRanger.length > 0 || aRelier.length > 0 || sansPrix.length > 0) && <div className="fdoc-ecran rt-aregarder">
            <div className="fdoc-ptitle">À regarder dans Yokitup</div>
            {aRanger.length > 0 && <p><strong>Hors des menus</strong> {aRanger.map(x => x.recette.nom).join(', ')}
              <span>Ajouter la fiche à un temps dans Menus (la relier d'abord dans Config &gt; Yokitup si besoin).</span></p>}
            {aRelier.length > 0 && <p><strong>Non reliées</strong> {aRelier.map(r => r.plat).join(', ')}
              <span>Si le plat est à la carte, le relier dans Config &gt; Yokitup.</span></p>}
            {sansPrix.length > 0 && <p><strong>Sans prix, comptés 0 €</strong> {sansPrix.join(', ')}
              <span>Leur donner un prix dans Yokitup s'ils ne sont pas gratuits.</span></p>}
          </div>}
        </div>
      </div>
      {edition === 'regles' && <ReglesFormulaire regles={d.regles} onFermer={async ok => { setEdition(null); if (ok) await charger(); }} />}
      {edition && edition !== 'regles' && <BudgetFormulaire budget={edition} ordre={d.budgets.indexOf(edition) + 1} regles={d.regles}
        onFermer={async ok => { setEdition(null); if (ok) await charger(); }} />}
    </>
  );
}

/** « 1 menu hors budget · 2 plats de la carte hors budget » : seuls un menu entier ou un plat de la carte sont comptés. */
function compte(renvois: readonly Renvoi[], etat: string, etatPluriel = etat): string {
  const menus = renvois.filter(r => r.menu).length, plats = renvois.length - menus;
  return [menus ? `${pluriel(menus, 'menu')} ${menus > 1 ? etatPluriel : etat}` : '', plats ? `${pluriel(plats, 'plat')} de la carte ${plats > 1 ? etatPluriel : etat}` : '']
    .filter(Boolean).join(' · ');
}

/** En tête : ce qui demande une action, avec un lien vers chaque ligne concernée (jamais imprimé). */
function Alertes({ alertes }: { alertes: ReturnType<typeof resume> }) {
  type Ligne = { cle: string; ton: Pastille | 'neutre'; titre: string; renvois: Renvoi[]; nombre?: number };
  const toutes: Ligne[] = [
    { cle: 'hors', ton: 'rouge', titre: compte(alertes.horsBudget, 'hors budget'), renvois: alertes.horsBudget },
    { cle: 'proches', ton: 'ambre', titre: compte(alertes.proches, 'proche du budget', 'proches du budget'), renvois: alertes.proches },
    // plats sans prix : un seul lien vers le premier (la carte est un tableau à remplir d'un coup)
    { cle: 'prix', ton: 'neutre', titre: pluriel(alertes.sansPrix.length, 'prix de la carte à saisir', 'prix de la carte à saisir'),
      renvois: alertes.sansPrix.length > 3 ? alertes.sansPrix.slice(0, 1).map(r => ({ ...r, nom: 'Saisir les prix', ou: '' })) : alertes.sansPrix, nombre: alertes.sansPrix.length },
    { cle: 'corriger', ton: 'neutre', titre: pluriel(alertes.aCorriger.length, 'plat impossible à vérifier', 'plats impossibles à vérifier'), renvois: alertes.aCorriger },
  ];
  const lignes = toutes.filter(l => (l.nombre ?? l.renvois.length) > 0);
  if (!lignes.length && !alertes.budgetsTropHauts.length) return <div className="rt-alertes rt-tout-bon" role="status"><Icone nom="check" />Menus et carte dans leur budget.</div>;
  return (
    <section className="rt-alertes" aria-label="Alertes">
      {alertes.budgetsTropHauts.map(n => <div key={n} className="rt-alerte rt-ton-rouge"><span className="rt-point" aria-hidden="true" /><strong>{n} : budgets au-dessus du plafond matière</strong></div>)}
      {lignes.map(l => (
        <div key={l.cle} className={`rt-alerte rt-ton-${l.ton}`}>
          <span className="rt-point" aria-hidden="true" />
          <strong>{l.titre}</strong>
          <span className="rt-renvois">{l.renvois.map(r => (
            <a key={r.ancre} href={`#${r.ancre}`} className="rt-renvoi" onClick={e => { e.preventDefault(); viser(r.ancre); }}>{r.nom}{r.ou && <span> {r.ou}</span>}</a>
          ))}</span>
        </div>
      ))}
    </section>
  );
}

/** Écart coloré : point + montant signé (le texte « dans / proche / au-dessus du budget » est lu par les lecteurs d'écran). */
function Ecart({ p, ecart }: { p: Pastille; ecart: number }) {
  return <span className={`rt-ecart rt-txt-${p}`}><span className={`rt-point rt-${p}`} aria-hidden="true" />{ecartEuros(ecart)}<span className="rt-cache"> · {LIBELLE[p]}</span></span>;
}

/** « Temps 3 » → « T3 » sur téléphone. */
function NomTemps({ nom }: { nom: string }) {
  const n = /^temps\s+(\d+)$/i.exec(nom.trim())?.[1];
  return n ? <><span className="rt-long">{nom}</span><span className="rt-court" aria-hidden="true">T{n}</span></> : <>{nom}</>;
}

/** Un menu : une ligne par plat (temps, plat, coût, budget du temps après perte, écart), puis le menu entier. */
function SectionMenu({ m, onModifier }: { m: MenuVerifie; onModifier: () => void }) {
  const b = m.budget;
  return (
    <section className="rt-menu" aria-label={b.nom} id={m.ancre}>
      <div className="fdoc-ptitle rt-titre">
        <span>{b.nom}</span>
        <span className="rt-titre-d"><span className="rt-prix-menu">{euros(b.prixTtc).replace(',00', '')}{m.coefficientReel !== null && <> · coef. {coef(m.coefficientReel)}</>}</span>
          <button type="button" className="btn btn-g btn-sm fdoc-ecran rt-modifier" onClick={onModifier}>Modifier</button></span>
      </div>
      {!m.menuTrouve && <p className="rt-vide">Menu « {b.menuHub} » introuvable dans l'onglet Menus.</p>}
      <table className="fdoc-table rt-table">
        <thead><tr><th scope="col" className="rt-c-temps">Temps</th><th scope="col">Plat</th><th scope="col">Coût</th><th scope="col">Budget</th><th scope="col">Écart</th></tr></thead>
        <tbody>
          {m.temps.flatMap((t, i) => {
            const nom = <th scope="row" className="rt-c-temps" rowSpan={Math.max(1, t.plats.length)}><NomTemps nom={t.nom} /></th>;
            const budget = euros(t.apresPerte);
            if (!t.plats.length) return [<tr key={i} className="rt-debut"><>{nom}</><td className="rt-vide">—</td><td /><td>{budget}</td><td /></tr>];
            return t.plats.map((p, k) => <LignePlat key={p.ancre} p={p} version={b.version} budget={budget} debut={k === 0} nomTemps={k === 0 ? nom : null} />);
          })}
          <tr className="rt-total"><th scope="row" colSpan={2}>Menu entier</th>
            <td>{m.coutReel === null ? <span className="rt-vide">incomplet</span> : euros(m.coutReel)}</td><td>{euros(m.totalApresPerte)}</td>
            <td>{m.pastille && m.ecart !== null && <Ecart p={m.pastille} ecart={m.ecart} />}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function LignePlat({ p, version, budget, debut, nomTemps }: { p: PlatVerifie; version: string; budget: string; debut: boolean; nomTemps: ReactNode }) {
  return (
    <tr id={p.ancre} className={debut ? 'rt-debut' : undefined}>
      {nomTemps}
      <td className="rt-c-plat" title={p.nom}>{p.court}</td>
      {p.probleme
        ? <td colSpan={3} className="rt-probleme" title={ACTION[p.probleme](version)}>{PROBLEME_COURT[p.probleme](version)}</td>
        : <><td>{p.cout === null ? '—' : euros(p.cout)}</td><td>{budget}</td><td>{p.pastille && p.ecart !== null && <Ecart p={p.pastille} ecart={p.ecart} />}</td></>}
    </tr>
  );
}

/** Carte : coût de la version CARTE, prix conseillé, prix réel saisi ici, coefficient obtenu. */
function SectionCarte({ lignes, regles, onPrix }: { lignes: LigneCarte[]; regles: Regles; onPrix: (l: LigneCarte, prix: number | null) => void }) {
  return (
    <section className="rt-carte" aria-label="Carte">
      <div className="fdoc-ptitle rt-titre"><span>Carte</span>
        <span className="rt-titre-d"><span className="rt-prix-menu">conseillé = coût × {coef(regles.coefficient * (1 + regles.tva))}, au demi-euro</span></span></div>
      {!lignes.length ? <p className="rt-vide">Aucun plat de la carte actuelle relié à Yokitup.</p> : (
        <table className="fdoc-table rt-table rt-table-carte">
          <thead><tr><th scope="col">Plat</th><th scope="col">Coût</th><th scope="col"><span className="rt-long">Conseillé</span><span className="rt-court">Cons.</span></th><th scope="col">Prix</th><th scope="col">Coef.</th></tr></thead>
          <tbody>{lignes.map(l => <LigneCarteRatio key={l.ancre} l={l} onPrix={onPrix} />)}</tbody>
        </table>
      )}
    </section>
  );
}

function LigneCarteRatio({ l, onPrix }: { l: LigneCarte; onPrix: (l: LigneCarte, prix: number | null) => void }) {
  const id = useId();
  const [saisie, setSaisie] = useState(l.prixReel === null ? '' : String(l.prixReel).replace('.', ','));
  const [faux, setFaux] = useState(false);
  const valider = () => {
    const t = saisie.trim();
    if (!t) { setFaux(false); if (l.prixReel !== null) onPrix(l, null); return; }
    const v = lireMontant(t);
    setFaux(v === null);
    if (v !== null) { setSaisie(String(v).replace('.', ',')); onPrix(l, v); }
  };
  return (
    <tr id={l.ancre}>
      <th scope="row" className="rt-c-plat" title={l.fiche ? `${l.fiche} — Yokitup : ${l.recette.nom}` : l.recette.nom}>{l.court}</th>
      <td>{l.cout === null ? <span className="rt-probleme" title={ACTION.sansCout('CARTE')}>sans coût</span> : euros(l.cout)}</td>
      <td>{l.conseille ? euros(l.conseille.arrondi) : '—'}</td>
      <td className="rt-prix">
        <label className="rt-cache" htmlFor={id}>Prix réel — {l.plat}</label>
        <input id={id} className={`rt-saisie fdoc-ecran${faux ? ' rt-faux' : ''}`} inputMode="decimal" placeholder="—"
          value={saisie} onChange={e => { setSaisie(e.target.value); }} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <span className="rt-imprime">{l.prixReel === null ? '—' : euros(l.prixReel)}</span>
      </td>
      <td>{l.coefficientReel !== null && l.pastille
        ? <span className={`rt-ecart rt-txt-${l.pastille}`}><span className={`rt-point rt-${l.pastille}`} aria-hidden="true" />{coef(l.coefficientReel)}<span className="rt-cache"> · {LIBELLE[l.pastille]}</span></span>
        : <span className="rt-vide">—</span>}</td>
    </tr>
  );
}

/** Prix d'un menu et budget de chaque temps. */
function BudgetFormulaire({ budget, ordre, regles, onFermer }: { budget: BudgetMenu; ordre: number; regles: Regles; onFermer: (ok: boolean) => Promise<void> }) {
  const { journal } = useDonnees();
  const { moi } = useMoi();
  const notifier = useNotifier();
  const idPrix = useId();
  const [prix, setPrix] = useState(String(budget.prixTtc).replace('.', ','));
  const [temps, setTemps] = useState(budget.temps.map(t => String(t.budget).replace('.', ',')));
  const [occupe, setOccupe] = useState(false);
  const p = lireMontant(prix), valeurs = temps.map(t => lireMontant(t) ?? (t.trim() === '0' ? 0 : null));
  const essai = p !== null && valeurs.every(v => v !== null) ? { ...budget, prixTtc: p, temps: budget.temps.map((t, i) => ({ nom: t.nom, budget: valeurs[i] ?? 0 })) } : null;
  const enregistrer = async () => {
    if (!essai) { notifier('Montant invalide : écris par exemple 75 ou 4,50', 'err'); return; }
    setOccupe(true);
    const r = await enregistrerBudget(essai, ordre, moi.prenom);
    setOccupe(false);
    if (!r.ok) { notifier('Enregistrement impossible : ' + r.message, 'err'); return; }
    await journal('budgets (Ratio)', budget.nom, [`Prix ${euros(budget.prixTtc)} → ${euros(essai.prixTtc)}`, ...essai.temps.map((t, i) => `${t.nom} : ${euros(budget.temps[i]?.budget ?? 0)} → ${euros(t.budget)}`)]);
    notifier('Budgets enregistrés', 'ok');
    await onFermer(true);
  };
  return (
    <Fenetre titre={`Budgets — ${budget.nom}`} onFermer={() => void onFermer(false)}
      pied={<><button type="button" className="btn btn-g" onClick={() => void onFermer(false)}>Annuler</button>
        <button type="button" className="btn btn-p" disabled={occupe || !essai} onClick={() => void enregistrer()}>Enregistrer</button></>}>
      <div className="fg2"><label className="fl" htmlFor={idPrix}>Prix de vente TTC (€)</label>
        <input className="fi2" id={idPrix} inputMode="decimal" value={prix} onChange={e => { setPrix(e.target.value); }} /></div>
      {budget.temps.map((t, i) => (
        <ChampMontant key={t.nom} libelle={`Budget ${t.nom} (€)`} valeur={temps[i] ?? ''} onChange={v => { setTemps(l => l.map((x, k) => (k === i ? v : x))); }} />
      ))}
      {essai && <p className="rt-apercu">Total {euros(totalBudgets(essai))} · plafond {euros(plafondMatiere(essai.prixTtc, regles))} · coefficient {coef(essai.prixTtc / (1 + regles.tva) / (totalBudgets(essai) || 1))}</p>}
    </Fenetre>
  );
}

function ChampMontant({ libelle, valeur, onChange }: { libelle: string; valeur: string; onChange: (v: string) => void }) {
  const id = useId();
  return <div className="fg2"><label className="fl" htmlFor={id}>{libelle}</label><input className="fi2" id={id} inputMode="decimal" value={valeur} onChange={e => { onChange(e.target.value); }} /></div>;
}

/** Coefficient, TVA et perte incluse. */
function ReglesFormulaire({ regles, onFermer }: { regles: Regles; onFermer: (ok: boolean) => Promise<void> }) {
  const { journal } = useDonnees();
  const { moi } = useMoi();
  const notifier = useNotifier();
  const enTexte = (n: number) => String(Math.round(n * 10000) / 10000).replace('.', ',');
  const [c, setC] = useState(enTexte(regles.coefficient));
  const [tva, setTva] = useState(enTexte(regles.tva * 100));
  const [perte, setPerte] = useState(enTexte(regles.perte * 100));
  const lirePct = (s: string) => { const t = s.replace('%', '').trim(); if (t === '0') return 0; const v = lireMontant(t); return v !== null && v < 100 ? v / 100 : null; };
  const enregistrer = async () => {
    const r = { coefficient: lireMontant(c) ?? NaN, tva: lirePct(tva) ?? NaN, perte: lirePct(perte) ?? NaN };
    if (![r.coefficient, r.tva, r.perte].every(Number.isFinite)) { notifier('Valeur invalide', 'err'); return; }
    const res = await enregistrerRegles(r, moi.prenom);
    if (!res.ok) { notifier('Enregistrement impossible : ' + res.message, 'err'); return; }
    await journal('règles (Ratio)', 'Ratio', [`Coefficient ${coef(regles.coefficient)} → ${coef(r.coefficient)}`, `TVA ${pourcent(regles.tva)} → ${pourcent(r.tva)}`, `Perte ${pourcent(regles.perte)} → ${pourcent(r.perte)}`]);
    notifier('Règles enregistrées', 'ok');
    await onFermer(true);
  };
  return (
    <Fenetre titre="Règles du ratio" onFermer={() => void onFermer(false)}
      pied={<><button type="button" className="btn btn-g" onClick={() => void onFermer(false)}>Annuler</button>
        <button type="button" className="btn btn-p" onClick={() => void enregistrer()}>Enregistrer</button></>}>
      <ChampMontant libelle="Coefficient (prix HT ÷ coût matière)" valeur={c} onChange={setC} />
      <ChampMontant libelle="TVA (%)" valeur={tva} onChange={setTva} />
      <ChampMontant libelle="Perte incluse dans les budgets (%)" valeur={perte} onChange={setPerte} />
    </Fenetre>
  );
}
