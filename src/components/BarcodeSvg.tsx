import { useMemo } from "react";
import { barcodeBars } from "../utils/barcode";

/** Code-barres en SVG vectoriel (EAN-13 ou Code 128). N'affiche rien si le texte n'est pas encodable. */
export default function BarcodeSvg({ code, height = 48, showText = true, className = "" }: {
  code: string; height?: number; showText?: boolean; className?: string;
}) {
  const data = useMemo(() => { try { return barcodeBars(code); } catch { return null; } }, [code]);
  if (!data) return null;
  const quiet = 10;
  const total = data.width + quiet * 2;
  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <svg viewBox={`0 0 ${total} 100`} preserveAspectRatio="none" style={{ width: "100%", minWidth: 120, height }} shapeRendering="crispEdges" role="img" aria-label={`Code-barres ${code}`}>
        <rect width={total} height="100" fill="#fff" />
        {data.bars.map((b, i) => <rect key={i} x={b.x + quiet} y="0" width={b.w} height="100" fill="#000" />)}
      </svg>
      {showText && <span className="font-mono text-[11px] tracking-widest text-slate-700 mt-0.5">{code}</span>}
    </div>
  );
}
