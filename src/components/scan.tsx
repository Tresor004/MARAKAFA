import { useEffect, useRef, useState } from "react";
import { Modal, Button, inputClass } from "./ui";
import { IconCamera } from "./Icons";

/**
 * Lecture de codes-barres.
 *
 * 1. Douchette (USB / Bluetooth) : elle se comporte comme un clavier qui « tape » le code très vite puis Entrée.
 *    - Dans un champ de saisie : le champ gère lui-même Entrée (voir Sales : champ « Rechercher / scanner »).
 *    - Hors champ de saisie : `useScanner` détecte les frappes rapides et appelle `onScan`.
 * 2. Caméra : API `BarcodeDetector` (Chrome / Edge / Android). Si le navigateur ne la fournit pas, on propose la saisie manuelle.
 */

const MAX_KEY_GAP_MS = 60;   // au-delà, ce n'est plus une douchette mais un humain qui tape
const MIN_CODE_LENGTH = 4;

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;

    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (now - last > MAX_KEY_GAP_MS) buffer = "";
      last = now;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_CODE_LENGTH) {
          e.preventDefault();
          const code = buffer;
          buffer = "";
          cb.current(code);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

// ───────────────────────── Caméra ─────────────────────────

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = (new (opts?: { formats?: string[] }) => BarcodeDetectorLike) & { getSupportedFormats?: () => Promise<string[]> };

function detectorCtor(): BarcodeDetectorCtor | null {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

export function cameraScanSupported(): boolean {
  return !!detectorCtor() && !!navigator.mediaDevices?.getUserMedia;
}

export function CameraScanner({ open, onClose, onDetect, title = "Scanner avec la caméra" }: {
  open: boolean;
  onClose: () => void;
  /** Appelé pour chaque code lu (le même code n'est pas répété avant 2 s). */
  onDetect: (code: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [last, setLast] = useState("");
  const [manual, setManual] = useState("");
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  useEffect(() => {
    if (!open) return;
    setError(""); setLast("");
    const Ctor = detectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setError("Ce navigateur ne sait pas lire les codes-barres avec la caméra. Utilisez Chrome ou Edge (ordinateur / Android), une douchette, ou saisissez le code ci-dessous.");
      return;
    }

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const seen = new Map<string, number>();

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const supported = (await Ctor.getSupportedFormats?.().catch(() => [] as string[])) ?? [];
        const wanted = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
        const formats = supported.length ? wanted.filter(f => supported.includes(f)) : wanted;
        const detector = new Ctor({ formats });

        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              const now = Date.now();
              for (const f of found) {
                const code = f.rawValue;
                if (!code || now - (seen.get(code) ?? 0) < 2000) continue;
                seen.set(code, now);
                setLast(code);
                onDetectRef.current(code);
              }
            }
          } catch { /* image pas prête : on réessaie au prochain passage */ }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(name === "NotAllowedError"
          ? "L'accès à la caméra a été refusé. Autorisez-le dans le navigateur, ou saisissez le code ci-dessous."
          : "Impossible d'ouvrir la caméra. Saisissez le code ci-dessous.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [open]);

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    onDetect(code);
    setLast(code);
    setManual("");
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="md"
      footer={<div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Terminer</Button></div>}>
      <div className="space-y-3">
        {!error && (
          <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,.8)]" />
          </div>
        )}
        {error && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex gap-2"><IconCamera size={18} className="flex-shrink-0 mt-0.5" /> <span>{error}</span></div>}
        {last && <div className="text-sm text-emerald-700 font-semibold">Dernier code lu : <span className="font-mono">{last}</span></div>}
        <div className="flex gap-2">
          <input className={inputClass + " font-mono"} placeholder="Saisir un code manuellement" value={manual}
            onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitManual(); } }} />
          <Button variant="outline" onClick={submitManual} disabled={!manual.trim()}>Ajouter</Button>
        </div>
        <p className="text-xs text-slate-500">La caméra reste ouverte : scannez plusieurs articles à la suite, puis « Terminer ».</p>
      </div>
    </Modal>
  );
}
