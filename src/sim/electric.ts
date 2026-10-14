import { decompositionVoltage } from '../chem/thermo';
import type { Grid } from './grid';
import type { ReactionRt } from './registry';

/** Abaixo disso a célula é isolante (S/m). */
export const SIGMA_MIN = 1e-3;
const LEAK = 1e-6;

export interface ElectrodeFace {
  metal: number;
  elec: number;
  /** corrente (A) que atravessa a interface, sempre ≥ 0 */
  I: number;
  /** true: metal → eletrólito (ânodo, oxidação); false: cátodo */
  anodic: boolean;
  /** limiar de tensão da interface (V) */
  E: number;
  rx: ReactionRt;
}

export interface CircuitResult {
  current: number; // A saindo do terminal +
  power: number; // W entregue pela fonte
  faces: ElectrodeFace[];
  solvedCells: number;
  iterations: number;
}

/**
 * Circuito elétrico no grid: resolve ∇·(σ∇V) = 0 (lei de Kirchhoff por célula)
 * com gradiente conjugado pré-condicionado (Jacobi).
 * - Terminais + e − são potenciais fixos.
 * - Metal↔eletrólito é uma interface eletroquímica: só passa corrente se a
 *   diferença de potencial passar do limiar E = (E_decomp + η)/2.
 * - Efeito Joule P = G·ΔV² aquece as células.
 */
export class Circuit {
  V = new Float64Array(0);
  sigma = new Float64Array(0);
  J = new Float32Array(0);
  /** estado das interfaces por face (chave i*4+dir): 0 off, 1 anódica, 2 catódica */
  private mode = new Map<number, number>();
  private uIndex = new Int32Array(0);
  private cls = new Uint8Array(0);
  private lastM = -1;
  private eCache = new Map<number, number>();
  last: CircuitResult = { current: 0, power: 0, faces: [], solvedCells: 0, iterations: 0 };

  constructor(private g: Grid) {
    this.resize();
  }

  resize() {
    const N = this.g.size;
    this.V = new Float64Array(N);
    this.sigma = new Float64Array(N);
    this.J = new Float32Array(N);
    this.uIndex = new Int32Array(N);
  }

  private interfaceE(rx: ReactionRt, T: number) {
    const key = rx.id * 100000 + Math.round(T / 5);
    let E = this.eCache.get(key);
    if (E === undefined) {
      E = (Math.max(0, decompositionVoltage(rx.def, T, this.g.reg.lookup)) + rx.def.electro!.overpotential) / 2;
      this.eCache.set(key, E);
    }
    return E;
  }

  clearCache() {
    this.eCache.clear();
  }

  step(sourceV: number, dt: number, dx: number, onJoule: (i: number, E: number) => void): CircuitResult {
    const g = this.g;
    const { w, h, sp, ph, T, term } = g;
    const species = g.reg.species;
    const N = g.size;
    const sigma = this.sigma;
    const V = this.V;

    // classe da célula: 0 isolante, 1 condutor eletrônico, 2 eletrólito ativo, 3 condutor iônico sem reação
    if (this.cls.length !== N) this.cls = new Uint8Array(N);
    const cls = this.cls;
    const terms: number[] = [];
    for (let i = 0; i < N; i++) {
      const s = species[sp[i]];
      const p = ph[i];
      let sg = s.sigma[p];
      if (sg > 0 && s.alpha > 0 && p < 2) sg = sg / Math.max(0.05, 1 + s.alpha * (T[i] - 293.15));
      sigma[i] = sg;
      if (sg < SIGMA_MIN) cls[i] = 0;
      else if (s.metal) cls[i] = 1;
      else if (s.electro && (s.electro.reactants[0].phase < 0 || s.electro.reactants[0].phase === p)) cls[i] = 2;
      else cls[i] = 3;
      if (term[i] !== 0 && cls[i] !== 0) terms.push(i);
    }
    const hasTerm = terms.length > 0;
    this.J.fill(0);
    if (!hasTerm) {
      V.fill(0);
      this.last = { current: 0, power: 0, faces: [], solvedCells: 0, iterations: 0 };
      return this.last;
    }

    // tipo de face entre i e j: 0 nenhuma, 1 ôhmica, 2 interface eletroquímica
    const faceKind = (i: number, j: number): number => {
      const ci = cls[i];
      const cj = cls[j];
      if (ci === 0 || cj === 0) return 0;
      if ((ci === 1) === (cj === 1)) return 1;
      // metal ↔ iônico: só com reação (senão é eletrodo bloqueante)
      return ci === 2 || cj === 2 ? 2 : 0;
    };

    // componente conexa a partir dos terminais (BFS)
    const u = this.uIndex;
    u.fill(-1);
    const order: number[] = [];
    const queue: number[] = [];
    for (const i of terms) {
      u[i] = -2; // visitado
      queue.push(i);
    }
    while (queue.length) {
      const i = queue.pop()!;
      if (term[i] === 0) order.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      const nbs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nbs) {
        if (j < 0 || u[j] !== -1) continue;
        if (faceKind(i, j) === 0) continue;
        u[j] = -2;
        queue.push(j);
      }
    }
    for (let i = 0; i < N; i++) if (u[i] === -2) u[i] = -1;
    // ordem natural (linha a linha): melhora o pré-condicionador IC(0)
    order.sort((a, b) => a - b);
    order.forEach((c, k) => (u[c] = k));
    const M = order.length;

    // potencial fora do circuito = 0; terminais fixos
    for (let i = 0; i < N; i++) {
      if (term[i] > 0 && sigma[i] >= SIGMA_MIN) V[i] = sourceV;
      else if (term[i] < 0 && sigma[i] >= SIGMA_MIN) V[i] = 0;
      else if (u[i] < 0) V[i] = 0;
    }

    const faceKey = (i: number, d: number) => i * 4 + d;
    const dirs = [-1, 1, -w, w];
    const faceG = (i: number, j: number) => ((2 * sigma[i] * sigma[j]) / (sigma[i] + sigma[j])) * dx;

    // até 3 resoluções por quadro para acertar o estado das interfaces
    let iterations = 0;
    const nbIdx = new Int32Array(M * 4);
    const nbG = new Float64Array(M * 4);
    const diag = new Float64Array(M);
    const rhs = new Float64Array(M);
    const x = new Float64Array(M);
    for (let pass = 0; pass < 3; pass++) {
      nbIdx.fill(-1);
      diag.fill(0);
      rhs.fill(0);
      for (let k = 0; k < M; k++) {
        const i = order[k];
        const cx = i % w;
        const cy = (i / w) | 0;
        for (let d = 0; d < 4; d++) {
          if ((d === 0 && cx === 0) || (d === 1 && cx === w - 1) || (d === 2 && cy === 0) || (d === 3 && cy === h - 1)) continue;
          const j = i + dirs[d];
          const kind = faceKind(i, j);
          if (kind === 0) continue;
          let G = faceG(i, j);
          let b = 0;
          if (kind === 2) {
            const metalIsI = species[sp[i]].metal;
            const m = metalIsI ? i : j;
            const e = metalIsI ? j : i;
            const dm = metalIsI ? d : d ^ 1;
            const md = this.mode.get(faceKey(m, dm)) ?? 0;
            const E = this.interfaceE(species[sp[e]].electro!, T[e]);
            if (md === 0) G *= LEAK;
            else {
              // anódica: b_m = +G·E, b_e = −G·E; catódica: o contrário
              const sgn = md === 1 ? 1 : -1;
              b = (i === m ? 1 : -1) * sgn * G * E;
            }
          }
          diag[k] += G;
          rhs[k] += b;
          if (u[j] >= 0) {
            nbIdx[k * 4 + d] = u[j];
            nbG[k * 4 + d] = G;
          } else {
            rhs[k] += G * V[j]; // vizinho fixo
          }
        }
      }
      for (let k = 0; k < M; k++) x[k] = V[order[k]];
      // O primeiro quadro (ou após mudança grande) pode precisar de centenas de
      // iterações; depois o ponto de partida é a solução anterior. Limitar por
      // quadro mantém a taxa de quadros: a solução termina de convergir nos seguintes.
      const cap = this.lastM === M ? 15 : 600;
      iterations += pcg(M, nbIdx, nbG, diag, rhs, x, cap, 1e-10);
      for (let k = 0; k < M; k++) V[order[k]] = x[k];

      // atualiza estado das interfaces
      let changed = false;
      for (let k = 0; k < M + 0; k++) {
        const i = order[k];
        if (cls[i] !== 1) continue;
        changed = this.updateModes(i, faceKind, faceKey) || changed;
      }
      // terminais metálicos também podem tocar eletrólito
      for (const i of terms) {
        if (cls[i] === 1) changed = this.updateModes(i, faceKind, faceKey) || changed;
      }
      if (!changed) break;
    }

    this.lastM = M;
    // correntes, Joule e interfaces
    const faces: ElectrodeFace[] = [];
    let current = 0;
    for (const i of [...order, ...terms]) {
      const cx = i % w;
      const cy = (i / w) | 0;
      for (let d = 0; d < 4; d++) {
        if ((d === 0 && cx === 0) || (d === 1 && cx === w - 1) || (d === 2 && cy === 0) || (d === 3 && cy === h - 1)) continue;
        const j = i + dirs[d];
        const kind = faceKind(i, j);
        if (kind === 0) continue;
        if (u[j] < 0 && term[j] === 0) continue;
        const G = faceG(i, j);
        let Iij: number; // corrente i → j
        let joule: number;
        if (kind === 1) {
          Iij = G * (V[i] - V[j]);
          joule = G * (V[i] - V[j]) ** 2;
        } else {
          const metalIsI = species[sp[i]].metal;
          const m = metalIsI ? i : j;
          const e = metalIsI ? j : i;
          const dm = metalIsI ? d : d ^ 1;
          const md = this.mode.get(faceKey(m, dm)) ?? 0;
          if (md === 0) continue;
          const E = this.interfaceE(species[sp[e]].electro!, T[e]);
          const over = md === 1 ? V[m] - V[e] - E : V[e] - V[m] - E;
          const I = Math.max(0, G * over);
          Iij = (md === 1) === (i === m) ? I : -I;
          joule = I * Math.max(0, over);
          if (i < j) faces.push({ metal: m, elec: e, I, anodic: md === 1, E, rx: species[sp[e]].electro! });
        }
        if (term[i] > 0 && term[j] <= 0) current += Iij;
        const a = Math.abs(Iij) / (dx * dx);
        if (a > this.J[i]) this.J[i] = a;
        // cada face é visitada dos dois lados: metade da energia para cada célula
        onJoule(i, 0.5 * joule * dt);
      }
    }
    this.last = { current, power: current * sourceV, faces, solvedCells: M, iterations };
    return this.last;
  }

  private updateModes(i: number, faceKind: (i: number, j: number) => number, faceKey: (i: number, d: number) => number) {
    const g = this.g;
    const { w, h } = g;
    const species = g.reg.species;
    const V = this.V;
    const cx = i % w;
    const cy = (i / w) | 0;
    const dirs = [-1, 1, -w, w];
    let changed = false;
    for (let d = 0; d < 4; d++) {
      if ((d === 0 && cx === 0) || (d === 1 && cx === w - 1) || (d === 2 && cy === 0) || (d === 3 && cy === h - 1)) continue;
      const j = i + dirs[d];
      if (faceKind(i, j) !== 2) continue;
      const E = this.interfaceE(species[g.sp[j]].electro!, g.T[j]);
      const dv = V[i] - V[j];
      const key = faceKey(i, d);
      const old = this.mode.get(key) ?? 0;
      let md = 0;
      // histerese de 1 mV evita liga/desliga a cada quadro
      if (old === 1) md = dv - E > -1e-3 ? 1 : 0;
      else if (old === 2) md = -dv - E > -1e-3 ? 2 : 0;
      else md = dv > E + 1e-3 ? 1 : -dv > E + 1e-3 ? 2 : 0;
      if (md !== old) {
        changed = true;
        if (md === 0) this.mode.delete(key);
        else this.mode.set(key, md);
      }
    }
    return changed;
  }
}

/**
 * Gradiente conjugado pré-condicionado com Cholesky incompleto IC(0).
 * Matriz em formato de vizinhos: A_kk = diag[k], A_kj = −nbG[k*4+d] para j = nbIdx[k*4+d].
 * Os índices seguem a ordem natural do grid, então vizinhos de índice menor
 * formam a parte triangular inferior.
 */
export function pcg(
  M: number,
  nbIdx: Int32Array,
  nbG: Float64Array,
  diag: Float64Array,
  b: Float64Array,
  x: Float64Array,
  maxIter: number,
  tol: number,
): number {
  if (M === 0) return 0;
  // fatoração IC(0): L_kk² = A_kk − Σ_{j<k} (G_kj / L_jj)²
  const Ld = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    let d = diag[k];
    const o = k * 4;
    for (let q = 0; q < 4; q++) {
      const j = nbIdx[o + q];
      if (j >= 0 && j < k) {
        const l = nbG[o + q] / Ld[j];
        d -= l * l;
      }
    }
    Ld[k] = Math.sqrt(d > diag[k] * 1e-12 ? d : diag[k] * 1e-12);
  }
  const y = new Float64Array(M);
  const precond = (r: Float64Array, z: Float64Array) => {
    for (let k = 0; k < M; k++) {
      let s = r[k];
      const o = k * 4;
      for (let q = 0; q < 4; q++) {
        const j = nbIdx[o + q];
        if (j >= 0 && j < k) s += (nbG[o + q] / Ld[j]) * y[j];
      }
      y[k] = s / Ld[k];
    }
    for (let k = M - 1; k >= 0; k--) {
      let s = y[k];
      const o = k * 4;
      for (let q = 0; q < 4; q++) {
        const i = nbIdx[o + q];
        if (i > k) s += (nbG[o + q] / Ld[k]) * z[i];
      }
      z[k] = s / Ld[k];
    }
  };

  const r = new Float64Array(M);
  const z = new Float64Array(M);
  const p = new Float64Array(M);
  const Ap = new Float64Array(M);
  const mul = (v: Float64Array, out: Float64Array) => {
    for (let k = 0; k < M; k++) {
      let s = diag[k] * v[k];
      const o = k * 4;
      for (let d = 0; d < 4; d++) {
        const j = nbIdx[o + d];
        if (j >= 0) s -= nbG[o + d] * v[j];
      }
      out[k] = s;
    }
  };
  mul(x, Ap);
  let bn = 0;
  for (let k = 0; k < M; k++) {
    r[k] = b[k] - Ap[k];
    bn += b[k] * b[k];
  }
  bn = Math.sqrt(bn) || 1;
  precond(r, z);
  let rz = 0;
  for (let k = 0; k < M; k++) {
    p[k] = z[k];
    rz += r[k] * z[k];
  }
  let it = 0;
  for (; it < maxIter; it++) {
    let rn = 0;
    for (let k = 0; k < M; k++) rn += r[k] * r[k];
    if (Math.sqrt(rn) / bn < tol) break;
    mul(p, Ap);
    let pAp = 0;
    for (let k = 0; k < M; k++) pAp += p[k] * Ap[k];
    if (pAp <= 0) break;
    const alpha = rz / pAp;
    for (let k = 0; k < M; k++) {
      x[k] += alpha * p[k];
      r[k] -= alpha * Ap[k];
    }
    precond(r, z);
    let rzNew = 0;
    for (let k = 0; k < M; k++) rzNew += r[k] * z[k];
    const beta = rzNew / rz;
    rz = rzNew;
    for (let k = 0; k < M; k++) p[k] = z[k] + beta * p[k];
  }
  return it;
}
