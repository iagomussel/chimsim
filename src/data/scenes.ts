import { naturalPhase } from '../chem/thermo';
import type { Simulation } from '../sim/simulation';

export interface Scene {
  key: string;
  name: string;
  description: string;
  build: (sim: Simulation) => void;
}

function painter(sim: Simulation) {
  const g = sim.grid;
  const put = (x: number, y: number, key: string, T = g.ambientT, fixed?: boolean) => {
    if (!g.inside(x, y)) return;
    const s = sim.reg.byKey.get(key)!;
    g.setCell(g.idx(x, y), s.id, naturalPhase(s.def, T), T, undefined, fixed);
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, key: string, T?: number, fixed?: boolean) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, key, T, fixed);
  };
  /** recipiente em U (paredes inertes) */
  const vessel = (x0: number, y0: number, x1: number, y1: number, t = 2) => {
    rect(x0, y0, x0 + t - 1, y1, 'wall');
    rect(x1 - t + 1, y0, x1, y1, 'wall');
    rect(x0, y1 - t + 1, x1, y1, 'wall');
  };
  const terminal = (x: number, y: number, sign: 1 | -1) => {
    put(x, y, 'Cu', undefined, true);
    g.term[g.idx(x, y)] = sign;
  };
  return { put, rect, vessel, terminal, g };
}

export const SCENES: Scene[] = [
  {
    key: 'electrolysis',
    name: 'Eletrólise da água',
    description: 'Dois eletrodos de cobre em água com eletrólito. Acima de ~1,8 V surgem H₂ (cátodo, −) e O₂ (ânodo, +) na razão 2:1.',
    build(sim) {
      const { rect, vessel, terminal } = painter(sim);
      sim.settings.sourceV = 12;
      vessel(70, 70, 170, 152);
      rect(72, 86, 168, 150, 'H2O_el');
      rect(98, 52, 100, 140, 'Cu', undefined, true);
      rect(140, 52, 142, 140, 'Cu', undefined, true);
      for (let x = 98; x <= 100; x++) terminal(x, 52, 1);
      for (let x = 140; x <= 142; x++) terminal(x, 52, -1);
    },
  },
  {
    key: 'brine',
    name: 'Cloro-soda (salmoura)',
    description: 'Eletrólise da salmoura com eletrodos de grafite: Cl₂ no ânodo, H₂ e NaOH(aq) no cátodo. Tensão mínima ≈ 2,2 V + sobrepotencial.',
    build(sim) {
      const { rect, vessel, terminal } = painter(sim);
      sim.settings.sourceV = 12;
      vessel(70, 70, 170, 152);
      rect(72, 86, 168, 150, 'brine');
      rect(98, 52, 100, 140, 'C', undefined, true);
      rect(140, 52, 142, 140, 'C', undefined, true);
      for (let x = 98; x <= 100; x++) terminal(x, 51, 1);
      for (let x = 140; x <= 142; x++) terminal(x, 51, -1);
    },
  },
  {
    key: 'methane',
    name: 'Combustão do metano',
    description: 'Bolsão de CH₄ com uma faísca. A chama consome o O₂ do ar e libera CO₂ e vapor d\'água.',
    build(sim) {
      const { rect, put } = painter(sim);
      rect(0, 150, 239, 159, 'wall');
      rect(90, 125, 150, 149, 'CH4');
      // faísca: um pouco do próprio gás já quente, na borda com o ar
      for (let x = 112; x <= 128; x++) for (let y = 123; y <= 128; y++) put(x, y, 'CH4', 1800);
    },
  },
  {
    key: 'thermite',
    name: 'Termita',
    description: 'Fe₂O₃ + 2Al → Al₂O₃ + 2Fe (ΔH ≈ −851 kJ/mol). Ignição a ~1200 K no topo. Ferro sai fundido.',
    build(sim) {
      const { put, vessel } = painter(sim);
      vessel(85, 80, 155, 152, 3);
      for (let y = 105; y <= 149; y++)
        for (let x = 88; x <= 152; x++) put(x, y, Math.random() < 0.4 ? 'Al' : 'Fe2O3');
      for (let x = 115; x <= 125; x++) for (let y = 103; y <= 106; y++) put(x, y, 'Al', 1600);
    },
  },
  {
    key: 'sodium',
    name: 'Sódio na água',
    description: '2Na + 2H₂O → 2NaOH(aq) + H₂. O calor funde o sódio e pode acender o hidrogênio.',
    build(sim) {
      const { rect, vessel } = painter(sim);
      vessel(50, 80, 190, 152);
      rect(52, 100, 188, 150, 'H2O');
      // 24 células ≈ 23 mg de Na → ≈ 12 mL de H2 (≈ 12 000 células de 1 mm³): gás ocupa muito espaço
      rect(116, 70, 121, 73, 'Na');
    },
  },
  {
    key: 'wire',
    name: 'Fio de nicromo (Joule)',
    description: 'Fio de nicromo de 120 mm entre terminais. P = V²/R aquece; a radiação (Stefan–Boltzmann) segura a temperatura. Acima de ~3 V o fio funde e o circuito abre.',
    build(sim) {
      const { rect, terminal } = painter(sim);
      sim.settings.sourceV = 2;
      rect(55, 100, 59, 104, 'Cu', undefined, true);
      rect(180, 100, 184, 104, 'Cu', undefined, true);
      rect(60, 102, 179, 102, 'NiCr');
      for (let y = 100; y <= 104; y++) {
        terminal(55, y, 1);
        terminal(184, y, -1);
      }
      rect(105, 92, 130, 101, 'H2O', 260);
      rect(0, 150, 239, 159, 'wall');
    },
  },
  {
    key: 'calcination',
    name: 'Forno de cal',
    description: 'Resistência de nicromo no fundo do cadinho aquece CaCO₃. Acima de ~1110 K (ΔG < 0) sai CO₂ e fica CaO. Ajuste a tensão: muito alta funde a resistência.',
    build(sim) {
      const { rect, vessel, terminal } = painter(sim);
      sim.settings.sourceV = 0.9;
      vessel(90, 90, 150, 140, 3);
      // resistência no fundo, com terminais de cobre atravessando a parede
      rect(60, 137, 92, 137, 'Cu', undefined, true);
      rect(148, 137, 180, 137, 'Cu', undefined, true);
      rect(93, 137, 147, 137, 'NiCr');
      terminal(60, 137, 1);
      terminal(180, 137, -1);
      rect(93, 112, 147, 136, 'CaCO3');
    },
  },
  {
    key: 'salt',
    name: 'Sal na água',
    description: 'NaCl dissolve (levemente endotérmico) até a salmoura saturar. Aqueça para ferver a ~381 K e recuperar o sal.',
    build(sim) {
      const { rect, vessel } = painter(sim);
      vessel(60, 80, 180, 152);
      rect(62, 110, 178, 150, 'H2O');
      rect(100, 40, 140, 60, 'NaCl');
    },
  },
];
