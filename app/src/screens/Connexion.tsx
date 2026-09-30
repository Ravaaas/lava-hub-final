import { useEffect, useRef, useState } from 'react';
import type { Equipe, ProfilConnexion } from '../domain/types';
import { MDP_MIN, nomAffiche, profilsClasses, verifierMotDePasse } from '../domain/equipe';
import { fonctionEquipe } from '../db/equipe';
import { seConnecter } from '../db/session';
import { useSession } from '../etat/Session';
import { Icone } from '../ui/Icone';

type Etape = { etape: 'equipes' } | { etape: 'profils'; equipe: Equipe } | { etape: 'mdp'; equipe: Equipe; profil: ProfilConnexion };

const Sous = ({ children }: { children: string }) => (
  <div style={{ fontSize: '0.875rem', fontWeight: 400, letterSpacing: '0.02em', textTransform: 'none', color: 'var(--gt)', marginTop: '0.2rem' }}>{children}</div>
);

/** Écran de connexion : Cuisine ou Salle → profil « Prénom NOM » → mot de passe (ou création à la première connexion). */
export function Connexion({ erreurInitiale }: { erreurInitiale: string }) {
  const { profils, rechargerProfils, entrer } = useSession();
  const [etape, setEtape] = useState<Etape>({ etape: 'equipes' });
  const [erreur, setErreur] = useState(erreurInitiale);
  const aller = (e: Etape) => { setErreur(''); setEtape(e); };

  const choisirEquipe = (equipe: Equipe) => {
    if (!profils) { void rechargerProfils(); setErreur('Liste des profils indisponible — réessaie dans un instant'); return; }
    aller({ etape: 'profils', equipe });
  };

  return (
    <div id="login-screen">
      <div className="l-left"><div className="l-brand"><div className="l-logo" role="img" aria-label="LAVA" /><div className="l-deco" /></div></div>
      <div className="l-right">
        <div className="lbox">
          {etape.etape === 'equipes' && (
            <div className="pb-wrap">
              {(['cuisine', 'salle'] as const).map(eq => (
                <button key={eq} type="button" className={`pb${eq === 'cuisine' ? ' admin' : ''}`} onClick={() => { choisirEquipe(eq); }}>
                  <span>{eq === 'cuisine' ? 'Cuisine' : 'Salle'}</span><span className="pb-arrow"><Icone nom="chevron-right" /></span>
                </button>
              ))}
            </div>
          )}
          {etape.etape === 'profils' && (
            <>
              <div className="lbox-title">{etape.equipe === 'cuisine' ? 'Cuisine' : 'Salle'}</div>
              <div className="pb-wrap">
                {profilsClasses(profils ?? [], etape.equipe).map(p => (
                  <button key={p.email} type="button" className="pb" onClick={() => { aller({ etape: 'mdp', equipe: etape.equipe, profil: p }); }}>
                    <span>
                      {nomAffiche(p)}
                      {p.poste && <Sous>{p.poste}</Sous>}
                      {p.premiereConnexion && <Sous>Première connexion : crée ton mot de passe</Sous>}
                    </span>
                    <span className="pb-arrow"><Icone nom="chevron-right" /></span>
                  </button>
                ))}
                {!profilsClasses(profils ?? [], etape.equipe).length && <div className="ph-sub">Aucun profil dans cette équipe.</div>}
              </div>
              <button type="button" className="btn-out" style={{ marginTop: 16 }} onClick={() => { aller({ etape: 'equipes' }); }}><Icone nom="chevron-left" />Retour</button>
            </>
          )}
          {etape.etape === 'mdp' && (
            <MotDePasseConnexion profil={etape.profil} setErreur={setErreur} onConnecte={entrer} onRetour={() => { aller({ etape: 'profils', equipe: etape.equipe }); }} />
          )}
          {erreur && <div className="l-err" style={{ display: 'block' }} role="alert">{erreur}</div>}
        </div>
      </div>
    </div>
  );
}

function MotDePasseConnexion({ profil, setErreur, onConnecte, onRetour }: { profil: ProfilConnexion; setErreur: (e: string) => void; onConnecte: () => Promise<void>; onRetour: () => void }) {
  const premiere = profil.premiereConnexion;
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [occupe, setOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { champ.current?.focus(); }, []);

  const valider = async () => {
    if (!mdp || occupe) return;
    if (premiere) {
      const e = verifierMotDePasse(mdp, mdp2);
      if (e) { setErreur(e); return; }
    }
    setErreur('');
    setOccupe(true);
    try {
      if (premiere) {
        const r = await fonctionEquipe({ action: 'activer', email: profil.email, password: mdp });
        if (!r.ok) { setErreur(r.message); return; }
      }
      if (await seConnecter(profil.email, mdp)) await onConnecte();
      else { setErreur('Mot de passe incorrect'); setMdp(''); champ.current?.focus(); }
    } finally { setOccupe(false); }
  };
  const surEntree = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void valider(); };

  return (
    <>
      <div className="lbox-title">{`${profil.prenom} ${profil.nom}`.trim()}</div>
      <div className="pw-field" style={{ display: 'flex', marginTop: 0 }}>
        <input ref={champ} type="password" aria-label="Mot de passe" autoComplete={premiere ? 'new-password' : 'current-password'}
          placeholder={premiere ? `Choisis ton mot de passe (${MDP_MIN} caractères min.)` : 'Mot de passe'}
          value={mdp} onChange={e => { setMdp(e.target.value); }} onKeyDown={surEntree} />
        {premiere && <input type="password" aria-label="Répète le mot de passe" placeholder="Répète le mot de passe" autoComplete="new-password"
          value={mdp2} onChange={e => { setMdp2(e.target.value); }} onKeyDown={surEntree} />}
        <button type="button" className="btn-confirm" disabled={occupe} style={occupe ? { opacity: 0.6 } : undefined} onClick={() => void valider()}>
          {premiere ? 'Créer mon mot de passe' : 'Se connecter'}
        </button>
      </div>
      <button type="button" className="btn-out" style={{ marginTop: 16 }} onClick={onRetour}><Icone nom="chevron-left" />Retour</button>
    </>
  );
}
