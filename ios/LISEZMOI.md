# App iPhone LAVA — version de test (gratuite, via Xcode)

L'app affiche le site LAVA en plein écran. Les captures d'écran et les enregistrements d'écran ne montrent pas son contenu.

**Limites du compte Apple gratuit :** l'app ne s'installe que sur **ton** iPhone, par câble depuis le Mac, et **cesse de
fonctionner au bout de 7 jours** (il suffit alors de refaire l'étape 6). Pour l'équipe, sans expiration : compte développeur
Apple (99 $/an) et TestFlight.

## Ce qu'il faut
- Un Mac avec **Xcode** (gratuit, App Store), un câble pour l'iPhone, ton identifiant Apple.
- Les deux fichiers de ce dossier : `LavaApp.swift` et `icone-1024.png`
  (sur GitHub : dépôt `lava-hub-final` > dossier `ios` > ouvrir le fichier > bouton de téléchargement).

## Étapes
1. **Xcode > Settings > Accounts** : bouton **+** > Apple ID > te connecter.
2. **File > New > Project…** > **iOS** > **App** > Next.
   - Product Name : `LAVA`
   - Team : ton nom (**Personal Team**)
   - Organization Identifier : `fr.lava.` suivi de ton prénom (ex. `fr.lava.alexandre`) — il doit être unique
   - Interface : **SwiftUI** · Language : **Swift** · Testing System : None · Storage : None
   - Next, choisir un dossier, Create.
3. Dans la colonne de gauche :
   - clic droit sur **ContentView.swift** > Delete > Move to Trash ;
   - ouvrir **LAVAApp.swift**, tout sélectionner (⌘A), coller le contenu de `LavaApp.swift`.
4. Icône : ouvrir **Assets** > **AppIcon** > glisser `icone-1024.png` dans la case.
5. Brancher l'iPhone, le déverrouiller, accepter « Faire confiance à cet ordinateur ». En haut de Xcode, choisir l'iPhone.
6. Bouton **▶︎** (Run). La première fois, sur l'iPhone :
   - **Réglages > Confidentialité et sécurité > Mode développeur** : activer, redémarrer, confirmer ;
   - relancer ▶︎, puis **Réglages > Général > VPN et gestion de l'appareil** > ton identifiant > **Faire confiance** ;
   - ouvrir l'app LAVA.

## Tester le blocage
- Faire une capture d'écran dans l'app : l'image doit être **vide (noire ou unie)**.
- Lancer un enregistrement d'écran (Centre de contrôle) : l'app affiche « Enregistrement de l'écran bloqué ».

## À savoir
- Apple ne propose **aucun moyen officiel** de bloquer les captures : c'est une astuce (le calque des champs mot de passe,
  qu'iOS masque). Elle fonctionne sur les iOS actuels mais pourrait cesser avec une future version d'iOS. Rien n'empêche de
  photographier l'écran avec un autre téléphone.
- Sur le **site web** (Safari, ordinateur), bloquer les captures est impossible.
- Dans cette app de test, le bouton **Imprimer** ne fait rien (l'impression n'est pas branchée) ; il faut se connecter une
  première fois dans l'app.
