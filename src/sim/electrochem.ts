import { F, naturalPhase } from '../chem/thermo';
import type { Phase } from '../data/species';
import type { ElectrodeFace } from './electric';
import { ACC, type Grid } from './grid';
import { AIR } from './registry';
import { addHeat } from './thermal';

export const electroStats = { molElectrons: 0, produced: new Map<string, number>() };

/**
 * Eletrólise nas interfaces metal/eletrólito (lei de Faraday).
 * mol de e⁻ = I·dt / F; extensão ξ = mol e⁻ / z.
 * Cada interface consome metade dos reagentes; os produtos do cátodo nascem
 * nas faces catódicas e os do ânodo nas anódicas.
 * Os produtos acumulam na célula de eletrólito até completar uma célula
 * inteira (gás: n = PV/RT), e então nascem empurrando a coluna para cima.
 * Energia: a interface recebe I·E·dt da fonte; ΔH·ξ vira energia química;
 * o resto vira calor.
 */
export function stepElectrochem(g: Grid, faces: ElectrodeFace[], dt: number) {
  const reg = g.reg;
  for (const f of faces) {
    if (f.I <= 0) continue;
    const e = f.elec;
    const rx = f.rx;
    const el = rx.def.electro!;
    if (g.sp[e] !== rx.reactants[0].id) continue;
    const nE = (f.I * dt) / F;
    const xi = nE / el.z;
    const r0 = rx.reactants[0];
    let consume = 0.5 * r0.coef * xi;
    if (consume > g.n[e]) consume = g.n[e];
    const xiEff = consume / (0.5 * r0.coef);
    // cada face conta metade: os mesmos elétrons passam pelo ânodo e pelo cátodo
    electroStats.molElectrons += 0.5 * xiEff * el.z;

    // ΔH da meia-reação (metade da global) na temperatura da célula
    const T = g.T[e];
    let dH = 0;
    const s0 = reg.species[r0.id];
    const p0 = g.ph[e] as Phase;
    dH -= consume * (s0.ha[p0] + s0.cp[p0] * T);

    const sideProducts = f.anodic ? el.anode : el.cathode;
    for (const key of sideProducts) {
      const prodIdx = rx.def.products.findIndex((p) => p.sp === key);
      const pr = rx.products[prodIdx];
      const s = reg.species[pr.id];
      const mol = pr.coef * xiEff;
      const ph = naturalPhase(s.def, T);
      dH += mol * (s.ha[ph] + s.cp[ph] * T);
      g.acc[e * ACC + prodIdx] += mol;
      electroStats.produced.set(key, (electroStats.produced.get(key) ?? 0) + mol);
    }
    g.n[e] -= consume;
    addHeat(g, e, f.I * f.E * dt - dH);
  }

  // libera produtos acumulados
  for (let i = 0; i < g.size; i++) {
    const el = reg.species[g.sp[i]].electro;
    if (!el) continue;
    for (let k = 0; k < el.products.length && k < ACC; k++) {
      const mol = g.acc[i * ACC + k];
      if (mol <= 0) continue;
      const pr = el.products[k];
      const ph = naturalPhase(reg.species[pr.id].def, g.T[i]);
      // bolhas reais são bem menores que 1 mm³: libera ao juntar 1/5 de célula
      const full = 0.2 * g.fullMoles(pr.id, ph, g.T[i]);
      if (mol < full) continue;
      const T = g.T[i];
      g.acc[i * ACC + k] = 0;
      if (g.pushUp(i)) {
        g.setCell(i, pr.id, ph, T, mol, false);
        break;
      } else {
        g.acc[i * ACC + k] = mol; // sem espaço: continua acumulando
      }
    }
    // eletrólito esgotado
    if (g.sp[i] !== AIR && reg.species[g.sp[i]].electro && g.n[i] <= 1e-12) g.setAir(i, g.T[i]);
  }
}
