import { describe, expect, it } from 'vitest';
import { F } from '../src/chem/thermo';
import { electroStats } from '../src/sim/electrochem';
import { Simulation } from '../src/sim/simulation';
import { stepConduction, stepPhases } from '../src/sim/thermal';

function sim(w = 30, h = 20) {
  return new Simulation(w, h);
}
const id = (s: Simulation, k: string) => s.reg.byKey.get(k)!.id;

describe('circuito', () => {
  it('barra de nicromo obedece V = R·I', () => {
    const s = sim();
    const g = s.grid;
    const y = 10;
    const L = 20;
    const cu = id(s, 'Cu');
    const nc = id(s, 'NiCr');
    const x0 = 2;
    g.setCell(g.idx(x0, y), cu, 0, 293.15);
    g.term[g.idx(x0, y)] = 1;
    for (let k = 1; k <= L; k++) g.setCell(g.idx(x0 + k, y), nc, 0, 293.15);
    g.setCell(g.idx(x0 + L + 1, y), cu, 0, 293.15);
    g.term[g.idx(x0 + L + 1, y)] = -1;

    const sCu = 5.96e7;
    const sNc = 9.1e5;
    const dx = s.dx;
    const hm = (2 * sCu * sNc) / (sCu + sNc);
    const R = (L - 1) / (sNc * dx) + 2 / (hm * dx);
    const res = s.circuit.step(1, 1e-6, dx, () => {});
    expect(res.current).toBeCloseTo(1 / R, 3);
    expect(res.current / (1 / R)).toBeCloseTo(1, 6);
  });

  it('potencial varia linearmente ao longo da barra', () => {
    const s = sim();
    const g = s.grid;
    const nc = id(s, 'NiCr');
    for (let x = 0; x < 30; x++) g.setCell(g.idx(x, 5), nc, 0, 293.15);
    g.term[g.idx(0, 5)] = 1;
    g.term[g.idx(29, 5)] = -1;
    s.circuit.step(29, 1e-6, s.dx, () => {});
    for (let x = 0; x < 30; x++) expect(s.circuit.V[g.idx(x, 5)]).toBeCloseTo(29 - x, 6);
  });
});

describe('calor', () => {
  it('condução conserva energia', () => {
    const s = sim();
    const g = s.grid;
    const cu = id(s, 'Cu');
    const w = id(s, 'H2O');
    for (let y = 5; y < 15; y++)
      for (let x = 5; x < 25; x++) {
        g.setCell(g.idx(x, y), x < 15 ? cu : w, x < 15 ? 0 : 1, x < 15 ? 350 : 300);
      }
    const total = () => {
      let e = 0;
      for (let i = 0; i < g.size; i++) e += g.heatCap(i) * g.T[i];
      return e;
    };
    const e0 = total();
    for (let k = 0; k < 200; k++) stepConduction(g, 0.01, s.dx);
    expect(total() / e0).toBeCloseTo(1, 6);
  });

  it('gelo absorve calor latente antes de virar água', () => {
    const s = sim();
    const g = s.grid;
    const i = g.idx(3, 3);
    g.setCell(i, id(s, 'H2O'), 0, 273.15);
    const nMol = g.n[i];
    // metade do calor de fusão
    g.T[i] += (0.5 * 6010 * nMol) / g.heatCap(i);
    stepPhases(g);
    expect(g.ph[i]).toBe(0);
    expect(g.T[i]).toBeCloseTo(273.15, 3);
    g.T[i] += (0.6 * 6010 * nMol) / g.heatCap(i);
    stepPhases(g);
    expect(g.ph[i]).toBe(1);
    expect(g.T[i]).toBeGreaterThan(273.15);
  });
});

describe('eletrólise', () => {
  it('Faraday: H2 = mol e⁻ / 2 e O2 = mol e⁻ / 4', () => {
    const s = sim(20, 20);
    const g = s.grid;
    const el = id(s, 'H2O_el');
    const cu = id(s, 'Cu');
    for (let y = 8; y < 20; y++) for (let x = 2; x < 18; x++) g.setCell(g.idx(x, y), el, 1, 298.15);
    for (let y = 10; y < 20; y++) {
      g.setCell(g.idx(5, y), cu, 0, 298.15);
      g.setCell(g.idx(14, y), cu, 0, 298.15);
    }
    g.term[g.idx(5, 10)] = 1;
    g.term[g.idx(14, 10)] = -1;
    s.settings.sourceV = 12;
    electroStats.molElectrons = 0;
    electroStats.produced.clear();
    let charge = 0;
    for (let k = 0; k < 30; k++) {
      s.step();
      charge += s.circuit.last.current * s.settings.dtFrame;
    }
    expect(charge).toBeGreaterThan(0);
    const ne = electroStats.molElectrons;
    // o solver iterativo deixa erro relativo ~1e-4 entre a corrente do ânodo e do cátodo
    expect(ne / (charge / F)).toBeCloseTo(1, 3);
    expect(electroStats.produced.get('H2')! / ne).toBeCloseTo(0.5, 3);
    expect(electroStats.produced.get('O2')! / ne).toBeCloseTo(0.25, 3);
    expect(electroStats.produced.get('H2')! / electroStats.produced.get('O2')! / 2).toBeCloseTo(1, 3);
  });

  it('abaixo da tensão de decomposição não passa corrente', () => {
    const s = sim(20, 20);
    const g = s.grid;
    const el = id(s, 'H2O_el');
    const cu = id(s, 'Cu');
    for (let y = 8; y < 20; y++) for (let x = 2; x < 18; x++) g.setCell(g.idx(x, y), el, 1, 298.15);
    for (let y = 10; y < 20; y++) {
      g.setCell(g.idx(5, y), cu, 0, 298.15);
      g.setCell(g.idx(14, y), cu, 0, 298.15);
    }
    g.term[g.idx(5, 10)] = 1;
    g.term[g.idx(14, 10)] = -1;
    s.settings.sourceV = 1.5;
    for (let k = 0; k < 5; k++) s.step();
    // só ruído numérico do solver (µA); com 12 V a corrente é ~10⁴ vezes maior
    expect(Math.abs(s.circuit.last.current)).toBeLessThan(1e-4);
  });
});
