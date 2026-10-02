import { useId, useRef, useState } from 'react';
import type { Fiche, Ingredient } from '../../domain/types';
import { ALLERGENES } from '../../domain/allergenes';
import { TYPES_CONDITIONNEMENT, UNITES, diffFiche, ecrireConditionnement, lireConditionnement } from '../../domain/fiches';
import { normNom } from '../../domain/texte';
import { creerFiche, modifierFiche } from '../../db/fiches';
import { useDonnees } from '../../etat/Donnees';
import { Fenetre } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { Puces } from '../../ui/Puces';
import { Selecteur, enOptions } from '../../ui/Selecteur';
import { useReordonner } from '../../ui/useReordonner';

// Lignes en cours de saisie ; `cle` = identité stable pour React pendant qu'on réordonne.
interface LigneIngredient { cle: number; nom: string; ficheId: string; lie: boolean; quantite: string; unite: string; brut: boolean; net: string }
interface LigneEtape { cle: number; texte: string }
interface LigneCond { cle: number; type: string; quantite: string }

let compteur = 0;
const cle = () => ++compteur;
const ingredientVide = (): LigneIngredient => ({ cle: cle(), nom: '', ficheId: '', lie: false, quantite: '', unite: 'g', brut: false, net: '' });

export function FicheFormulaire({ fiche, onFermer }: { fiche: Fiche | null; onFermer: () => void }) {
  const { fiches, reglages, recharger, journal, setSynchro } = useDonnees();
  const notifier = useNotifier();
  const ids = { nom: useId(), cat: useId(), qte: useId() };
  const [nom, setNom] = useState(fiche?.nom ?? '');
  const [categorie, setCategorie] = useState(fiche?.categorie || reglages.categories[0] || '');
  const [quantite, setQuantite] = useState(fiche?.quantite_nette ?? '');
  const [allergenes, setAllergenes] = useState<string[]>(fiche ? fiche.allergenes.filter(a => (ALLERGENES as readonly string[]).includes(a)) : []);
  const [conds, setConds] = useState<LigneCond[]>(() => {
    const l = (fiche?.conditionnement ?? []).map(c => ({ cle: cle(), ...lireConditionnement(c) }));
    return l.length ? l : [{ cle: cle(), type: '', quantite: '' }];
  });
  const [ingredients, setIngredients] = useState<LigneIngredient[]>(() => fiche
    ? fiche.ingredients.map(i => ({ cle: cle(), nom: i.nom, ficheId: i.ficheId ?? '', lie: !!i.ficheId, quantite: i.quantite, unite: i.unite, brut: !!i.brut, net: i.quantite_net ?? '' }))
    : [ingredientVide()]);
  const [etapes, setEtapes] = useState<LigneEtape[]>(() => fiche ? fiche.process.map(t => ({ cle: cle(), texte: t })) : [{ cle: cle(), texte: '' }]);
  const [occupe, setOccupe] = useState(false);
  const dernierAjout = useRef<number | null>(null);
  const ordreIng = useReordonner(ingredients, setIngredients);
  const ordreEtapes = useReordonner(etapes, setEtapes);

  const changerIng = (c: number, p: Partial<LigneIngredient>) => { setIngredients(l => l.map(x => (x.cle === c ? { ...x, ...p } : x))); };
  const focusSiNouveau = (c: number) => (el: HTMLInputElement | null) => { if (el && dernierAjout.current === c) { el.focus(); dernierAjout.current = null; } };

  const enregistrer = async () => {
    const n = nom.trim().toUpperCase();
    if (!n) { notifier('Le nom est obligatoire', 'err'); return; }
    const doublon = fiches.find(f => f.id !== fiche?.id && normNom(f.nom) === normNom(n));
    if (doublon) { notifier(`Une fiche "${doublon.nom}" existe déjà`, 'err'); return; }
    const ings: Ingredient[] = [];
    for (const l of ingredients) {
      const lien = l.lie ? fiches.find(f => f.id === l.ficheId) : undefined;
      if (l.lie && !lien) continue;
      const nomIng = lien ? lien.nom : l.nom.trim().toUpperCase();
      if (!nomIng) continue;
      const i: Ingredient = { nom: nomIng, quantite: l.quantite.trim(), unite: l.unite };
      if (lien) i.ficheId = lien.id;
      if (l.brut) { i.brut = true; if (l.net.trim()) i.quantite_net = l.net.trim(); }
      ings.push(i);
    }
    const donnees: Omit<Fiche, 'id'> = {
      nom: n,
      categorie,
      quantite_nette: quantite.trim(),
      conditionnement: conds.filter(c => c.type).map(c => ecrireConditionnement(c.type, c.quantite.trim())),
      allergenes,
      ingredients: ings,
      process: etapes.map(e => e.texte.trim()).filter(Boolean),
    };
    setOccupe(true); setSynchro(true);
    try {
      const r = fiche ? await modifierFiche(fiche.id, donnees) : await creerFiche(donnees);
      if (!r.ok) { notifier('Erreur : ' + r.message, 'err'); return; }
      await journal(fiche ? 'modification' : 'création', n, fiche ? diffFiche(fiche, donnees) : []);
      notifier(fiche ? 'Fiche modifiée' : 'Fiche enregistrée', 'ok');
      onFermer();
      await recharger();
    } finally { setOccupe(false); setSynchro(false); }
  };

  const optionsFiches = fiches.filter(f => f.id !== fiche?.id);

  return (
    <Fenetre titre={fiche ? `Modifier — ${fiche.nom}` : 'Nouvelle fiche'} onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn btn-p" disabled={occupe} onClick={() => void enregistrer()}>Enregistrer</button>
      </>}>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={ids.nom}>Nom *</label>
          <input className="fi2" id={ids.nom} type="text" placeholder="ex: Velouté Curry" value={nom} onChange={e => { setNom(e.target.value.toUpperCase()); }} /></div>
        <div className="fg2"><label className="fl" htmlFor={ids.cat}>Catégorie</label>
          <Selecteur id={ids.cat} options={enOptions(reglages.categories, categorie)} valeur={categorie} onChange={setCategorie} /></div>
      </div>
      <div className="fr" style={{ gridTemplateColumns: '1fr' }}>
        <div className="fg2"><label className="fl" htmlFor={ids.qte}>Quantité nette</label>
          <input className="fi2" id={ids.qte} type="text" placeholder="ex: 5,06 kg" value={quantite} onChange={e => { setQuantite(e.target.value); }} /></div>
        <div className="fg2"><span className="fl">Conditionnement</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {conds.map(c => (
              <div key={c.cle} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,120px) 44px', gap: 8, alignItems: 'center' }}>
                <Selecteur libelle="Type de conditionnement" vide="— Choisir —" options={enOptions(TYPES_CONDITIONNEMENT, c.type)} valeur={c.type}
                  onChange={v => { setConds(l => l.map(x => (x.cle === c.cle ? { ...x, type: v } : x))); }} />
                <input className="fi2" type="text" placeholder="ex: 850 g" aria-label="Quantité du conditionnement" value={c.quantite}
                  onChange={e => { setConds(l => l.map(x => (x.cle === c.cle ? { ...x, quantite: e.target.value } : x))); }} />
                <button type="button" className="btn-rm" aria-label="Retirer ce conditionnement" onClick={() => { setConds(l => l.filter(x => x.cle !== c.cle)); }}><Icone nom="x" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-ar" style={{ marginTop: '0.4rem' }} onClick={() => { setConds(l => [...l, { cle: cle(), type: '', quantite: '' }]); }}><Icone nom="plus" />Ajouter un conditionnement</button>
        </div>
      </div>
      <div className="fg2"><span className="fl">Allergènes</span><Puces choix={ALLERGENES} selection={allergenes} onChange={setAllergenes} /></div>

      <div className="fsect">Ingrédients</div>
      <div className="il">
        {ingredients.map((l, i) => (
          <div key={l.cle} {...ordreIng.ligne(i)} className={`ir${l.brut ? ' has-net' : ''}${ordreIng.glisse === i ? ' dragging' : ''}`}>
            <div {...ordreIng.poignee(i)}><Icone nom="grip" /></div>
            {l.lie
              ? <Selecteur className="ing-fiche-sel" libelle="Fiche liée" vide="— Choisir une fiche —" options={optionsFiches.map(f => ({ valeur: f.id, libelle: f.nom }))}
                  valeur={l.ficheId} onChange={v => { changerIng(l.cle, { ficheId: v }); }} />
              : <input ref={focusSiNouveau(l.cle)} className="fi2 ing-n" type="text" placeholder="Ingrédient" value={l.nom} onChange={e => { changerIng(l.cle, { nom: e.target.value.toUpperCase() }); }} />}
            <input className="fi2 ing-q" type="number" step="any" min="0" placeholder="Qté" value={l.quantite} onChange={e => { changerIng(l.cle, { quantite: e.target.value }); }} />
            <input className="fi2 ing-net" type="number" step="any" min="0" placeholder="Net" title="Poids net" value={l.net} onChange={e => { changerIng(l.cle, { net: e.target.value }); }} />
            <Selecteur className="ing-u" libelle="Unité" options={enOptions(UNITES)} valeur={l.unite} onChange={v => { changerIng(l.cle, { unite: v }); }} />
            <button type="button" className={`btn-brut${l.brut ? ' active' : ''}`} title="Poids brut" aria-pressed={l.brut} onClick={() => { changerIng(l.cle, { brut: !l.brut, net: l.brut ? '' : l.net }); }}>B</button>
            <button type="button" className="btn-lnk" title={l.lie ? 'Délier' : 'Lier une recette'} aria-label={l.lie ? 'Délier' : 'Lier une recette'} onClick={() => { changerIng(l.cle, { lie: !l.lie }); }}><Icone nom="link" /></button>
            <button type="button" className="btn-rm" aria-label="Retirer" onClick={() => { setIngredients(x => x.filter(y => y.cle !== l.cle)); }}><Icone nom="x" /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ar" onClick={() => { const n = ingredientVide(); dernierAjout.current = n.cle; setIngredients(l => [...l, n]); }}><Icone nom="plus" />Ajouter un ingrédient</button>

      <div className="fsect" style={{ marginTop: '1.25rem' }}>Process</div>
      <div className="sl">
        {etapes.map((e, i) => (
          <div key={e.cle} {...ordreEtapes.ligne(i)} className={`sr${ordreEtapes.glisse === i ? ' dragging' : ''}`}>
            <div {...ordreEtapes.poignee(i)}><Icone nom="grip" /></div>
            <div className="sn">{i + 1}</div>
            <input ref={focusSiNouveau(e.cle)} className="fi2" type="text" placeholder={`Étape ${i + 1}`} value={e.texte}
              onChange={ev => { setEtapes(l => l.map(x => (x.cle === e.cle ? { ...x, texte: ev.target.value } : x))); }} />
            <button type="button" className="btn-rm" aria-label="Retirer cette étape" onClick={() => { setEtapes(l => l.filter(x => x.cle !== e.cle)); }}><Icone nom="x" /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ar" onClick={() => { const c = cle(); dernierAjout.current = c; setEtapes(l => [...l, { cle: c, texte: '' }]); }}><Icone nom="plus" />Ajouter une étape</button>
    </Fenetre>
  );
}
