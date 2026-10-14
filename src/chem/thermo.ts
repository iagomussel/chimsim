import type { Phase, SpeciesDef } from '../data/species';
import { PHASE_CODE } from '../data/species';
import { parseFormula, type AtomCounts } from './formula';

export const R = 8.314462618; // J/(mol·K)
export const F = 96485.33212; // C/mol
export const T0 = 298.15; // K
export const P_ATM = 101325; // Pa

const refIndex = (d: SpeciesDef): Phase => PHASE_CODE.indexOf(d.refPhase) as Phase;

/**
 * Entalpia molar H(T) = a + cp·T (J/mol) da espécie numa fase.
 * Ancorada em ΔHf° (fase de referência, 298 K) e contínua nas transições:
 * H_líq(Tf) = H_sól(Tf) + ΔHfus, H_gás(Te) = H_líq(Te) + ΔHvap. Cp constante por fase.
 */
export function enthalpyCoeffs(d: SpeciesDef, phase: Phase): { a: number; cp: number } {
  const cp = d.cp;
  const Hfus = d.Hfus * 1000;
  const Hvap = d.Hvap * 1000;
  // H em cada fase como função (a + cp T); começa da fase de referência
  const H: { a: number; cp: number }[] = [];
  const ref = refIndex(d);
  H[ref] = { a: d.Hf * 1000 - cp[ref] * T0, cp: cp[ref] };
  const at = (p: Phase, T: number) => H[p].a + H[p].cp * T;
  // para cima
  for (let p = ref + 1; p <= 2; p++) {
    const Ttr = p === 1 ? d.Tm : d.Tb;
    const L = p === 1 ? Hfus : Hvap;
    const base = at((p - 1) as Phase, Ttr) + L;
    H[p] = { a: base - cp[p] * Ttr, cp: cp[p] };
  }
  // para baixo
  for (let p = ref - 1; p >= 0; p--) {
    const Ttr = p === 0 ? d.Tm : d.Tb;
    const L = p === 0 ? Hfus : Hvap;
    const base = at((p + 1) as Phase, Ttr) - L;
    H[p] = { a: base - cp[p] * Ttr, cp: cp[p] };
  }
  return H[phase];
}

export function molarEnthalpy(d: SpeciesDef, phase: Phase, T: number): number {
  const c = enthalpyCoeffs(d, phase);
  return c.a + c.cp * T;
}

/** Entropia molar S(T) (J/mol·K), mesma construção da entalpia (cp·ln T, ΔH/T nas transições). */
export function molarEntropy(d: SpeciesDef, phase: Phase, T: number): number {
  const ref = refIndex(d);
  const cp = d.cp;
  const Tt = [0, d.Tm, d.Tb];
  const L = [0, d.Hfus * 1000, d.Hvap * 1000];
  // S no ponto de referência e propagação
  const S: { s0: number; Tref: number }[] = [];
  S[ref] = { s0: d.S, Tref: T0 };
  const at = (p: Phase, T: number) => S[p].s0 + cp[p] * Math.log(T / S[p].Tref);
  for (let p = ref + 1; p <= 2; p++) {
    S[p] = { s0: at((p - 1) as Phase, Tt[p]) + L[p] / Tt[p], Tref: Tt[p] };
  }
  for (let p = ref - 1; p >= 0; p--) {
    S[p] = { s0: at((p + 1) as Phase, Tt[p + 1]) - L[p + 1] / Tt[p + 1], Tref: Tt[p + 1] };
  }
  return at(phase, Math.max(T, 1));
}

/** Fase de equilíbrio a 1 atm. */
export function naturalPhase(d: SpeciesDef, T: number): Phase {
  if (T < d.Tm) return 0;
  if (T < d.Tb) return 1;
  return 2;
}

export interface ReactionTerm {
  sp: string;
  coef: number;
  phase?: 's' | 'l' | 'g';
}

export interface ElectroDef {
  /** elétrons transferidos por reação como escrita */
  z: number;
  /** produtos formados no cátodo / ânodo (chaves) */
  cathode: string[];
  anode: string[];
  /** sobrepotencial total (V), somado à tensão de decomposição */
  overpotential: number;
}

export interface ReactionDef {
  key: string;
  name: string;
  reactants: ReactionTerm[];
  products: ReactionTerm[];
  /** energia de ativação efetiva (kJ/mol) */
  Ea: number;
  /** temperatura em que k = K_IGN (calibra o fator pré-exponencial) */
  Tign: number;
  electro?: ElectroDef;
  note?: string;
  estimated?: string[];
  user?: boolean;
}

/** taxa (1/s) na temperatura de ignição usada para calibrar A */
export const K_IGN = 20;

export function preExponential(rx: ReactionDef): number {
  return K_IGN * Math.exp((rx.Ea * 1000) / (R * rx.Tign));
}

export function arrhenius(A: number, EaKJ: number, T: number): number {
  return A * Math.exp((-EaKJ * 1000) / (R * T));
}

function formulaOf(d: SpeciesDef): AtomCounts | null {
  try {
    return parseFormula(d.formula);
  } catch {
    return null;
  }
}

/** Verifica conservação de átomos. Devolve diferença produtos − reagentes por elemento. */
export function checkBalance(
  rx: Pick<ReactionDef, 'reactants' | 'products'>,
  lookup: (key: string) => SpeciesDef | undefined,
): { ok: boolean; diff: Record<string, number>; error?: string } {
  const diff: Record<string, number> = {};
  const add = (terms: ReactionTerm[], sign: number) => {
    for (const t of terms) {
      const d = lookup(t.sp);
      if (!d) throw new Error(`Espécie desconhecida: ${t.sp}`);
      const f = formulaOf(d);
      if (!f) throw new Error(`Fórmula inválida para ${d.name}`);
      for (const [el, c] of Object.entries(f)) diff[el] = (diff[el] ?? 0) + sign * c * t.coef;
    }
  };
  try {
    add(rx.reactants, -1);
    add(rx.products, 1);
  } catch (e) {
    return { ok: false, diff, error: (e as Error).message };
  }
  for (const k of Object.keys(diff)) if (Math.abs(diff[k]) < 1e-9) delete diff[k];
  return { ok: Object.keys(diff).length === 0, diff };
}

export interface ReactionThermo {
  dH: number; // J por reação como escrita
  dS: number; // J/K
  dG: number; // J
}

/**
 * ΔH, ΔS, ΔG da reação a T (lei de Hess). Fases: a do termo, ou a de equilíbrio em T.
 */
export function reactionThermo(
  rx: Pick<ReactionDef, 'reactants' | 'products'>,
  T: number,
  lookup: (key: string) => SpeciesDef | undefined,
  phaseOverride?: (term: ReactionTerm, d: SpeciesDef) => Phase | undefined,
): ReactionThermo {
  let dH = 0;
  let dS = 0;
  const acc = (terms: ReactionTerm[], sign: number) => {
    for (const t of terms) {
      const d = lookup(t.sp)!;
      const ph =
        phaseOverride?.(t, d) ??
        (t.phase ? (PHASE_CODE.indexOf(t.phase) as Phase) : naturalPhase(d, T));
      dH += sign * t.coef * molarEnthalpy(d, ph, T);
      dS += sign * t.coef * molarEntropy(d, ph, T);
    }
  };
  acc(rx.reactants, -1);
  acc(rx.products, 1);
  return { dH, dS, dG: dH - T * dS };
}

/** Temperaturas em que ΔG muda de sinal (busca entre 50 K e 6000 K). */
export function equilibriumTemperatures(
  rx: Pick<ReactionDef, 'reactants' | 'products'>,
  lookup: (key: string) => SpeciesDef | undefined,
): number[] {
  const out: number[] = [];
  const g = (T: number) => reactionThermo(rx, T, lookup).dG;
  let prev = g(50);
  for (let T = 60; T <= 6000; T += 10) {
    const cur = g(T);
    if (Math.sign(cur) !== Math.sign(prev)) {
      let lo = T - 10;
      let hi = T;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(g(mid)) === Math.sign(prev)) lo = mid;
        else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
    prev = cur;
  }
  return out;
}

/** Tensão mínima de decomposição E = ΔG / (zF), em volts. */
export function decompositionVoltage(
  rx: ReactionDef,
  T: number,
  lookup: (key: string) => SpeciesDef | undefined,
): number {
  if (!rx.electro) return 0;
  const { dG } = reactionThermo(rx, T, lookup);
  return dG / (rx.electro.z * F);
}

/** mol de gás ideal num volume (m³) a T, 1 atm. */
export function idealGasMoles(volume: number, T: number): number {
  return (P_ATM * volume) / (R * T);
}

/** Estimativas para preencher dados que faltam. */
export const estimators = {
  /**
   * Regra de Kopp–Neumann: Cp do sólido ≈ soma de contribuições atômicas (J/mol·K).
   * Elementos leves contribuem menos que 3R; os demais ≈ 25,9.
   */
  cpSolid: (counts: Record<string, number>) => {
    const kopp: Record<string, number> = { C: 7.53, H: 9.62, B: 11.3, Si: 15.9, O: 16.74, F: 20.92, P: 22.59, S: 22.59 };
    let cp = 0;
    for (const [el, c] of Object.entries(counts)) cp += (kopp[el] ?? 25.94) * c;
    return cp;
  },
  /** Regra de Trouton: ΔHvap ≈ 88 J/(mol·K) · Te. Devolve kJ/mol. */
  hvap: (Tb: number) => (88 * Tb) / 1000,
  /** Regra de Richards (metais): ΔSfus ≈ R. Devolve kJ/mol. */
  hfus: (Tm: number, atoms: number) => (R * Tm * atoms) / 1000,
};
