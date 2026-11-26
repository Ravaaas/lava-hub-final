import { Fragment, useCallback, useEffect, useId, useState } from 'react';
import { ACTION, apresPerte, coef, ecartEuros, euros, lireMontant, plafondMatiere, pourcent, recettesARanger, resume, totalBudgets, verifierCarte, verifierMenu,
  type BudgetMenu, type LigneCarte, type MenuVerifie, type Pastille, type PlatVerifie, type Regles, type Renvoi } from '../../domain/ratio';
import { heureFr, pluriel } from '../../domain/texte';
import { chargerRatio, enregistrerBudget, enregistrerPrixCarte, enregistrerRegles, type DonneesRatio } from '../../db/ratio';
import { lireYokitup } from '../../db/yokitup';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Fenetre } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';

const LIBELLE: Record<Pastille, string> = { vert: 'Dans le budget', ambre: 'Proche du plafond', rouge: 'Au-dessus' };

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
          <div className="ph-sub">Coût matière de chaque plat, lu dans Yokitup, face aux budgets · réservé à l'admin</div></div>
        <div className="ph-actions">
          <button type="button" className="btn btn-o btn-sm" disabled={lecture} onClick={() => void relire()}><Icone nom="refresh" />{lecture ? 'Lecture…' : 'Relire Yokitup'}</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => { setEdition('regles'); }}>Règles</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => { window.print(); }}><Icone nom="printer" />Imprimer</button>
        </div>
      </div>
      <p className="rt-lu">
        {d.derniere ? <>Coûts lus {dateLecture(d.derniere.le)}{!d.derniere.ok && <span className="rt-err"> · échec : {d.derniere.message}</span>}.</> : 'Yokitup n\'a pas encore été lu.'}
        {' '}Relu chaque nuit : une recette créée dans Yokitup apparaît ici le lendemain, ou tout de suite avec « Relire Yokitup ».
      </p>
      {d.sansCouts && d.recettes.length > 0 && <div className="alg-etat" role="status">Les coûts n'ont pas encore été lus : clique « Relire Yokitup ».</div>}
      <Alertes alertes={alertes} />
      <div className="fdoc fdoc-ratio">
        <div className="fdoc-hdr"><div className="fdoc-sur">Ratio matière</div><div className="fdoc-nom">Budgets et coûts</div>
          <div className="fdoc-cles"><span>Coefficient {coef(d.regles.coefficient)}</span><span>TVA {pourcent(d.regles.tva)}</span><span>Perte {pourcent(d.regles.perte)} incluse</span>
            {d.derniere && <span>Yokitup du {new Date(d.derniere.le).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}</span>}</div>
        </div>
        <div className="fdoc-body">
          <hr className="fdoc-sep" />
          {verifies.map(m => <SectionMenu key={m.budget.id} m={m} regles={d.regles} onModifier={() => { setEdition(m.budget); }} />)}
          <SectionCarte lignes={carte} regles={d.regles} onPrix={(l, p) => void enregistrerPrix(l, p)} />
          {aRanger.length > 0 && <div className="fdoc-ecran">
            <div className="fdoc-ptitle">Recettes Yokitup hors des menus</div>
            <ul className="rt-ranger">{aRanger.map(x => (
              <li key={x.recette.id}><strong>{x.recette.nom}</strong>{x.recette.cout !== null && <> · {euros(x.recette.cout)}</>}
                <span className="rt-action">{x.relie ? 'Ajouter sa fiche recette à un temps du menu dans Menus' : 'Relier à sa fiche recette dans Config > Yokitup, puis l\'ajouter au menu'}</span></li>
            ))}</ul>
          </div>}
        </div>
      </div>
      {edition === 'regles' && <ReglesFormulaire regles={d.regles} onFermer={async ok => { setEdition(null); if (ok) await charger(); }} />}
      {edition && edition !== 'regles' && <BudgetFormulaire budget={edition} ordre={d.budgets.indexOf(edition) + 1} regles={d.regles}
        onFermer={async ok => { setEdition(null); if (ok) await charger(); }} />}
    </>
  );
}

/** En tête : ce qui demande une action, avec un lien vers chaque ligne concernée (jamais imprimé). */
function Alertes({ alertes }: { alertes: ReturnType<typeof resume> }) {
  type Ligne = { cle: string; ton: Pastille | 'neutre'; titre: string; renvois: Renvoi[] };
  const lignes = ([
    { cle: 'hors', ton: 'rouge', titre: pluriel(alertes.horsBudget.length, 'plat hors budget', 'plats hors budget'), renvois: alertes.horsBudget },
    { cle: 'proches', ton: 'ambre', titre: pluriel(alertes.proches.length, 'plat proche du plafond', 'plats proches du plafond'), renvois: alertes.proches },
    { cle: 'prix', ton: 'neutre', titre: pluriel(alertes.sansPrix.length, 'plat de la carte sans prix', 'plats de la carte sans prix'), renvois: alertes.sansPrix },
    { cle: 'corriger', ton: 'neutre', titre: pluriel(alertes.aCorriger.length, 'plat impossible à vérifier', 'plats impossibles à vérifier'), renvois: alertes.aCorriger },
  ] satisfies Ligne[]).filter(l => l.renvois.length);
  if (!lignes.length && !alertes.budgetsTropHauts.length) return <div className="rt-alertes rt-tout-bon" role="status"><Icone nom="check" />Tous les plats sont dans leur budget.</div>;
  return (
    <section className="rt-alertes" aria-label="Alertes">
      {alertes.budgetsTropHauts.map(n => <div key={n} className="rt-alerte rt-ton-rouge"><span className="rt-point" aria-hidden="true" /><div><strong>{n} : budgets au-dessus du plafond matière</strong></div></div>)}
      {lignes.map(l => (
        <div key={l.cle} className={`rt-alerte rt-ton-${l.ton}`}>
          <span className="rt-point" aria-hidden="true" />
          <div className="rt-alerte-txt"><strong>{l.titre}</strong>
            <span className="rt-renvois">{l.renvois.map(r => (
              <a key={r.ancre} href={`#${r.ancre}`} className="rt-renvoi" onClick={e => { e.preventDefault(); viser(r.ancre); }}>{r.nom}<span> · {r.ou}</span></a>
            ))}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

function PastilleCout({ p }: { p: Pastille }) {
  return <span className={`rt-pastille rt-${p}`}><span className="rt-point" aria-hidden="true" />{LIBELLE[p]}</span>;
}

/** Un menu : tableau des temps (budget, après perte, part), et sous chaque temps ses plats avec leur coût Yokitup. */
function SectionMenu({ m, regles, onModifier }: { m: MenuVerifie; regles: Regles; onModifier: () => void }) {
  const b = m.budget;
  return (
    <section className="rt-menu" aria-label={b.nom}>
      <div className="fdoc-ptitle rt-titre"><span>{b.nom}</span>
        <button type="button" className="btn btn-g btn-sm fdoc-ecran rt-modifier" onClick={onModifier}>Modifier</button></div>
      <div className="rt-cles">
        <span><strong>{euros(b.prixTtc)} TTC</strong> · {euros(m.prixHt)} HT</span>
        <span>Plafond {euros(m.plafond)}</span>
        <span className={m.budgetsTropHauts ? 'rt-txt-rouge' : undefined}>Budgets {euros(m.total)} · coefficient {m.coefficient === null ? '—' : coef(m.coefficient)}</span>
        {m.coutReel !== null && <span>Coût réel {euros(m.coutReel)} · coefficient {m.coefficientReel === null ? '—' : coef(m.coefficientReel)}</span>}
      </div>
      {!m.menuTrouve && <div className="rt-action">Menu « {b.menuHub} » introuvable dans l'onglet Menus : aucun plat à vérifier.</div>}
      <table className="fdoc-table rt-table">
        <thead><tr><th scope="col">Temps</th><th scope="col">Budget</th><th scope="col">Après perte {pourcent(regles.perte)}</th><th scope="col">Part</th></tr></thead>
        <tbody>
          {m.temps.map((t, i) => (
            <Fragment key={i}>
              <tr className="rt-temps"><th scope="row">{t.nom}</th><td>{euros(t.budget)}</td><td>{euros(t.apresPerte)}</td><td>{pourcent(t.part)}</td></tr>
              {!t.plats.length && <tr className="rt-plat"><td colSpan={4}><span className="rt-vide">Aucun plat dans ce temps (onglet Menus)</span></td></tr>}
              {t.plats.map(p => <LignePlat key={p.ancre} p={p} version={b.version} />)}
            </Fragment>
          ))}
          <tr className="rt-total"><th scope="row">Total</th><td>{euros(m.total)}</td><td>{euros(apresPerte(m.total, regles))}</td><td>100 %</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function LignePlat({ p, version }: { p: PlatVerifie; version: string }) {
  return (
    <tr className="rt-plat" id={p.ancre}>
      <td colSpan={4}>
        <div className="rt-plat-l">
          <div className="rt-plat-nom">{p.nom}
            {p.recette && <span className="rt-yk">{p.recette.nom}</span>}
            {p.probleme && <span className="rt-action">{ACTION[p.probleme](version)}</span>}
            {p.recette && p.recette.manquants.length > 0 && <span className="rt-action">Coût incomplet, sans prix dans Yokitup : {p.recette.manquants.join(', ')}</span>}
          </div>
          {p.cout !== null && p.pastille && <div className="rt-plat-cout">
            <span className="rt-montant">{euros(p.cout)}</span>
            <PastilleCout p={p.pastille} />
            {p.ecart !== null && <span className={`rt-ecart rt-txt-${p.pastille}`}>{ecartEuros(p.ecart)}</span>}
          </div>}
        </div>
      </td>
    </tr>
  );
}

/** Carte : coût de la version CARTE, prix conseillé, prix réel saisi ici, coefficient obtenu. */
function SectionCarte({ lignes, regles, onPrix }: { lignes: LigneCarte[]; regles: Regles; onPrix: (l: LigneCarte, prix: number | null) => void }) {
  return (
    <section className="rt-carte" aria-label="Carte">
      <div className="fdoc-ptitle">Carte</div>
      <div className="rt-cles"><span>Prix conseillé = coût × {coef(regles.coefficient)} × {coef(1 + regles.tva)}, arrondi au demi-euro supérieur</span></div>
      {!lignes.length ? <div className="rt-vide">Aucune recette CARTE lue dans Yokitup.</div> : (
        <div className="rt-defile">
          <table className="fdoc-table rt-table rt-table-carte">
            <thead><tr><th scope="col">Plat</th><th scope="col">Coût</th><th scope="col">Prix conseillé</th><th scope="col">Prix réel TTC</th><th scope="col">Coefficient</th></tr></thead>
            <tbody>{lignes.map(l => <LigneCarteRatio key={l.ancre} l={l} onPrix={onPrix} />)}</tbody>
          </table>
        </div>
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
      <th scope="row" className="rt-carte-plat">{l.plat}
        {l.fiche && <span className="rt-yk">{l.fiche}</span>}
        {l.cout === null && <span className="rt-action">{ACTION.sansCout('CARTE')}</span>}
        {l.recette.manquants.length > 0 && <span className="rt-action">Coût incomplet : {l.recette.manquants.join(', ')}</span>}
      </th>
      <td data-libelle="Coût">{l.cout === null ? '—' : euros(l.cout)}</td>
      <td data-libelle="Conseillé">{l.conseille ? <><strong>{euros(l.conseille.arrondi)}</strong><span className="rt-brut">{euros(l.conseille.brut)}</span></> : '—'}</td>
      <td className="rt-prix" data-libelle="Prix réel">
        <label className="rt-cache" htmlFor={id}>Prix réel — {l.plat}</label>
        <input id={id} className={`fi2 rt-saisie fdoc-ecran${faux ? ' pp-faux' : ''}`} inputMode="decimal" placeholder={l.conseille ? String(l.conseille.arrondi).replace('.', ',') : '€'}
          value={saisie} onChange={e => { setSaisie(e.target.value); }} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <span className="rt-imprime">{l.prixReel === null ? '—' : euros(l.prixReel)}</span>
        {l.ecartPrix !== null && Math.abs(l.ecartPrix) > 0.004 && <span className="rt-brut">{ecartEuros(l.ecartPrix)} / conseillé</span>}
      </td>
      <td data-libelle="Coefficient">{l.coefficientReel !== null && l.pastille ? <span className={`rt-coef rt-txt-${l.pastille}`}><span className={`rt-point rt-${l.pastille}`} aria-hidden="true" />{coef(l.coefficientReel)}<span className="rt-cache"> · {LIBELLE[l.pastille]}</span></span>
        : <span className="rt-vide">{l.cout === null ? '—' : 'Sans prix'}</span>}</td>
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
