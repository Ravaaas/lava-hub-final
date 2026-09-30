import { useId, useState } from 'react';
import type { Equipe, Membre, Role } from '../../domain/types';
import { ROLES, identifiantPour, postesProposes } from '../../domain/equipe';
import { ajouterMembre, fonctionEquipe, modifierMembre, retirerLigneMembre } from '../../db/equipe';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Fenetre } from '../../ui/Fenetre';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';

/** Fiche d'un membre. L'identifiant de connexion n'est jamais affiché ; on ne peut ni se couper l'accès ni se retirer. */
export function MembreFormulaire({ membre: m, onFermer }: { membre: Membre | null; onFermer: () => void }) {
  const { moi } = useMoi();
  const { membres, rechargerMembres, journal } = useDonnees();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const id = { prenom: useId(), nom: useId(), poste: useId(), equipe: useId(), role: useId(), actif: useId() };
  const moiMeme = !!m && m.email === moi.email;
  const [prenom, setPrenom] = useState(m?.prenom ?? '');
  const [nom, setNom] = useState(m?.nom ?? '');
  const [equipe, setEquipe] = useState<Equipe>(m?.equipe ?? 'cuisine');
  const [poste, setPoste] = useState(m?.poste ?? '');
  const [role, setRole] = useState<Role>(m?.role ?? 'cuisine');
  const [actif, setActif] = useState(m?.actif ?? true);
  const [occupe, setOccupe] = useState(false);

  const fini = async (message: string) => { notifier(message, 'ok'); onFermer(); await rechargerMembres(); };

  const enregistrer = async () => {
    const p = prenom.trim();
    if (!p) { notifier('Le prénom est obligatoire', 'err'); return; }
    const champs = { prenom: p, nom: nom.trim(), poste, equipe, role };
    setOccupe(true);
    try {
      if (m) {
        // soi-même : ni le rôle ni l'accès ne changent (on ne peut pas s'enfermer dehors)
        const r = await modifierMembre(m.email, moiMeme ? { prenom: p, nom: champs.nom, poste, equipe } : { ...champs, actif });
        if (!r.ok) { notifier('Modification impossible : ' + r.message, 'err'); return; }
        await journal('modification équipe', p);
        await fini('Membre modifié');
      } else {
        const email = identifiantPour(p, champs.nom, membres.map(x => x.email));
        if (!email) { notifier('Le prénom doit contenir des lettres ou des chiffres', 'err'); return; }
        const r = await ajouterMembre(email, champs);
        if (!r.ok) { notifier(r.message === 'Ce membre existe déjà' ? r.message : 'Erreur : ' + r.message, 'err'); return; }
        await journal('ajout équipe', p);
        await fini('Profil ajouté — la personne crée son mot de passe à sa première connexion');
      }
    } finally { setOccupe(false); }
  };

  const reinitialiser = async () => {
    if (!m || !await confirmer(`Réinitialiser le compte de ${m.prenom} ? Son mot de passe sera supprimé et elle devra en créer un nouveau à sa prochaine connexion.`, 'Réinitialiser')) return;
    const r = await fonctionEquipe({ action: 'reinitialiser', email: m.email });
    if (!r.ok) { notifier(r.message, 'err'); return; }
    await journal('réinitialisation compte', m.prenom);
    await fini('Compte réinitialisé — un nouveau mot de passe sera créé à la prochaine connexion');
  };

  const retirer = async () => {
    if (!m || !await confirmer(`Retirer ${m.prenom} de l'équipe ? Son accès sera coupé.`, 'Retirer')) return;
    // sans compte de connexion, la ligne suffit ; sinon la fonction « equipe » supprime aussi le compte
    const r = m.compte_cree ? await fonctionEquipe({ action: 'supprimer', email: m.email }) : await retirerLigneMembre(m.email);
    if (!r.ok) { notifier('Suppression impossible : ' + r.message, 'err'); return; }
    await journal('suppression équipe', m.prenom);
    notifier('Membre retiré');
    onFermer();
    await rechargerMembres();
  };

  return (
    <Fenetre titre={m ? `Modifier — ${m.prenom}` : 'Nouveau membre'} largeur={520} onFermer={onFermer}
      pied={<div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '0.6rem' }}>
        {m && !moiMeme ? <button type="button" className="btn btn-d" onClick={() => void retirer()}>Supprimer</button> : <span />}
        <span style={{ display: 'flex', gap: '0.6rem', marginLeft: 'auto' }}>
          <button type="button" className="btn btn-g" onClick={onFermer}>Annuler</button>
          <button type="button" className="btn btn-p" disabled={occupe} onClick={() => void enregistrer()}>Enregistrer</button>
        </span>
      </div>}>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.prenom}>Prénom *</label><input className="fi2" id={id.prenom} type="text" value={prenom} onChange={e => { setPrenom(e.target.value); }} /></div>
        <div className="fg2"><label className="fl" htmlFor={id.nom}>Nom</label><input className="fi2" id={id.nom} type="text" value={nom} onChange={e => { setNom(e.target.value); }} /></div>
      </div>
      <div className="fg2"><label className="fl" htmlFor={id.poste}>Poste</label>
        <select className="fsel" id={id.poste} value={poste} onChange={e => { setPoste(e.target.value); }}>
          <option value="">— Aucun —</option>
          {postesProposes(equipe, poste).map(p => <option key={p} value={p}>{p}</option>)}
        </select></div>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.equipe}>Équipe</label>
          <select className="fsel" id={id.equipe} value={equipe} onChange={e => { setEquipe(e.target.value === 'salle' ? 'salle' : 'cuisine'); }}>
            <option value="cuisine">Cuisine</option><option value="salle">Salle</option>
          </select></div>
        <div className="fg2"><label className="fl" htmlFor={id.role}>Droits</label>
          <select className="fsel" id={id.role} value={role} disabled={moiMeme} onChange={e => { const r = ROLES.find(x => x.valeur === e.target.value); if (r) setRole(r.valeur); }}>
            {ROLES.map(r => <option key={r.valeur} value={r.valeur}>{r.libelle}</option>)}
          </select></div>
      </div>
      {!m && <p style={{ fontSize: '0.875rem', color: 'var(--gt)', lineHeight: 1.6 }}>Après l'ajout, la personne retrouve son profil sur l'écran de connexion et crée son mot de passe.</p>}
      {m && !moiMeme && (
        <div className="fg2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" id={id.actif} checked={actif} onChange={e => { setActif(e.target.checked); }} style={{ width: 24, height: 24, accentColor: 'var(--accent)', flexShrink: 0 }} />
          <label htmlFor={id.actif} style={{ fontSize: '0.9375rem', minHeight: 44, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>Accès actif <span style={{ color: 'var(--gt)' }}>(décocher coupe l'accès tout de suite)</span></label>
        </div>
      )}
      {m && !moiMeme && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
          <div className="fl" style={{ marginBottom: '0.5rem' }}>Accès</div>
          {!m.compte_cree
            ? <div className="ph-sub">Pas encore connecté : la personne crée son mot de passe à sa première connexion.</div>
            : <>
                <div className="ph-sub" style={{ marginBottom: '0.5rem' }}>Compte actif{m.doit_changer_mdp ? ' (mot de passe temporaire)' : ''}</div>
                <button type="button" className="btn btn-g btn-sm" onClick={() => void reinitialiser()}>Réinitialiser le mot de passe</button>
              </>}
        </div>
      )}
    </Fenetre>
  );
}
