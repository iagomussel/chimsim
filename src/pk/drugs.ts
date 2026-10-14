import { kaFromTmax, type DrugDef } from './model';

/**
 * Presets com parâmetros de adultos saudáveis.
 * ka não costuma ser publicado direto: aqui é calculado para o modelo dar o Tmax relatado.
 */

// Paracetamol: V ≈ 0,9 L/kg; CL ≈ 4,5–5,5 mL/min/kg (uso 5 → 0,3 L/h/kg); t½ 1,9–2,5 h; F 70–90 %.
const PARA_V = 0.9;
const PARA_CL = 0.3;
// Ibuprofeno (bula, suspensão 200 mg em adultos): CL/F 45,6 mL/h/kg, Tmax 0,79 h; V ≈ 0,12 L/kg.
const IBU_V = 0.12;
const IBU_CL = 0.0456;
// Cafeína (Lelo et al. 1986): CL 2,07 mL/min/kg = 0,124 L/h/kg; t½ 4,1 h → V = CL·t½/ln2.
const CAF_CL = (2.07 * 60) / 1000;
const CAF_V = (CAF_CL * 4.1) / Math.LN2;

export const DRUGS: DrugDef[] = [
  {
    key: 'paracetamol',
    name: 'Paracetamol',
    formula: 'C8H9NO2',
    F: 0.8,
    ka: kaFromTmax(0.65, PARA_CL / PARA_V),
    V: PARA_V,
    CL: PARA_CL,
    refs: [{ label: 'Nomograma Rumack–Matthew: 150 mg/L em 4 h (só overdose aguda única)', mgL: 150, t: 4 }],
    note:
      'Em overdose a eliminação satura, então este modelo linear subestima a concentração em doses muito altas. ' +
      'Com 1 g e 70 kg o modelo dá Cmax ≈ 10 mg/L; estudos medem 18–21 mg/L. Causa provável: a fase inicial de distribuição, que este modelo de 1 compartimento não tem.',
    sources: [
      'Forrest, Clements & Prescott, Clin Pharmacokinet 1982 — V ≈ 0,9 L/kg',
      'CL 4,5–5,5 mL/min/kg e t½ 1,9–2,5 h (revisões de farmacocinética)',
      'Sevilla-Tirado et al. — 1 g oral: Tmax 0,40–0,88 h, Cmax 18–21 mg/L',
      'Rumack–Matthew: linha de tratamento 150 µg/mL em 4 h',
    ],
    estimated: ['F (meio da faixa 70–90 %)', 'ka (ajustado ao Tmax 0,65 h)'],
  },
  {
    key: 'ibuprofen',
    name: 'Ibuprofeno',
    formula: 'C13H18O2',
    F: 1,
    ka: kaFromTmax(0.79, IBU_CL / IBU_V),
    V: IBU_V,
    CL: IBU_CL,
    note: 'CL e V são aparentes (divididos por F), por isso F = 1. Mistura racêmica; o modelo não separa os isômeros R e S.',
    sources: [
      'Bula ibuprofeno suspensão oral (Taro, 2021) — 200 mg em adultos: Cmax 19 mg/L, Tmax 0,79 h, AUC 64 mg·h/L, CL/F 45,6 mL/h/kg',
      'Bula: V ≈ 0,12 L/kg em adultos; t½ ≈ 2 h',
    ],
    estimated: ['ka (ajustado ao Tmax 0,79 h)'],
  },
  {
    key: 'caffeine',
    name: 'Cafeína',
    formula: 'C8H10N4O2',
    F: 1,
    ka: kaFromTmax(1, CAF_CL / CAF_V),
    V: CAF_V,
    CL: CAF_CL,
    note: 'A meia-vida varia muito entre pessoas (fumo, gravidez, anticoncepcional, doença do fígado).',
    sources: [
      'Lelo, Birkett, Robson & Miners, Br J Clin Pharmacol 1986;22:177 — CL 2,07 mL/min/kg, t½ 4,1 h',
      'Blanchard et al., Eur J Clin Pharmacol 1983;24:93 — biodisponibilidade oral praticamente completa',
    ],
    estimated: ['V (calculado de CL e t½)', 'ka (ajustado a Tmax 1 h; faixa relatada 0,5–2 h)'],
  },
];
