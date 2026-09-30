import { Notifications, useNotifier } from './ui/Notifications';
import { Confirmation } from './ui/Confirmation';
import { SessionProvider, useSession } from './etat/Session';
import { DonneesProvider } from './etat/Donnees';
import { Connexion } from './screens/Connexion';
import { Coque } from './screens/Coque';
import { MotDePasse } from './screens/MotDePasse';

export function App() {
  return (
    <Notifications>
      <Confirmation>
        <SessionProvider>
          <Ecran />
        </SessionProvider>
      </Confirmation>
    </Notifications>
  );
}

function Ecran() {
  const { etat, entrer } = useSession();
  const notifier = useNotifier();
  switch (etat.ecran) {
    case 'chargement':
      return <div id="login-screen"><div className="spinner" /></div>;
    case 'accueil':
      return <Connexion key={etat.erreur} erreurInitiale={etat.erreur} />;
    case 'mdp-impose':
      // Mot de passe temporaire : il faut en choisir un avant d'entrer.
      return <><Connexion erreurInitiale="" /><MotDePasse impose onFini={() => { notifier('Mot de passe enregistré', 'ok'); void entrer(); }} /></>;
    case 'connecte':
      return <DonneesProvider><Coque /></DonneesProvider>;
  }
}
