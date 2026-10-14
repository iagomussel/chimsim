/**
 * Farmacocinética de compartimentos (linear, 1ª ordem).
 *
 *   intestino ──ka──▶ central (V1) ──CL──▶ eliminado
 *                       ▲   │
 *                       Q   Q
 *                       │   ▼
 *                   periférico (V2)
 *
 * Unidades: tempo em h, volume em L, massa em mg, concentração em mg/L.
 * Os parâmetros dos remédios vêm por kg de peso (L/kg, L/h/kg) e são multiplicados pelo peso.
 * Modelo educativo: sem metabolismo saturável, sem interações, sem efeito (farmacodinâmica).
 */

export type Route = 'oral' | 'iv';

export interface DrugDef {
  key: string;
  name: string;
  /** fórmula molecular, para converter mg/L em µmol/L */
  formula?: string;
  /** biodisponibilidade oral (0–1) */
  F: number;
  /** constante de absorção (1/h) */
  ka: number;
  /** volume central (L/kg) */
  V: number;
  /** clearance (L/h/kg) */
  CL: number;
  /** clearance intercompartimental (L/h/kg); 0 = modelo de 1 compartimento */
  Q?: number;
  /** volume periférico (L/kg) */
  V2?: number;
  /** linhas de referência no gráfico */
  refs?: { label: string; mgL: number; t?: number }[];
  note?: string;
  sources?: string[];
  /** campos que não vêm direto da fonte */
  estimated?: string[];
  user?: boolean;
}

export interface Regimen {
  /** dose por tomada (mg) */
  dose: number;
  route: Route;
  /** intervalo entre doses (h) */
  tau: number;
  /** número de doses */
  count: number;
  /** peso (kg) */
  weight: number;
  /** duração da simulação (h) */
  tEnd: number;
}

export interface PkParams {
  F: number;
  ka: number;
  V1: number;
  CL: number;
  Q: number;
  V2: number;
}

export function scaleParams(d: DrugDef, weight: number): PkParams {
  const Q = (d.Q ?? 0) * weight;
  const V2 = (d.V2 ?? 0) * weight;
  return { F: d.F, ka: d.ka, V1: d.V * weight, CL: d.CL * weight, Q: V2 > 0 ? Q : 0, V2: V2 > 0 ? V2 : 0 };
}

export interface PkResult {
  t: Float64Array;
  c: Float64Array;
  doses: number[];
}

const DT_MAX = 0.01; // h

/** Integra por RK4 entre eventos de dose (as doses caem exatamente nos instantes certos). */
export function simulate(p: PkParams, reg: Regimen): PkResult {
  const doses: number[] = [];
  for (let k = 0; k < reg.count; k++) {
    const td = k * reg.tau;
    if (td <= reg.tEnd) doses.push(td);
  }
  const k10 = p.CL / p.V1;
  const k12 = p.Q > 0 ? p.Q / p.V1 : 0;
  const k21 = p.Q > 0 ? p.Q / p.V2 : 0;
  const ka = p.ka;
  // estado: [intestino, central, periférico] em mg
  const deriv = (g: number, c: number, q: number, out: number[]) => {
    out[0] = -ka * g;
    out[1] = ka * g - (k10 + k12) * c + k21 * q;
    out[2] = k12 * c - k21 * q;
  };

  const ts: number[] = [];
  const cs: number[] = [];
  let g = 0;
  let c = 0;
  let q = 0;
  const k1 = [0, 0, 0];
  const k2 = [0, 0, 0];
  const k3 = [0, 0, 0];
  const k4 = [0, 0, 0];
  let t = 0;
  ts.push(0);
  cs.push(0);
  for (let s = 0; s < doses.length; s++) {
    if (reg.route === 'oral') g += p.F * reg.dose;
    else c += reg.dose;
    ts.push(t);
    cs.push(c / p.V1);
    const end = s + 1 < doses.length ? doses[s + 1] : reg.tEnd;
    const len = end - t;
    if (len <= 0) continue;
    const n = Math.max(1, Math.ceil(len / DT_MAX));
    const h = len / n;
    for (let i = 0; i < n; i++) {
      deriv(g, c, q, k1);
      deriv(g + (h / 2) * k1[0], c + (h / 2) * k1[1], q + (h / 2) * k1[2], k2);
      deriv(g + (h / 2) * k2[0], c + (h / 2) * k2[1], q + (h / 2) * k2[2], k3);
      deriv(g + h * k3[0], c + h * k3[1], q + h * k3[2], k4);
      g += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      c += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      q += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      t = i === n - 1 ? end : t + h;
      ts.push(t);
      cs.push(c / p.V1);
    }
  }
  return { t: Float64Array.from(ts), c: Float64Array.from(cs), doses };
}

/** Solução analítica de uma dose oral, 1 compartimento (equação de Bateman). */
export function bateman(p: PkParams, dose: number, t: number): number {
  const k = p.CL / p.V1;
  if (t < 0) return 0;
  if (Math.abs(p.ka - k) < 1e-9) return ((p.F * dose) / p.V1) * k * t * Math.exp(-k * t);
  return ((p.F * dose * p.ka) / (p.V1 * (p.ka - k))) * (Math.exp(-k * t) - Math.exp(-p.ka * t));
}

/** Tmax de uma dose oral, 1 compartimento: ln(ka/k)/(ka − k). */
export function tmaxOral(ka: number, k: number): number {
  if (Math.abs(ka - k) < 1e-12) return 1 / k;
  return Math.log(ka / k) / (ka - k);
}

/**
 * ka a partir do Tmax relatado (1 compartimento). Escolhe a raiz ka > k
 * (absorção mais rápida que eliminação, o caso normal).
 */
export function kaFromTmax(tmax: number, k: number): number {
  if (tmax >= 1 / k) throw new Error('Tmax grande demais para essa eliminação');
  let lo = k * (1 + 1e-9);
  let hi = 1e4;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (tmaxOral(mid, k) > tmax) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** Taxas de disposição (1/h): α ≥ β. Meia-vida terminal = ln2/β. */
export function dispositionRates(p: PkParams): { alpha: number; beta: number } {
  const k10 = p.CL / p.V1;
  if (p.Q <= 0) return { alpha: k10, beta: k10 };
  const k12 = p.Q / p.V1;
  const k21 = p.Q / p.V2;
  const s = k10 + k12 + k21;
  const d = Math.sqrt(s * s - 4 * k10 * k21);
  return { alpha: (s + d) / 2, beta: (s - d) / 2 };
}

export interface PkMetrics {
  cmax: number;
  tmax: number;
  /** AUC de 0 até tEnd (trapézio), mg·h/L */
  auc: number;
  /** meia-vida terminal (h) */
  halfLife: number;
  /** concentração média no estado de equilíbrio: F·D/(CL·τ) (só com doses repetidas) */
  cssAvg: number;
  /** fator de acumulação 1/(1 − e^(−β·τ)) */
  accumulation: number;
  /** concentração no fim da simulação */
  cEnd: number;
}

export function metrics(p: PkParams, reg: Regimen, r: PkResult): PkMetrics {
  let cmax = 0;
  let tmax = 0;
  let auc = 0;
  for (let i = 0; i < r.t.length; i++) {
    if (r.c[i] > cmax) {
      cmax = r.c[i];
      tmax = r.t[i];
    }
    if (i > 0) auc += ((r.c[i] + r.c[i - 1]) / 2) * (r.t[i] - r.t[i - 1]);
  }
  const { beta } = dispositionRates(p);
  const F = reg.route === 'oral' ? p.F : 1;
  const repeated = reg.count > 1 && reg.tau > 0;
  return {
    cmax,
    tmax,
    auc,
    halfLife: Math.LN2 / beta,
    cssAvg: repeated ? (F * reg.dose) / (p.CL * reg.tau) : NaN,
    accumulation: repeated ? 1 / (1 - Math.exp(-beta * reg.tau)) : NaN,
    cEnd: r.c[r.c.length - 1],
  };
}

/** Concentração interpolada no tempo t. */
export function concentrationAt(r: PkResult, t: number): number {
  const { t: ts, c } = r;
  if (t <= ts[0]) return c[0];
  if (t >= ts[ts.length - 1]) return c[c.length - 1];
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - ts[lo]) / (ts[hi] - ts[lo] || 1);
  return c[lo] + f * (c[hi] - c[lo]);
}
