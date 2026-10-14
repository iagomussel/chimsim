// Elementos químicos.
// Massa atômica: pesos atômicos padrão IUPAC (valor convencional/abreviado).
// Eletronegatividade: escala de Pauling (null quando não definida).
// Cor: convenção CPK/Jmol, só para UI.

export interface ElementData {
  z: number;
  symbol: string;
  name: string;
  mass: number; // g/mol
  en: number | null;
  color: string;
}

export const ELEMENTS: ElementData[] = [
  { z: 1, symbol: 'H', name: 'Hidrogênio', mass: 1.008, en: 2.2, color: '#ffffff' },
  { z: 2, symbol: 'He', name: 'Hélio', mass: 4.0026, en: null, color: '#d9ffff' },
  { z: 3, symbol: 'Li', name: 'Lítio', mass: 6.94, en: 0.98, color: '#cc80ff' },
  { z: 4, symbol: 'Be', name: 'Berílio', mass: 9.0122, en: 1.57, color: '#c2ff00' },
  { z: 5, symbol: 'B', name: 'Boro', mass: 10.81, en: 2.04, color: '#ffb5b5' },
  { z: 6, symbol: 'C', name: 'Carbono', mass: 12.011, en: 2.55, color: '#909090' },
  { z: 7, symbol: 'N', name: 'Nitrogênio', mass: 14.007, en: 3.04, color: '#3050f8' },
  { z: 8, symbol: 'O', name: 'Oxigênio', mass: 15.999, en: 3.44, color: '#ff0d0d' },
  { z: 9, symbol: 'F', name: 'Flúor', mass: 18.998, en: 3.98, color: '#90e050' },
  { z: 10, symbol: 'Ne', name: 'Neônio', mass: 20.18, en: null, color: '#b3e3f5' },
  { z: 11, symbol: 'Na', name: 'Sódio', mass: 22.99, en: 0.93, color: '#ab5cf2' },
  { z: 12, symbol: 'Mg', name: 'Magnésio', mass: 24.305, en: 1.31, color: '#8aff00' },
  { z: 13, symbol: 'Al', name: 'Alumínio', mass: 26.982, en: 1.61, color: '#bfa6a6' },
  { z: 14, symbol: 'Si', name: 'Silício', mass: 28.085, en: 1.9, color: '#f0c8a0' },
  { z: 15, symbol: 'P', name: 'Fósforo', mass: 30.974, en: 2.19, color: '#ff8000' },
  { z: 16, symbol: 'S', name: 'Enxofre', mass: 32.06, en: 2.58, color: '#ffff30' },
  { z: 17, symbol: 'Cl', name: 'Cloro', mass: 35.45, en: 3.16, color: '#1ff01f' },
  { z: 18, symbol: 'Ar', name: 'Argônio', mass: 39.948, en: null, color: '#80d1e3' },
  { z: 19, symbol: 'K', name: 'Potássio', mass: 39.098, en: 0.82, color: '#8f40d4' },
  { z: 20, symbol: 'Ca', name: 'Cálcio', mass: 40.078, en: 1.0, color: '#3dff00' },
  { z: 22, symbol: 'Ti', name: 'Titânio', mass: 47.867, en: 1.54, color: '#bfc2c7' },
  { z: 24, symbol: 'Cr', name: 'Cromo', mass: 51.996, en: 1.66, color: '#8a99c7' },
  { z: 25, symbol: 'Mn', name: 'Manganês', mass: 54.938, en: 1.55, color: '#9c7ac7' },
  { z: 26, symbol: 'Fe', name: 'Ferro', mass: 55.845, en: 1.83, color: '#e06633' },
  { z: 27, symbol: 'Co', name: 'Cobalto', mass: 58.933, en: 1.88, color: '#f090a0' },
  { z: 28, symbol: 'Ni', name: 'Níquel', mass: 58.693, en: 1.91, color: '#50d050' },
  { z: 29, symbol: 'Cu', name: 'Cobre', mass: 63.546, en: 1.9, color: '#c88033' },
  { z: 30, symbol: 'Zn', name: 'Zinco', mass: 65.38, en: 1.65, color: '#7d80b0' },
  { z: 35, symbol: 'Br', name: 'Bromo', mass: 79.904, en: 2.96, color: '#a62929' },
  { z: 47, symbol: 'Ag', name: 'Prata', mass: 107.87, en: 1.93, color: '#c0c0c0' },
  { z: 50, symbol: 'Sn', name: 'Estanho', mass: 118.71, en: 1.96, color: '#668080' },
  { z: 53, symbol: 'I', name: 'Iodo', mass: 126.9, en: 2.66, color: '#940094' },
  { z: 74, symbol: 'W', name: 'Tungstênio', mass: 183.84, en: 2.36, color: '#2194d6' },
  { z: 78, symbol: 'Pt', name: 'Platina', mass: 195.08, en: 2.28, color: '#d0d0e0' },
  { z: 79, symbol: 'Au', name: 'Ouro', mass: 196.97, en: 2.54, color: '#ffd123' },
  { z: 80, symbol: 'Hg', name: 'Mercúrio', mass: 200.59, en: 2.0, color: '#b8b8d0' },
  { z: 82, symbol: 'Pb', name: 'Chumbo', mass: 207.2, en: 2.33, color: '#575961' },
  { z: 92, symbol: 'U', name: 'Urânio', mass: 238.03, en: 1.38, color: '#008fff' },
];

export const ELEMENT_BY_SYMBOL: Record<string, ElementData> = Object.fromEntries(
  ELEMENTS.map((e) => [e.symbol, e]),
);
