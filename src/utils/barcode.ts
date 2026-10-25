/**
 * Codes-barres 100 % locaux (aucune dépendance) : EAN-13 et Code 128.
 * - EAN-13 : codes à 13 chiffres au chiffre de contrôle valide (dont les codes internes générés par l'API, préfixe 2).
 * - Code 128 : tout le reste (codes courts comme « 100001 », alphanumériques). Sous-jeu C (chiffres par paires) quand c'est possible.
 */

export interface Bars {
  /** Positions (x) et largeurs (w) des barres noires, en modules. */
  bars: { x: number; w: number }[];
  /** Largeur totale en modules (zones de silence non comprises). */
  width: number;
  format: "ean13" | "code128";
}

// ───────────────────────── EAN-13 ─────────────────────────

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

function ean13Bits(code: string): string {
  const parity = PARITY[Number(code[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(code[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(code[i])];
  return bits + "101";
}

// ───────────────────────── Code 128 ─────────────────────────

// Largeurs (barre, espace, barre, espace, barre, espace) des symboles 0..105 ; 106 = arrêt (7 éléments)
const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Valeurs de symboles Code 128 (départ, données, contrôle, arrêt) pour un texte. */
export function code128Symbols(text: string): number[] {
  if (!text) throw new Error("Code vide");
  const useC = /^\d+$/.test(text) && text.length >= 4;
  const values: number[] = [];

  if (useC) {
    // Chiffres par paires ; si le nombre est impair, le premier chiffre passe en B puis on bascule en C
    let i = 0;
    if (text.length % 2 === 1) {
      values.push(START_B, text.charCodeAt(0) - 32, 99);
      i = 1;
    } else {
      values.push(START_C);
    }
    for (; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    values.push(START_B);
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) throw new Error(`Caractère non pris en charge : ${ch}`);
      values.push(c - 32);
    }
  }

  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, STOP);
  return values;
}

// ───────────────────────── API commune ─────────────────────────

export function barcodeBars(code: string): Bars {
  const clean = code.trim();
  if (isValidEan13(clean)) {
    const bits = ean13Bits(clean);
    const bars: Bars["bars"] = [];
    for (let i = 0; i < bits.length; ) {
      if (bits[i] === "1") {
        let j = i;
        while (j < bits.length && bits[j] === "1") j++;
        bars.push({ x: i, w: j - i });
        i = j;
      } else i++;
    }
    return { bars, width: bits.length, format: "ean13" };
  }

  const bars: Bars["bars"] = [];
  let x = 0;
  for (const v of code128Symbols(clean)) {
    const pattern = C128[v];
    for (let k = 0; k < pattern.length; k++) {
      const w = Number(pattern[k]);
      if (k % 2 === 0) bars.push({ x, w });
      x += w;
    }
  }
  return { bars, width: x, format: "code128" };
}

/** Le texte est-il imprimable sous forme de code-barres ? */
export function canEncode(code: string | null | undefined): boolean {
  if (!code || !code.trim()) return false;
  try { barcodeBars(code); return true; } catch { return false; }
}

/** SVG complet (chaîne) – utilisé pour l'impression d'étiquettes. */
export function barcodeSvgString(code: string, heightPx = 40, quiet = 10): string {
  const { bars, width } = barcodeBars(code);
  const total = width + quiet * 2;
  const rects = bars.map(b => `<rect x="${b.x + quiet}" y="0" width="${b.w}" height="100"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 100" preserveAspectRatio="none" width="100%" height="${heightPx}" shape-rendering="crispEdges" fill="#000">${rects}</svg>`;
}
