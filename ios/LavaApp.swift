// LAVA — app iPhone de TEST : le site LAVA en plein écran, contenu masqué sur les captures et enregistrements d'écran.
// À coller à la place du contenu du fichier « …App.swift » d'un nouveau projet Xcode (voir ios/LISEZMOI.md).
import SwiftUI
import UIKit
import WebKit

private let ADRESSE = URL(string: "https://ravaaas.github.io/lava-hub-final/")!
private let FOND = UIColor(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255, alpha: 1)

@main
struct LavaApp: App {
    var body: some Scene {
        WindowGroup {
            SiteLava().background(Color(FOND).ignoresSafeArea())
        }
    }
}

/// Le site dans une vue web, posée dans un conteneur protégé.
struct SiteLava: UIViewRepresentable {
    func makeUIView(context: Context) -> VueProtegee {
        let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        web.allowsLinkPreview = false
        web.isOpaque = false
        web.backgroundColor = FOND
        web.load(URLRequest(url: ADRESSE))
        return VueProtegee(contenu: web)
    }

    func updateUIView(_ vue: VueProtegee, context: Context) {}
}

/// Conteneur dont le contenu n'apparaît ni sur les captures d'écran, ni dans les enregistrements ou la recopie de l'écran.
/// Astuce (non officielle, Apple ne propose rien) : iOS exclut des captures le calque d'un champ mot de passe
/// (isSecureTextEntry) ; on y place l'app. Si une future version d'iOS supprime ce calque, l'app reste utilisable
/// normalement (captures alors possibles) et le voile d'enregistrement ci-dessous continue de fonctionner.
final class VueProtegee: UIView {
    private let voile = UILabel()

    init(contenu: UIView) {
        super.init(frame: .zero)
        backgroundColor = FOND

        let champ = UITextField()
        champ.isSecureTextEntry = true
        let hote: UIView
        if let calqueSecurise = champ.subviews.first {
            calqueSecurise.subviews.forEach { $0.removeFromSuperview() }
            calqueSecurise.isUserInteractionEnabled = true
            hote = calqueSecurise
        } else {
            hote = UIView()
        }
        poser(hote, dans: self)
        poser(contenu, dans: hote)

        // Enregistrement ou recopie de l'écran en cours : l'app se cache aussi pour la personne qui enregistre.
        voile.text = "Enregistrement de l'écran bloqué"
        voile.textAlignment = .center
        voile.font = .systemFont(ofSize: 17, weight: .semibold)
        voile.textColor = .white
        voile.backgroundColor = .black
        poser(voile, dans: self)
        mettreAJourVoile()
        NotificationCenter.default.addObserver(self, selector: #selector(mettreAJourVoile),
                                               name: UIScreen.capturedDidChangeNotification, object: nil)
    }

    required init?(coder: NSCoder) { fatalError("non utilisé") }

    @objc private func mettreAJourVoile() { voile.isHidden = !UIScreen.main.isCaptured }

    private func poser(_ vue: UIView, dans parent: UIView) {
        vue.translatesAutoresizingMaskIntoConstraints = false
        parent.addSubview(vue)
        NSLayoutConstraint.activate([
            vue.topAnchor.constraint(equalTo: parent.topAnchor),
            vue.bottomAnchor.constraint(equalTo: parent.bottomAnchor),
            vue.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
            vue.trailingAnchor.constraint(equalTo: parent.trailingAnchor),
        ])
    }
}
