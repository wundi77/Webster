// Fertige Animation auf der Arbeitsfläche: als stehendes Bild (die Bewegung läuft in der Vorschau)
import { useEffect, useRef } from 'react';
import { useEditor } from '../store';

export function LottieStill({ assetId }: { assetId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useEditor(s => s.doc.library.animations?.find(a => a.id === assetId)?.data);
  useEffect(() => {
    if (!ref.current || !data) return;
    let anim: { destroy: () => void } | null = null;
    let dead = false;
    import('lottie-web/build/player/lottie_light').then(m => {
      if (dead || !ref.current) return;
      const lottie = (m as unknown as { default: typeof import('lottie-web').default }).default;
      const a = lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(data) });
      a.addEventListener('DOMLoaded', () => a.goToAndStop(Math.round(a.totalFrames * 0.6), true));
      anim = a;
    });
    return () => { dead = true; anim?.destroy(); };
  }, [data]);
  return <div ref={ref} className="lottie-still" aria-hidden="true">{!data && <span>Animation fehlt</span>}</div>;
}
