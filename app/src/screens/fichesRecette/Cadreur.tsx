import { useEffect, useRef, useState } from 'react';
import { CADRAGE_CENTRE, deplacer, type Cadrage } from '../../domain/photo';
import { chargerImage, dessinerCadrage, photoCadree, reduireImage } from '../../lib/image';
import { useNotifier } from '../../ui/Notifications';

/**
 * Photo d'une fiche recette : choix du fichier, puis cadrage 16/10 en faisant glisser l'aperçu et avec le zoom.
 * `onChange` reçoit la photo telle qu'elle sera enregistrée (ou null si retirée).
 */
export function Cadreur({ initiale, onChange }: { initiale: string | null; onChange: (photo: string | null) => void }) {
  const notifier = useNotifier();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [cadrage, setCadrage] = useState<Cadrage>(CADRAGE_CENTRE);
  const apercu = useRef<HTMLCanvasElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const glisse = useRef<{ x: number; y: number; depart: Cadrage } | null>(null);
  const [enGlisse, setEnGlisse] = useState(false);
  const rappel = useRef(onChange);
  useEffect(() => { rappel.current = onChange; });

  const montrer = async (src: string) => {
    const img = await chargerImage(src);
    setImage(img); setCadrage(CADRAGE_CENTRE);
    rappel.current(photoCadree(img, CADRAGE_CENTRE));
  };

  // Photo déjà enregistrée : affichée et recadrée au centre (enregistrée seulement si la fiche l'est).
  useEffect(() => {
    if (!initiale) return;
    let abandon = false;
    chargerImage(initiale).then(img => {
      if (abandon) return;
      setImage(img); setCadrage(CADRAGE_CENTRE);
      rappel.current(photoCadree(img, CADRAGE_CENTRE));
    }).catch(() => undefined);
    return () => { abandon = true; };
  }, [initiale]);

  useEffect(() => { if (image && apercu.current) dessinerCadrage(apercu.current, image, cadrage, 640); }, [image, cadrage]);

  const choisir = async (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    try { await montrer(await reduireImage(url)); } catch { notifier('Image illisible', 'err'); } finally { URL.revokeObjectURL(url); }
  };
  const retirer = () => { setImage(null); if (fichier.current) fichier.current.value = ''; onChange(null); };
  const valider = (c: Cadrage) => { if (image) onChange(photoCadree(image, c)); };

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
      {image && <>
        <canvas ref={apercu} aria-label="Aperçu de la photo" role="img"
          style={{ flexBasis: '100%', width: '100%', maxWidth: 320, aspectRatio: '16/10', borderRadius: 'var(--r)', cursor: enGlisse ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); glisse.current = { x: e.clientX, y: e.clientY, depart: cadrage }; setEnGlisse(true); }}
          onPointerMove={e => {
            const g = glisse.current;
            if (!g) return;
            setCadrage(deplacer(g.depart, e.clientX - g.x, e.clientY - g.y, image.width, image.height, e.currentTarget.getBoundingClientRect().width));
          }}
          onPointerUp={() => { if (glisse.current) { glisse.current = null; setEnGlisse(false); valider(cadrage); } }}
          onPointerCancel={() => { glisse.current = null; setEnGlisse(false); }} />
        <input type="range" min="100" max="300" aria-label="Zoom" style={{ flexBasis: '100%', width: '100%', maxWidth: 320 }}
          value={Math.round(cadrage.zoom * 100)} onChange={e => { setCadrage(c => ({ ...c, zoom: Number(e.target.value) / 100 })); }}
          onPointerUp={() => { valider(cadrage); }} onKeyUp={() => { valider(cadrage); }} />
        <span style={{ flexBasis: '100%', fontSize: '0.875rem', color: 'var(--gt)' }}>Glisse la photo et règle le zoom pour choisir le cadrage. Le plus propre : photo en paysage, plat au centre.</span>
      </>}
      <input ref={fichier} type="file" accept="image/*" aria-label="Choisir une photo" onChange={e => void choisir(e.target.files?.[0])} />
      <button type="button" className="btn btn-g btn-sm" onClick={retirer}>Retirer</button>
    </div>
  );
}
