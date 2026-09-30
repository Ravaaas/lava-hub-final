import { useId, useState } from 'react';
import { verifierMotDePasse } from '../domain/equipe';
import { changerMotDePasse } from '../db/session';
import { Fenetre } from '../ui/Fenetre';

/** Changement de mot de passe : volontaire (menu du profil) ou imposé (mot de passe temporaire). */
export function MotDePasse({ impose, onFini, onAnnuler }: { impose: boolean; onFini: () => void; onAnnuler?: () => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const id1 = useId(), id2 = useId();

  const enregistrer = async () => {
    const e = verifierMotDePasse(a, b);
    if (e) { setErreur(e); return; }
    setOccupe(true);
    const r = await changerMotDePasse(a);
    setOccupe(false);
    if (!r.ok) { setErreur(r.message); return; }
    onFini();
  };

  return (
    <Fenetre titre={impose ? 'Choisis ton mot de passe' : 'Changer mon mot de passe'} largeur={420} {...(impose || !onAnnuler ? {} : { onFermer: onAnnuler })}
      pied={<>
        {!impose && <button type="button" className="btn btn-g" onClick={onAnnuler}>Annuler</button>}
        <button type="button" className="btn btn-p" disabled={occupe} onClick={() => void enregistrer()}>Enregistrer</button>
      </>}>
      {impose && <p style={{ fontSize: '0.875rem', color: 'var(--gt)', lineHeight: 1.6, marginBottom: '1rem' }}>C'est ta première connexion : choisis un mot de passe que toi seul connais. Tu pourras le changer plus tard depuis « Mot de passe ».</p>}
      <div className="fg2"><label className="fl" htmlFor={id1}>Nouveau mot de passe (8 caractères minimum)</label>
        <input className="fi2" id={id1} type="password" autoComplete="new-password" value={a} onChange={e => { setA(e.target.value); }} /></div>
      <div className="fg2"><label className="fl" htmlFor={id2}>Répète-le</label>
        <input className="fi2" id={id2} type="password" autoComplete="new-password" value={b} onChange={e => { setB(e.target.value); }}
          onKeyDown={e => { if (e.key === 'Enter') void enregistrer(); }} /></div>
      {erreur && <div className="l-err" style={{ display: 'block' }} role="alert">{erreur}</div>}
    </Fenetre>
  );
}
