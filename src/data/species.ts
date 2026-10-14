// Espécies químicas pré-definidas.
//
// Fontes principais:
//  - NBS Tables of Chemical Thermodynamic Properties (1982) e NIST Chemistry WebBook:
//    ΔHf°, S°, Cp a 298,15 K e 1 bar.
//  - CRC Handbook of Chemistry and Physics: Tf, Te, ΔHfus, ΔHvap, densidade,
//    condutividade térmica e elétrica.
// Campos listados em `estimated` NÃO vêm de tabela: são estimativas (regra de Kopp,
// Trouton, ordem de grandeza) e aparecem marcados na UI.

export type Phase = 0 | 1 | 2; // 0 sólido, 1 líquido, 2 gás
export const PHASE_NAMES = ['sólido', 'líquido', 'gás'] as const;
export const PHASE_CODE = ['s', 'l', 'g'] as const;
export type PhaseCode = (typeof PHASE_CODE)[number];

export type Triple = [number, number, number];

export interface SpeciesDef {
  key: string;
  name: string;
  formula: string;
  /** Massa molar forçada (para misturas como o ar). Se ausente, calculada da fórmula. */
  molarMass?: number;
  category: 'ambiente' | 'gás' | 'metal' | 'composto' | 'solução' | 'especial' | 'usuário';
  refPhase: PhaseCode;
  Hf: number; // kJ/mol, fase de referência, 298,15 K
  S: number; // J/(mol·K), fase de referência, 298,15 K
  cp: Triple; // J/(mol·K) por fase [s, l, g]
  Tm: number; // K, fusão
  Tb: number; // K, ebulição a 1 atm
  Hfus: number; // kJ/mol
  Hvap: number; // kJ/mol
  rho: [number, number]; // kg/m³ [sólido, líquido]; gás = gás ideal
  k: Triple; // W/(m·K)
  sigma: Triple; // S/m
  alpha?: number; // coef. térmico da resistividade (1/K), metais
  color: [string, string, string];
  rigid: boolean; // sólido fixo (true) ou pó (false)
  metal?: boolean; // condutor eletrônico (funciona como eletrodo)
  inert?: boolean; // não muda de fase nem reage
  emissivity?: number; // ε para radiação térmica (padrão: 0,4 metais, 0,85 demais)
  estimated?: string[];
  source?: string;
}

const NBS = 'NBS 1982 / NIST WebBook; CRC Handbook';

export const PRESET_SPECIES: SpeciesDef[] = [
  {
    key: 'air', name: 'Ar atmosférico', formula: 'N2+O2', molarMass: 28.96, category: 'ambiente',
    refPhase: 'g', Hf: 0, S: 194, cp: [29.1, 29.1, 29.1], Tm: 60, Tb: 78.8, Hfus: 0.7, Hvap: 5.9,
    rho: [1000, 870], k: [0.2, 0.14, 0.0262], sigma: [0, 0, 0],
    color: ['#cbd5e1', '#93c5fd', '#0b1220'], rigid: false,
    estimated: ['S', 'Tm', 'Hfus', 'Hvap', 'rho'],
    source: 'Mistura 78% N2 / 21% O2; propriedades médias aproximadas',
  },
  {
    key: 'wall', name: 'Parede (inerte)', formula: 'SiO2', category: 'especial',
    refPhase: 's', Hf: 0, S: 0, cp: [44.4, 44.4, 44.4], Tm: 1e9, Tb: 1e9, Hfus: 1, Hvap: 1,
    rho: [2500, 2500], k: [1.0, 1.0, 1.0], sigma: [0, 0, 0],
    color: ['#64748b', '#64748b', '#64748b'], rigid: true, inert: true,
    source: 'Material de contorno, não reage e não funde',
  },
  {
    key: 'H2O', name: 'Água', formula: 'H2O', category: 'composto',
    refPhase: 'l', Hf: -285.83, S: 69.91, cp: [37.8, 75.29, 33.58], Tm: 273.15, Tb: 373.15,
    Hfus: 6.01, Hvap: 40.65, rho: [917, 997], k: [2.2, 0.6, 0.025], sigma: [0, 5.5e-6, 0],
    color: ['#cfe8ff', '#2f8fdc', '#e2e8f0'], rigid: true, source: NBS,
  },
  {
    key: 'H2O_el', name: 'Água + eletrólito', formula: 'H2O', category: 'solução',
    refPhase: 'l', Hf: -285.83, S: 69.91, cp: [37.8, 75.29, 33.58], Tm: 273.15, Tb: 373.15,
    Hfus: 6.01, Hvap: 40.65, rho: [917, 1030], k: [2.2, 0.6, 0.025], sigma: [0, 5, 0],
    color: ['#d4f0ff', '#3aa3c8', '#e2e8f0'], rigid: true,
    estimated: ['sigma', 'rho'],
    source: 'Termodinâmica da água (NBS). σ ≈ solução diluída de Na2SO4 (ordem de grandeza)',
  },
  {
    key: 'H2', name: 'Hidrogênio', formula: 'H2', category: 'gás',
    refPhase: 'g', Hf: 0, S: 130.68, cp: [14, 19.7, 28.82], Tm: 13.99, Tb: 20.28, Hfus: 0.117,
    Hvap: 0.904, rho: [86, 71], k: [0.2, 0.1, 0.18], sigma: [0, 0, 0],
    color: ['#f8fafc', '#e0f2fe', '#475569'], rigid: false, estimated: ['cp'], source: NBS,
  },
  {
    key: 'O2', name: 'Oxigênio', formula: 'O2', category: 'gás',
    refPhase: 'g', Hf: 0, S: 205.14, cp: [46, 53, 29.36], Tm: 54.36, Tb: 90.19, Hfus: 0.444,
    Hvap: 6.82, rho: [1426, 1141], k: [0.2, 0.15, 0.0266], sigma: [0, 0, 0],
    color: ['#bfdbfe', '#60a5fa', '#38608a'], rigid: false, estimated: ['cp'], source: NBS,
  },
  {
    key: 'N2', name: 'Nitrogênio', formula: 'N2', category: 'gás',
    refPhase: 'g', Hf: 0, S: 191.61, cp: [46, 56, 29.13], Tm: 63.15, Tb: 77.36, Hfus: 0.72,
    Hvap: 5.57, rho: [1026, 808], k: [0.2, 0.14, 0.026], sigma: [0, 0, 0],
    color: ['#e2e8f0', '#cbd5e1', '#475569'], rigid: false, estimated: ['cp'], source: NBS,
  },
  {
    key: 'CH4', name: 'Metano', formula: 'CH4', category: 'gás',
    refPhase: 'g', Hf: -74.81, S: 186.26, cp: [40, 55, 35.31], Tm: 90.69, Tb: 111.66,
    Hfus: 0.94, Hvap: 8.19, rho: [522, 423], k: [0.3, 0.19, 0.034], sigma: [0, 0, 0],
    color: ['#fde68a', '#fcd34d', '#a3e635'], rigid: false, estimated: ['cp'], source: NBS,
  },
  {
    key: 'CO2', name: 'Dióxido de carbono', formula: 'CO2', category: 'gás',
    // sublima a 194,7 K: modelado como fusão/ebulição quase simultâneas
    refPhase: 'g', Hf: -393.51, S: 213.74, cp: [47, 47, 37.11], Tm: 194.6, Tb: 194.7, Hfus: 0.01,
    Hvap: 25.2, rho: [1562, 1101], k: [0.6, 0.1, 0.0166], sigma: [0, 0, 0],
    color: ['#f1f5f9', '#e2e8f0', '#64748b'], rigid: false, estimated: ['cp'], source: NBS,
  },
  {
    key: 'CO', name: 'Monóxido de carbono', formula: 'CO', category: 'gás',
    refPhase: 'g', Hf: -110.53, S: 197.67, cp: [40, 60, 29.14], Tm: 68.13, Tb: 81.6, Hfus: 0.833,
    Hvap: 6.04, rho: [929, 789], k: [0.2, 0.14, 0.025], sigma: [0, 0, 0],
    color: ['#e5e7eb', '#d1d5db', '#6b7280'], rigid: false, estimated: ['cp', 'rho'], source: NBS,
  },
  {
    key: 'Cl2', name: 'Cloro', formula: 'Cl2', category: 'gás',
    refPhase: 'g', Hf: 0, S: 223.07, cp: [60, 67, 33.91], Tm: 171.6, Tb: 239.11, Hfus: 6.4,
    Hvap: 20.41, rho: [1900, 1562], k: [0.3, 0.13, 0.0089], sigma: [0, 0, 0],
    color: ['#d9f99d', '#bef264', '#a3e635'], rigid: false, estimated: ['cp'], source: NBS,
  },
  {
    key: 'NaCl', name: 'Cloreto de sódio (sal)', formula: 'NaCl', category: 'composto',
    refPhase: 's', Hf: -411.15, S: 72.13, cp: [50.5, 66.9, 37], Tm: 1073.8, Tb: 1738, Hfus: 28.16,
    Hvap: 170, rho: [2165, 1556], k: [6.5, 0.5, 0.02], sigma: [0, 360, 0],
    color: ['#f8fafc', '#fef3c7', '#fef9c3'], rigid: false,
    estimated: ['cp', 'Hvap', 'sigma'], source: NBS,
  },
  {
    key: 'brine', name: 'Salmoura (NaCl aq)', formula: 'NaCl(H2O)10', category: 'solução',
    // ΔHf = ΔHf(NaCl,aq) + 10·ΔHf(H2O,l); S = S(NaCl,aq) + 10·S(H2O,l). ~5,5 mol/kg, quase saturada.
    // Não ferve diretamente: a evaporação é a reação salmoura → NaCl + 10 H2O(g).
    refPhase: 'l', Hf: -3265.57, S: 814.6, cp: [400, 787, 787], Tm: 252, Tb: 1e9, Hfus: 60.1,
    Hvap: 1, rho: [1150, 1197], k: [2, 0.57, 0.025], sigma: [0, 22, 0],
    color: ['#e0f2fe', '#5ab0d6', '#e2e8f0'], rigid: true,
    estimated: ['cp', 'Hfus', 'sigma'],
    source: 'NBS (NaCl aq = −407,27 kJ/mol; S = 115,5) + água líquida',
  },
  {
    key: 'NaOH', name: 'Hidróxido de sódio', formula: 'NaOH', category: 'composto',
    refPhase: 's', Hf: -425.61, S: 64.46, cp: [59.54, 85, 50], Tm: 596, Tb: 1661, Hfus: 6.6,
    Hvap: 175, rho: [2130, 1780], k: [1, 0.8, 0.02], sigma: [0, 200, 0],
    color: ['#f5f5f4', '#fafaf9', '#e7e5e4'], rigid: false,
    estimated: ['cp', 'Hvap', 'sigma', 'k'], source: NBS,
  },
  {
    key: 'NaOH_aq', name: 'Soda cáustica (NaOH aq)', formula: 'NaOH(H2O)9', category: 'solução',
    // ΔHf = ΔHf(NaOH,aq) + 9·ΔHf(H2O,l); S = S(NaOH,aq) + 9·S(H2O,l)
    refPhase: 'l', Hf: -3042.58, S: 677.3, cp: [380, 700, 700], Tm: 250, Tb: 1e9, Hfus: 54,
    Hvap: 1, rho: [1150, 1200], k: [2, 0.57, 0.025], sigma: [0, 35, 0],
    color: ['#ede9fe', '#a78bfa', '#e2e8f0'], rigid: true,
    estimated: ['cp', 'Hfus', 'sigma', 'rho'],
    source: 'NBS (NaOH aq = −470,11 kJ/mol; S = 48,1) + água líquida',
  },
  {
    key: 'Na', name: 'Sódio', formula: 'Na', category: 'metal',
    refPhase: 's', Hf: 0, S: 51.21, cp: [28.24, 31.8, 20.79], Tm: 370.98, Tb: 1156, Hfus: 2.6,
    Hvap: 97.42, rho: [968, 927], k: [142, 86, 0.05], sigma: [2.1e7, 1.04e7, 0], alpha: 0.0055,
    color: ['#d4d4d8', '#e4e4e7', '#fde047'], rigid: false, metal: true,
    estimated: ['alpha'], source: NBS,
  },
  {
    key: 'Fe', name: 'Ferro', formula: 'Fe', category: 'metal',
    refPhase: 's', Hf: 0, S: 27.28, cp: [25.1, 46.0, 25.7], Tm: 1811, Tb: 3134, Hfus: 13.81,
    Hvap: 340, rho: [7874, 6980], k: [80.4, 40, 0.05], sigma: [1.0e7, 7.7e5, 0], alpha: 0.0065,
    color: ['#71717a', '#fb923c', '#fdba74'], rigid: true, metal: true, source: NBS,
  },
  {
    key: 'Fe2O3', name: 'Óxido de ferro III', formula: 'Fe2O3', category: 'composto',
    refPhase: 's', Hf: -824.2, S: 87.4, cp: [103.85, 150, 80], Tm: 1838, Tb: 3400, Hfus: 92,
    Hvap: 500, rho: [5240, 4500], k: [5, 2, 0.05], sigma: [0, 0, 0],
    color: ['#9a3412', '#c2410c', '#fdba74'], rigid: false,
    estimated: ['cp', 'Tb', 'Hfus', 'Hvap', 'k'], source: NBS,
  },
  {
    key: 'Al', name: 'Alumínio', formula: 'Al', category: 'metal',
    refPhase: 's', Hf: 0, S: 28.33, cp: [24.35, 31.75, 21.38], Tm: 933.47, Tb: 2792, Hfus: 10.71,
    Hvap: 294, rho: [2700, 2375], k: [237, 91, 0.05], sigma: [3.77e7, 4.1e6, 0], alpha: 0.0039,
    color: ['#d4d4d8', '#e5e7eb', '#f5f5f4'], rigid: false, metal: true, source: NBS,
  },
  {
    key: 'Al2O3', name: 'Óxido de alumínio', formula: 'Al2O3', category: 'composto',
    refPhase: 's', Hf: -1675.7, S: 50.92, cp: [79.04, 192.5, 80], Tm: 2345, Tb: 3250, Hfus: 111.1,
    Hvap: 480, rho: [3950, 3000], k: [30, 5, 0.05], sigma: [0, 0, 0],
    color: ['#f5f5f4', '#fef08a', '#fef9c3'], rigid: false,
    estimated: ['Tb', 'Hvap'], source: NBS + '; Cp líquido JANAF',
  },
  {
    key: 'Cu', name: 'Cobre', formula: 'Cu', category: 'metal',
    refPhase: 's', Hf: 0, S: 33.15, cp: [24.44, 32.8, 20.79], Tm: 1357.77, Tb: 2835, Hfus: 13.26,
    Hvap: 300.4, rho: [8960, 8020], k: [401, 165, 0.05], sigma: [5.96e7, 4.8e6, 0],
    alpha: 0.00393, color: ['#c2703a', '#fb923c', '#86efac'], rigid: true, metal: true,
    source: NBS,
  },
  {
    key: 'NiCr', name: 'Nicromo (resistência)', formula: 'Ni7Cr2', category: 'metal',
    // liga 80Ni/20Cr em massa ≈ Ni7Cr2 em mol. ΔHf de mistura desprezado.
    refPhase: 's', Hf: 0, S: 256.6, cp: [231.7, 260, 190], Tm: 1673, Tb: 3000, Hfus: 164,
    Hvap: 3300, rho: [8400, 7600], k: [11.3, 20, 0.05], sigma: [9.1e5, 7e5, 0], alpha: 0.0004,
    color: ['#a1a1aa', '#fdba74', '#fde68a'], rigid: true, metal: true,
    estimated: ['S', 'Tb', 'Hfus', 'Hvap', 'cp'],
    source: 'CRC (ρ elétrica 1,10 µΩ·m, Cp 0,45 J/g·K); resto estimado da soma Ni+Cr',
  },
  {
    key: 'C', name: 'Carbono (grafite)', formula: 'C', category: 'composto',
    refPhase: 's', Hf: 0, S: 5.74, cp: [8.53, 20, 20.8], Tm: 4000, Tb: 4100, Hfus: 117, Hvap: 600,
    rho: [2266, 1600], k: [100, 10, 0.05], sigma: [7e4, 1e5, 0],
    color: ['#27272a', '#52525b', '#a1a1aa'], rigid: false, metal: true,
    estimated: ['Tm', 'Tb', 'Hfus', 'Hvap', 'k', 'sigma'],
    source: NBS + '; sublima ~3900 K',
  },
  {
    key: 'SiO2', name: 'Areia (SiO2)', formula: 'SiO2', category: 'composto',
    refPhase: 's', Hf: -910.94, S: 41.84, cp: [44.43, 86, 50], Tm: 1986, Tb: 2503, Hfus: 9.6,
    Hvap: 520, rho: [2650, 2200], k: [1.4, 1, 0.05], sigma: [0, 0, 0],
    color: ['#e3c16f', '#fb923c', '#fde68a'], rigid: false,
    estimated: ['Hvap', 'cp'], source: NBS,
  },
  {
    key: 'CaCO3', name: 'Carbonato de cálcio', formula: 'CaCO3', category: 'composto',
    refPhase: 's', Hf: -1206.92, S: 92.9, cp: [83.47, 120, 90], Tm: 1612, Tb: 3000, Hfus: 53,
    Hvap: 300, rho: [2710, 2500], k: [2.7, 1, 0.05], sigma: [0, 0, 0],
    color: ['#fafaf9', '#f5f5f4', '#e7e5e4'], rigid: false,
    estimated: ['Tm', 'Tb', 'Hfus', 'Hvap'], source: NBS + ' (calcita)',
  },
  {
    key: 'CaO', name: 'Óxido de cálcio (cal)', formula: 'CaO', category: 'composto',
    refPhase: 's', Hf: -635.09, S: 39.75, cp: [42.8, 62, 40], Tm: 2886, Tb: 3123, Hfus: 79,
    Hvap: 350, rho: [3340, 2900], k: [15, 3, 0.05], sigma: [0, 0, 0],
    color: ['#f4f4f5', '#fef3c7', '#fefce8'], rigid: false,
    estimated: ['Hfus', 'Hvap', 'k', 'cp'], source: NBS,
  },
];
