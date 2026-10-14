import { describe, expect, it } from 'vitest';
import { SCENES } from '../src/data/scenes';
import { electroStats } from '../src/sim/electrochem';
import { reactionStats } from '../src/sim/reactions';
import { Simulation } from '../src/sim/simulation';

function run(key: string, frames: number, dtFrame = 1 / 60) {
  const sim = new Simulation(240, 160);
  SCENES.find((s) => s.key === key)!.build(sim);
  sim.settings.dtFrame = dtFrame;
  reactionStats.events = 0;
  electroStats.molElectrons = 0;
  electroStats.produced.clear();
  const t0 = performance.now();
  let maxT = 0;
  for (let f = 0; f < frames; f++) {
    sim.step();
    for (let i = 0; i < sim.grid.size; i++) if (sim.grid.T[i] > maxT) maxT = sim.grid.T[i];
  }
  const ms = (performance.now() - t0) / frames;
  const count = (k: string) => {
    const id = sim.reg.byKey.get(k)!.id;
    let c = 0;
    for (let i = 0; i < sim.grid.size; i++) if (sim.grid.sp[i] === id) c++;
    return c;
  };
  return { sim, ms, maxT, count };
}

describe('cenas', () => {
  it('eletrólise produz H2 e O2 na razão 2:1', () => {
    const r = run('electrolysis', 120);
    const h2 = electroStats.produced.get('H2') ?? 0;
    const o2 = electroStats.produced.get('O2') ?? 0;
    console.log('eletrólise', r.ms.toFixed(1), 'ms/quadro', 'I =', r.sim.circuit.last.current, 'H2', h2, 'O2', o2, 'células H2', r.count('H2'));
    expect(h2).toBeGreaterThan(0);
    expect(h2 / o2).toBeCloseTo(2, 2);
  });

  it('termita esquenta acima de 2000 K e forma ferro', () => {
    const r = run('thermite', 300);
    console.log('termita', r.ms.toFixed(1), 'ms/quadro', 'maxT', r.maxT.toFixed(0), 'Fe', r.count('Fe'), 'eventos', reactionStats.events);
    expect(r.count('Fe')).toBeGreaterThan(0);
    expect(r.maxT).toBeGreaterThan(2000);
    // Limitação conhecida: sem dissociação térmica, reagentes pré-aquecidos pela condução
    // geram pontos acima da temperatura adiabática (~3100 K). A energia total se conserva.
    expect(r.maxT).toBeLessThan(6000);
  });

  it('sódio reage com água e libera H2', () => {
    const r = run('sodium', 200);
    console.log('sódio', r.ms.toFixed(1), 'ms/quadro', 'maxT', r.maxT.toFixed(0), 'NaOH_aq', r.count('NaOH_aq'), 'H2', r.count('H2'));
    expect(r.count('NaOH_aq')).toBeGreaterThan(0);
  });

  it('metano queima com a faísca', () => {
    const r = run('methane', 200);
    console.log('metano', r.ms.toFixed(1), 'ms/quadro', 'maxT', r.maxT.toFixed(0), 'CO2', r.count('CO2'), 'eventos', reactionStats.events);
    expect(r.count('CO2')).toBeGreaterThan(0);
  });

  it('fio de nicromo esquenta', () => {
    const r = run('wire', 600, 1 / 6);
    const g = r.sim.grid;
    const T = g.T[g.idx(80, 102)];
    console.log('fio', r.ms.toFixed(1), 'ms/quadro', 'I =', r.sim.circuit.last.current, 'T fio', T.toFixed(0), 'H2O', r.count('H2O'));
    expect(T).toBeGreaterThan(900);
    expect(T).toBeLessThan(1673); // não funde a 2 V
    expect(r.sim.circuit.last.current).toBeGreaterThan(1);
  });

  it('forno de cal libera CO2', () => {
    const r = run('calcination', 600, 1);
    console.log('cal', r.ms.toFixed(1), 'ms/quadro', 'maxT', r.maxT.toFixed(0), 'CaO', r.count('CaO'), 'I', r.sim.circuit.last.current);
    expect(r.count('CaO')).toBeGreaterThan(0);
  });

  it('sal dissolve', () => {
    const r = run('salt', 300);
    console.log('sal', r.ms.toFixed(1), 'ms/quadro', 'salmoura', r.count('brine'), 'NaCl', r.count('NaCl'));
    expect(r.count('brine')).toBeGreaterThan(0);
  });

  it('cloro-soda produz Cl2 e NaOH', () => {
    const r = run('brine', 200);
    console.log('cloro-soda', r.ms.toFixed(1), 'ms/quadro', 'I', r.sim.circuit.last.current, 'Cl2', electroStats.produced.get('Cl2'), 'NaOH', electroStats.produced.get('NaOH_aq'));
    expect(electroStats.produced.get('Cl2') ?? 0).toBeGreaterThan(0);
  });
});
