import { molarMass } from '../chem/formula';
import {
  checkBalance,
  enthalpyCoeffs,
  preExponential,
  type ReactionDef,
} from '../chem/thermo';
import type { Phase, SpeciesDef } from '../data/species';
import { PHASE_CODE } from '../data/species';

export const AIR = 0;
export const WALL = 1;

/** Fração molar de O2 no ar seco. */
export const AIR_O2 = 0.2095;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 0, 255];
}

/** Dados numéricos de uma espécie, prontos para o laço quente. */
export interface SpeciesRt {
  id: number;
  def: SpeciesDef;
  M: number; // kg/mol
  /** H(T) = ha[p] + cp[p]·T (J/mol) */
  ha: Float64Array;
  cp: Float64Array;
  Tm: number;
  Tb: number;
  Hfus: number; // J/mol
  Hvap: number;
  /** mol por célula nas fases condensadas: ρ·V/M */
  nCell: [number, number];
  rho: [number, number];
  k: Float64Array;
  sigma: Float64Array;
  alpha: number;
  rgb: [number, number, number][];
  rigid: boolean;
  metal: boolean;
  inert: boolean;
  emissivity: number;
  /** reações eletroquímicas em que esta espécie é o eletrólito */
  electro: ReactionRt | null;
}

export interface ReactionRt {
  id: number;
  def: ReactionDef;
  reactants: { id: number; coef: number; phase: Phase | -1 }[];
  products: { id: number; coef: number }[];
  A: number;
  Ea: number; // J/mol
}

export class Registry {
  species: SpeciesRt[] = [];
  byKey = new Map<string, SpeciesRt>();
  reactions: ReactionRt[] = [];
  /** reações térmicas por par (a*65536+b), e de um reagente por id */
  pairIndex = new Map<number, ReactionRt[]>();
  singleIndex = new Map<number, ReactionRt[]>();
  /** incrementa a cada mudança (UI escuta) */
  version = 0;

  constructor(public cellVolume: number) {}

  lookup = (key: string): SpeciesDef | undefined => this.byKey.get(key)?.def;

  addSpecies(def: SpeciesDef): SpeciesRt {
    const existing = this.byKey.get(def.key);
    const id = existing ? existing.id : this.species.length;
    const M = (def.molarMass ?? molarMass(def.formula)) / 1000;
    const ha = new Float64Array(3);
    const cp = new Float64Array(3);
    for (let p = 0 as Phase; p <= 2; p = (p + 1) as Phase) {
      const c = enthalpyCoeffs(def, p);
      ha[p] = c.a;
      cp[p] = c.cp;
    }
    const rt: SpeciesRt = {
      id,
      def,
      M,
      ha,
      cp,
      Tm: def.Tm,
      Tb: def.Tb,
      Hfus: def.Hfus * 1000,
      Hvap: def.Hvap * 1000,
      nCell: [(def.rho[0] * this.cellVolume) / M, (def.rho[1] * this.cellVolume) / M],
      rho: def.rho,
      k: Float64Array.from(def.k),
      sigma: Float64Array.from(def.sigma),
      alpha: def.alpha ?? 0,
      rgb: def.color.map(hexToRgb),
      rigid: def.rigid,
      metal: !!def.metal,
      inert: !!def.inert,
      emissivity: def.emissivity ?? (def.metal ? 0.4 : 0.85),
      electro: existing?.electro ?? null,
    };
    this.species[id] = rt;
    this.byKey.set(def.key, rt);
    this.version++;
    return rt;
  }

  addReaction(def: ReactionDef): ReactionRt {
    const bal = checkBalance(def, this.lookup);
    if (!bal.ok) throw new Error(bal.error ?? `Reação desbalanceada: ${JSON.stringify(bal.diff)}`);
    const idx = this.reactions.findIndex((r) => r.def.key === def.key);
    const id = idx >= 0 ? idx : this.reactions.length;
    const rt: ReactionRt = {
      id,
      def,
      reactants: def.reactants.map((t) => ({
        id: this.byKey.get(t.sp)!.id,
        coef: t.coef,
        phase: t.phase ? (PHASE_CODE.indexOf(t.phase) as Phase) : -1,
      })),
      products: def.products.map((t) => ({ id: this.byKey.get(t.sp)!.id, coef: t.coef })),
      A: def.electro ? 0 : preExponential(def),
      Ea: def.Ea * 1000,
    };
    this.reactions[id] = rt;
    this.rebuildIndex();
    this.version++;
    return rt;
  }

  removeReaction(key: string) {
    this.reactions = this.reactions.filter((r) => r.def.key !== key);
    this.reactions.forEach((r, i) => (r.id = i));
    this.rebuildIndex();
    this.version++;
  }

  private rebuildIndex() {
    this.pairIndex.clear();
    this.singleIndex.clear();
    for (const s of this.species) s.electro = null;
    for (const r of this.reactions) {
      if (r.def.electro) {
        this.species[r.reactants[0].id].electro = r;
        continue;
      }
      if (r.reactants.length === 1) {
        const a = r.reactants[0].id;
        const list = this.singleIndex.get(a) ?? [];
        list.push(r);
        this.singleIndex.set(a, list);
      } else if (r.reactants.length === 2) {
        const a = r.reactants[0].id;
        const b = r.reactants[1].id;
        for (const key of [a * 65536 + b, b * 65536 + a]) {
          const list = this.pairIndex.get(key) ?? [];
          if (!list.includes(r)) list.push(r);
          this.pairIndex.set(key, list);
        }
      }
    }
  }
}
