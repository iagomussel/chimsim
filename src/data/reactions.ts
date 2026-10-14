import type { ReactionDef } from '../chem/thermo';

// Reações pré-definidas.
// ΔH, ΔS e ΔG NÃO ficam aqui: são calculados pela lei de Hess a partir de species.ts.
// Cinética: modelo global de Arrhenius de um passo. Ea e Tign são valores efetivos,
// calibrados para a reação "pegar" perto da temperatura de autoignição conhecida.
// Não representam o mecanismo real (que tem dezenas de etapas).

export const PRESET_REACTIONS: ReactionDef[] = [
  {
    key: 'h2_comb', name: 'Combustão do hidrogênio',
    reactants: [{ sp: 'H2', coef: 2 }, { sp: 'O2', coef: 1 }],
    products: [{ sp: 'H2O', coef: 2 }],
    Ea: 120, Tign: 773, estimated: ['Ea'],
    note: 'Autoignição do H2 no ar ≈ 500 °C',
  },
  {
    key: 'ch4_comb', name: 'Combustão do metano',
    reactants: [{ sp: 'CH4', coef: 1 }, { sp: 'O2', coef: 2 }],
    products: [{ sp: 'CO2', coef: 1 }, { sp: 'H2O', coef: 2 }],
    Ea: 130, Tign: 853, estimated: ['Ea'],
    note: 'Autoignição do metano ≈ 540–580 °C',
  },
  {
    key: 'co_comb', name: 'Combustão do CO',
    reactants: [{ sp: 'CO', coef: 2 }, { sp: 'O2', coef: 1 }],
    products: [{ sp: 'CO2', coef: 2 }],
    Ea: 120, Tign: 880, estimated: ['Ea'],
    note: 'Autoignição do CO ≈ 609 °C',
  },
  {
    key: 'co2_diss', name: 'Dissociação do CO2',
    reactants: [{ sp: 'CO2', coef: 2, phase: 'g' }],
    products: [{ sp: 'CO', coef: 2 }, { sp: 'O2', coef: 1 }],
    Ea: 250, Tign: 3000, estimated: ['Ea', 'Tign'],
    note: 'Endotérmica (ΔH ≈ +566 kJ). Com ΔG < 0 só acima de ~3300 K: limita a temperatura de chama.',
  },
  {
    key: 'c_comb', name: 'Queima do carvão',
    reactants: [{ sp: 'C', coef: 1 }, { sp: 'O2', coef: 1 }],
    products: [{ sp: 'CO2', coef: 1 }],
    Ea: 140, Tign: 700, estimated: ['Ea', 'Tign'],
  },
  {
    key: 'thermite', name: 'Termita',
    reactants: [{ sp: 'Fe2O3', coef: 1 }, { sp: 'Al', coef: 2 }],
    products: [{ sp: 'Al2O3', coef: 1 }, { sp: 'Fe', coef: 2 }],
    Ea: 200, Tign: 1200, estimated: ['Ea', 'Tign'],
    note: 'ΔH ≈ −851 kJ/mol. Precisa de ignição forte (fita de magnésio na prática).',
  },
  {
    key: 'na_water', name: 'Sódio + água',
    reactants: [{ sp: 'Na', coef: 2 }, { sp: 'H2O', coef: 20, phase: 'l' }],
    products: [{ sp: 'NaOH_aq', coef: 2 }, { sp: 'H2', coef: 1 }],
    Ea: 40, Tign: 260, estimated: ['Ea', 'Tign'],
    note: '2Na + 2H2O → 2NaOH(aq) + H2, com a água de solvatação explícita',
  },
  {
    key: 'nacl_diss', name: 'Dissolução do sal',
    reactants: [{ sp: 'NaCl', coef: 1, phase: 's' }, { sp: 'H2O', coef: 10, phase: 'l' }],
    products: [{ sp: 'brine', coef: 1 }],
    Ea: 20, Tign: 200, estimated: ['Ea', 'Tign'],
    note: 'Levemente endotérmica (ΔH ≈ +3,9 kJ/mol)',
  },
  {
    key: 'naoh_diss', name: 'Dissolução da soda',
    reactants: [{ sp: 'NaOH', coef: 1, phase: 's' }, { sp: 'H2O', coef: 9, phase: 'l' }],
    products: [{ sp: 'NaOH_aq', coef: 1 }],
    Ea: 20, Tign: 200, estimated: ['Ea', 'Tign'],
    note: 'Exotérmica (ΔH ≈ −44,5 kJ/mol)',
  },
  {
    key: 'brine_evap', name: 'Evaporação da salmoura',
    reactants: [{ sp: 'brine', coef: 1, phase: 'l' }],
    products: [{ sp: 'NaCl', coef: 1 }, { sp: 'H2O', coef: 10 }],
    Ea: 40, Tign: 380, estimated: ['Ea'],
    note: 'ΔG = 0 perto de 381 K: é o ponto de ebulição da salmoura',
  },
  {
    key: 'naoh_evap', name: 'Evaporação da soda',
    reactants: [{ sp: 'NaOH_aq', coef: 1, phase: 'l' }],
    products: [{ sp: 'NaOH', coef: 1 }, { sp: 'H2O', coef: 9 }],
    Ea: 40, Tign: 400, estimated: ['Ea'],
  },
  {
    key: 'calcination', name: 'Calcinação do calcário',
    reactants: [{ sp: 'CaCO3', coef: 1 }],
    products: [{ sp: 'CaO', coef: 1 }, { sp: 'CO2', coef: 1 }],
    Ea: 180, Tign: 1100, estimated: ['Ea'],
    note: 'ΔG = 0 perto de 1110 K',
  },
  {
    key: 'water_electrolysis', name: 'Eletrólise da água',
    reactants: [{ sp: 'H2O_el', coef: 2, phase: 'l' }],
    products: [{ sp: 'H2', coef: 2 }, { sp: 'O2', coef: 1 }],
    Ea: 0, Tign: 1,
    electro: { z: 4, cathode: ['H2'], anode: ['O2'], overpotential: 0.6 },
    estimated: ['overpotential'],
  },
  {
    key: 'brine_electrolysis', name: 'Eletrólise da salmoura (cloro-soda)',
    reactants: [{ sp: 'brine', coef: 2, phase: 'l' }],
    products: [{ sp: 'NaOH_aq', coef: 2 }, { sp: 'H2', coef: 1 }, { sp: 'Cl2', coef: 1 }],
    Ea: 0, Tign: 1,
    electro: { z: 2, cathode: ['H2', 'NaOH_aq'], anode: ['Cl2'], overpotential: 0.8 },
    estimated: ['overpotential'],
  },
  {
    key: 'nacl_molten_electrolysis', name: 'Eletrólise do NaCl fundido',
    reactants: [{ sp: 'NaCl', coef: 2, phase: 'l' }],
    products: [{ sp: 'Na', coef: 2 }, { sp: 'Cl2', coef: 1 }],
    Ea: 0, Tign: 1,
    electro: { z: 2, cathode: ['Na'], anode: ['Cl2'], overpotential: 0.3 },
    estimated: ['overpotential'],
  },
];
