import { idealGasMoles } from '../chem/thermo';
import type { Phase } from '../data/species';
import { AIR, AIR_O2, type Registry } from './registry';

/** Número de acumuladores eletroquímicos por célula (produtos esperando virar célula). */
export const ACC = 4;

/**
 * Estado do mundo em arrays tipados (Structure of Arrays).
 * Cada célula tem UMA espécie, numa fase, com quantidade em mol e temperatura.
 * O ar ambiente é uma espécie especial com fração de O2 própria.
 */
export class Grid {
  readonly size: number;
  sp: Uint16Array;
  ph: Uint8Array;
  T: Float32Array;
  n: Float64Array;
  /** calor latente acumulado numa transição de fase em andamento (J) */
  lat: Float64Array;
  /** fração molar de O2 (só células de ar) */
  o2: Float32Array;
  /** sólido preso no lugar (1) ou solto/pó (0) */
  fixed: Uint8Array;
  /** terminal da fonte: +1, −1 ou 0 */
  term: Int8Array;
  /** produtos de eletrólise acumulados (mol), ACC por célula */
  acc: Float64Array;
  upd: Uint8Array;

  constructor(
    public readonly w: number,
    public readonly h: number,
    public readonly reg: Registry,
    public ambientT = 298.15,
  ) {
    this.size = w * h;
    this.sp = new Uint16Array(this.size);
    this.ph = new Uint8Array(this.size);
    this.T = new Float32Array(this.size);
    this.n = new Float64Array(this.size);
    this.lat = new Float64Array(this.size);
    this.o2 = new Float32Array(this.size);
    this.fixed = new Uint8Array(this.size);
    this.term = new Int8Array(this.size);
    this.acc = new Float64Array(this.size * ACC);
    this.upd = new Uint8Array(this.size);
    this.clear();
  }

  get cellVolume() {
    return this.reg.cellVolume;
  }

  clear() {
    for (let i = 0; i < this.size; i++) this.setAir(i, this.ambientT);
  }

  idx(x: number, y: number) {
    return y * this.w + x;
  }

  inside(x: number, y: number) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  setAir(i: number, T: number, o2 = AIR_O2) {
    this.sp[i] = AIR;
    this.ph[i] = 2;
    this.T[i] = T;
    this.n[i] = idealGasMoles(this.cellVolume, T);
    this.lat[i] = 0;
    this.o2[i] = o2;
    this.fixed[i] = 0;
    this.term[i] = 0;
    this.acc.fill(0, i * ACC, i * ACC + ACC);
  }

  /** Mol "naturais" de uma célula cheia dessa espécie nessa fase e temperatura. */
  fullMoles(spId: number, phase: Phase, T: number) {
    const s = this.reg.species[spId];
    return phase === 2 ? idealGasMoles(this.cellVolume, T) : s.nCell[phase];
  }

  setCell(i: number, spId: number, phase: Phase, T: number, n?: number, fixed?: boolean) {
    if (spId === AIR) return this.setAir(i, T);
    const s = this.reg.species[spId];
    this.sp[i] = spId;
    this.ph[i] = phase;
    this.T[i] = T;
    this.n[i] = n ?? this.fullMoles(spId, phase, T);
    this.lat[i] = 0;
    this.o2[i] = 0;
    this.fixed[i] = phase === 0 && (fixed ?? s.rigid) ? 1 : 0;
    this.term[i] = 0;
    this.acc.fill(0, i * ACC, i * ACC + ACC);
  }

  /** Capacidade térmica da célula (J/K). */
  heatCap(i: number) {
    return this.n[i] * this.reg.species[this.sp[i]].cp[this.ph[i]];
  }

  /** Entalpia total da célula (J), incluindo calor latente em andamento. */
  enthalpy(i: number) {
    const s = this.reg.species[this.sp[i]];
    const p = this.ph[i];
    return this.n[i] * (s.ha[p] + s.cp[p] * this.T[i]) + this.lat[i];
  }

  /** Densidade (kg/m³) para empuxo. Gás: ideal a 1 atm. */
  density(i: number) {
    const s = this.reg.species[this.sp[i]];
    const p = this.ph[i];
    if (p === 2) return (101325 * s.M) / (8.314462618 * this.T[i]);
    return s.rho[p];
  }

  swap(i: number, j: number) {
    let t: number;
    t = this.sp[i]; this.sp[i] = this.sp[j]; this.sp[j] = t;
    t = this.ph[i]; this.ph[i] = this.ph[j]; this.ph[j] = t;
    t = this.T[i]; this.T[i] = this.T[j]; this.T[j] = t;
    t = this.n[i]; this.n[i] = this.n[j]; this.n[j] = t;
    t = this.lat[i]; this.lat[i] = this.lat[j]; this.lat[j] = t;
    t = this.o2[i]; this.o2[i] = this.o2[j]; this.o2[j] = t;
    t = this.fixed[i]; this.fixed[i] = this.fixed[j]; this.fixed[j] = t;
    t = this.term[i]; this.term[i] = this.term[j]; this.term[j] = t;
    const ai = i * ACC;
    const aj = j * ACC;
    for (let k = 0; k < ACC; k++) {
      t = this.acc[ai + k]; this.acc[ai + k] = this.acc[aj + k]; this.acc[aj + k] = t;
    }
    this.upd[i] = 1;
    this.upd[j] = 1;
  }

  copy(src: number, dst: number) {
    this.sp[dst] = this.sp[src];
    this.ph[dst] = this.ph[src];
    this.T[dst] = this.T[src];
    this.n[dst] = this.n[src];
    this.lat[dst] = this.lat[src];
    this.o2[dst] = this.o2[src];
    this.fixed[dst] = this.fixed[src];
    this.term[dst] = this.term[src];
    this.acc.copyWithin(dst * ACC, src * ACC, src * ACC + ACC);
  }

  /**
   * Abre espaço na posição i empurrando a coluna para cima até a primeira célula de ar.
   * Essa célula de ar some (o ar é um reservatório aberto). Devolve false se bloqueado.
   */
  pushUp(i: number): boolean {
    const x = i % this.w;
    let y = (i / this.w) | 0;
    let top = y;
    while (top >= 0) {
      const k = this.idx(x, top);
      if (this.sp[k] === AIR) break;
      if (this.ph[k] === 0 && this.fixed[k]) return false;
      top--;
    }
    if (top < 0) return false;
    for (let yy = top; yy < y; yy++) this.copy(this.idx(x, yy + 1), this.idx(x, yy));
    return true;
  }
}
