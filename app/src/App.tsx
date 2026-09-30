// Squelette : l'écran d'accueil s'affiche avec la vraie feuille de style.
// Les écrans arrivent un par un à l'étape 5, validés par tests/parcours.test.js.
export function App() {
  return (
    <div id="login-screen">
      <div className="l-left">
        <div className="l-brand">
          <div className="l-logo" role="img" aria-label="LAVA" />
        </div>
      </div>
      <div className="l-right">
        <div className="lbox">
          <p className="ph-sub">Nouvelle version en construction.</p>
        </div>
      </div>
    </div>
  );
}
