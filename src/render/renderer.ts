import { idealGasMoles } from '../chem/thermo';
import type { Simulation } from '../sim/simulation';
import { AIR, AIR_O2 } from '../sim/registry';
import { SIGMA_MIN } from '../sim/electric';

export type ViewMode = 'material' | 'temp' | 'voltage' | 'current';

const AIR_RGB: [number, number, number] = [11, 18, 32];

/** Cor aproximada de corpo negro (incandescência) para T em K. */
function blackbody(T: number): [number, number, number] {
  const t = Math.min(1, (T - 800) / 2500);
  if (t < 0.3) return [180 + 250 * t, 20 + 100 * t, 0];
  if (t < 0.7) return [255, 50 + 400 * (t - 0.3), 40 * (t - 0.3)];
  return [255, 210 + 150 * (t - 0.7), 150 + 350 * (t - 0.7)];
}

/** Mapa de cor tipo "inferno" entre 0 e 1. */
function inferno(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164],
  ];
  const f = t * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(f));
  const u = f - k;
  const a = stops[k];
  const b = stops[k + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

export class Renderer {
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint32Array;
  mode: ViewMode = 'material';
  hover: { x: number; y: number; r: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, private sim: Simulation) {
    const g = sim.grid;
    this.off = document.createElement('canvas');
    this.off.width = g.w;
    this.off.height = g.h;
    this.offCtx = this.off.getContext('2d')!;
    this.img = this.offCtx.createImageData(g.w, g.h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  draw() {
    const { grid: g, circuit } = this.sim;
    const species = g.reg.species;
    const buf = this.buf;
    const vMax = Math.max(1e-9, Math.abs(this.sim.settings.sourceV));
    for (let i = 0; i < g.size; i++) {
      const id = g.sp[i];
      const p = g.ph[i];
      const T = g.T[i];
      let r: number;
      let gg: number;
      let b: number;
      if (this.mode === 'temp') {
        // escala log de 150 K a 4000 K
        [r, gg, b] = inferno(Math.log(T / 150) / Math.log(4000 / 150));
        if (id === AIR) [r, gg, b] = [r * 0.55, gg * 0.55, b * 0.55];
      } else if (this.mode === 'voltage') {
        const base = species[id].rgb[p];
        const dim = id === AIR ? 0.05 : 0.18;
        [r, gg, b] = [base[0] * dim, base[1] * dim, base[2] * dim];
        if (circuit.sigma[i] >= SIGMA_MIN) {
          const v = circuit.V[i] / vMax;
          [r, gg, b] = v >= 0 ? [60 + 195 * v, 40 + 40 * v, 60 * (1 - v)] : [40, 60, 60 + 195 * -v];
        }
      } else if (this.mode === 'current') {
        const base = species[id].rgb[p];
        const dim = id === AIR ? 0.05 : 0.15;
        [r, gg, b] = [base[0] * dim, base[1] * dim, base[2] * dim];
        const J = circuit.J[i];
        if (J > 0) {
          // log10 J de 10 a 1e9 A/m²
          const t = (Math.log10(J) - 1) / 8;
          [r, gg, b] = inferno(0.15 + 0.85 * t);
        }
      } else {
        if (id === AIR) {
          // ar: escurece sem O2, avermelha quando quente
          const lack = 1 - Math.min(1, g.o2[i] / AIR_O2);
          const heat = Math.max(0, Math.min(1, (T - 320) / 1200));
          r = AIR_RGB[0] + heat * 90 - lack * 6;
          gg = AIR_RGB[1] + heat * 25 - lack * 8;
          b = AIR_RGB[2] - lack * 10;
        } else {
          const c = species[id].rgb[p];
          r = c[0];
          gg = c[1];
          b = c[2];
          if (p === 2) {
            // gás: mistura com o fundo conforme a "concentração" na célula
            const f = 0.25 + 0.65 * Math.min(1, g.n[i] / idealGasMoles(g.cellVolume, T));
            r = AIR_RGB[0] + (r - AIR_RGB[0]) * f;
            gg = AIR_RGB[1] + (gg - AIR_RGB[1]) * f;
            b = AIR_RGB[2] + (b - AIR_RGB[2]) * f;
          } else {
            // leve textura para sólidos/líquidos
            const n = ((i * 2654435761) >>> 24) / 255;
            const k = p === 0 ? 0.9 + 0.12 * n : 0.95 + 0.06 * n;
            r *= k;
            gg *= k;
            b *= k;
          }
        }
        if (T > 800 && id !== AIR) {
          const [br, bg, bb] = blackbody(T);
          const a = Math.min(0.85, (T - 800) / 1400);
          r = r * (1 - a) + br * a;
          gg = gg * (1 - a) + bg * a;
          b = b * (1 - a) + bb * a;
        }
        if (g.term[i] > 0) [r, gg, b] = [239, 68, 68];
        else if (g.term[i] < 0) [r, gg, b] = [59, 130, 246];
      }
      const R8 = r < 0 ? 0 : r > 255 ? 255 : r | 0;
      const G8 = gg < 0 ? 0 : gg > 255 ? 255 : gg | 0;
      const B8 = b < 0 ? 0 : b > 255 ? 255 : b | 0;
      buf[i] = 0xff000000 | (B8 << 16) | (G8 << 8) | R8;
    }
    this.offCtx.putImageData(this.img, 0, 0);
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, this.canvas.width, this.canvas.height);

    if (this.hover) {
      const sx = this.canvas.width / g.w;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc((this.hover.x + 0.5) * sx, (this.hover.y + 0.5) * sx, Math.max(1, this.hover.r + 0.5) * sx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
