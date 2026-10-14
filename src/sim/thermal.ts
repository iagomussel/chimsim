import type { Grid } from './grid';
import { AIR } from './registry';

/** Constante de Stefan–Boltzmann (W/m²·K⁴). */
export const SIGMA_SB = 5.670374419e-8;

let dE = new Float64Array(0);
let capA = new Float64Array(0);
let kA = new Float64Array(0);

/**
 * Condução de calor entre células vizinhas (lei de Fourier, explícito).
 * G da face = média harmônica de k · Δx. O fluxo de cada face é limitado para
 * nunca passar do equilíbrio entre as duas células (estável para qualquer dt)
 * e é antissimétrico, então a energia total se conserva.
 */
export function stepConduction(g: Grid, dt: number, dx: number) {
  const { w, h, sp, ph, T, n } = g;
  const species = g.reg.species;
  const N = g.size;
  if (dE.length !== N) {
    dE = new Float64Array(N);
    capA = new Float64Array(N);
    kA = new Float64Array(N);
  }
  for (let i = 0; i < N; i++) {
    const s = species[sp[i]];
    const p = ph[i];
    capA[i] = n[i] * s.cp[p];
    kA[i] = s.k[p];
  }
  dE.fill(0);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const Ti = T[i];
      const ki = kA[i];
      const Ci = capA[i];
      if (x + 1 < w) exchange(i, i + 1, Ti, ki, Ci);
      if (y + 1 < h) exchange(i, i + w, Ti, ki, Ci);
    }
  }
  for (let i = 0; i < N; i++) {
    const e = dE[i];
    if (e === 0) continue;
    const C = capA[i];
    if (C > 0) {
      const t = T[i] + e / C;
      T[i] = t < 1 ? 1 : t;
    }
  }

  function exchange(i: number, j: number, Ti: number, ki: number, Ci: number) {
    const dT = Ti - T[j];
    if (dT === 0) return;
    const kj = kA[j];
    const ks = ki + kj;
    if (ks === 0) return;
    const G = ((2 * ki * kj) / ks) * dx;
    const Cj = capA[j];
    let Q = G * dT * dt;
    // no máximo 1/5 do caminho até o equilíbrio do par (4 faces por célula)
    const cs = Ci + Cj;
    const Qmax = cs > 0 ? (0.2 * (dT < 0 ? -dT : dT) * Ci * Cj) / cs : 0;
    if (Q > Qmax) Q = Qmax;
    else if (Q < -Qmax) Q = -Qmax;
    dE[i] -= Q;
    dE[j] += Q;
  }
}

/**
 * Radiação térmica (Stefan–Boltzmann) das superfícies de sólidos e líquidos
 * que dão para um gás: P = ε·σ·A·(T⁴ − T_amb⁴). A energia sai do sistema
 * (o entorno é tratado como corpo negro na temperatura ambiente).
 */
export function stepRadiation(g: Grid, dt: number, dx: number) {
  const { w, h, sp, ph, T } = g;
  const species = g.reg.species;
  const Ta4 = g.ambientT ** 4;
  const A = dx * dx;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (ph[i] === 2) continue;
      const Ti = T[i];
      if (Ti < 500) continue;
      let faces = 0;
      if (x > 0 && ph[i - 1] === 2) faces++;
      if (x < w - 1 && ph[i + 1] === 2) faces++;
      if (y > 0 && ph[i - w] === 2) faces++;
      if (y < h - 1 && ph[i + w] === 2) faces++;
      if (!faces) continue;
      const s = species[sp[i]];
      const C = g.n[i] * s.cp[ph[i]];
      if (C <= 0) continue;
      let E = s.emissivity * SIGMA_SB * A * faces * (Ti ** 4 - Ta4) * dt;
      const Emax = 0.5 * C * (Ti - g.ambientT);
      if (E > Emax) E = Emax;
      T[i] = Ti - E / C;
    }
  }
}

/** Soma energia (J) numa célula. */
export function addHeat(g: Grid, i: number, E: number) {
  const C = g.heatCap(i);
  if (C > 0) g.T[i] = Math.max(1, g.T[i] + E / C);
}

/**
 * Mudança de fase com calor latente.
 * Ao passar de Tf/Te a célula fica presa na temperatura de transição e o excesso
 * de energia vai para `lat` até completar ΔH·n. Conserva a entalpia da célula.
 */
export function stepPhases(g: Grid) {
  const { sp } = g;
  const species = g.reg.species;
  for (let i = 0; i < g.size; i++) {
    const id = sp[i];
    if (id === AIR) continue;
    if (species[id].inert) continue;
    // até 2 transições seguidas (ex.: sólido muito quente → líquido → gás)
    if (phaseCell(g, i)) phaseCell(g, i);
  }
}

/** Processa uma transição de fase na célula. Devolve true se a fase mudou. */
function phaseCell(g: Grid, i: number): boolean {
  const { ph, T, n, lat } = g;
  const s = g.reg.species[g.sp[i]];
  const p = ph[i];
  const C = n[i] * s.cp[p];
  if (C <= 0) return false;

  if (p < 2 && (lat[i] > 0 || (lat[i] === 0 && T[i] > (p === 0 ? s.Tm : s.Tb)))) {
    const Ttr = p === 0 ? s.Tm : s.Tb;
    const L = (p === 0 ? s.Hfus : s.Hvap) * n[i];
    lat[i] += (T[i] - Ttr) * C;
    T[i] = Ttr;
    if (lat[i] >= L) {
      const extra = lat[i] - L;
      lat[i] = 0;
      ph[i] = p + 1;
      g.fixed[i] = 0;
      T[i] = Ttr + extra / (n[i] * s.cp[p + 1]);
      return true;
    } else if (lat[i] < 0) {
      T[i] = Ttr + lat[i] / C;
      lat[i] = 0;
    }
  } else if (p > 0 && (lat[i] < 0 || (lat[i] === 0 && T[i] < (p === 1 ? s.Tm : s.Tb)))) {
    const Ttr = p === 1 ? s.Tm : s.Tb;
    const L = (p === 1 ? s.Hfus : s.Hvap) * n[i];
    lat[i] += (T[i] - Ttr) * C;
    T[i] = Ttr;
    if (lat[i] <= -L) {
      const extra = lat[i] + L;
      lat[i] = 0;
      ph[i] = p - 1;
      if (p - 1 === 0) g.fixed[i] = s.rigid ? 1 : 0;
      T[i] = Math.max(1, Ttr + extra / (n[i] * s.cp[p - 1]));
      return true;
    } else if (lat[i] > 0) {
      T[i] = Ttr + lat[i] / C;
      lat[i] = 0;
    }
  }
  return false;
}
