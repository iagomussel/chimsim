import { R, molarEntropy, naturalPhase } from '../chem/thermo';
import type { Phase } from '../data/species';
import type { Grid } from './grid';
import { AIR, type ReactionRt } from './registry';

export interface ReactionEvent {
  rx: ReactionRt;
  x: number;
  y: number;
  dH: number; // J liberados (negativo = exotérmico)
}

const NB = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** Estatística simples para a UI. */
export const reactionStats = { events: 0, heat: 0 };

interface Source {
  cell: number;
  /** a célula é ar fornecendo O2 */
  fromAir: boolean;
  coef: number;
  id: number;
}

/**
 * Reações químicas entre vizinhos (ou de uma célula sozinha).
 * - Probabilidade por passo: 1 − exp(−k·dt), k = A·exp(−Ea/RT) (Arrhenius).
 * - Só avança se ΔG(T) < 0; a taxa é multiplicada por (1 − e^{ΔG/RT}).
 * - Estequiometria em mol: o reagente limitante é consumido inteiro.
 * - Energia: entalpia total das células envolvidas é conservada; o calor da
 *   reação aparece como temperatura final comum T_f.
 */
export function stepReactions(g: Grid, dt: number, onEvent?: (e: ReactionEvent) => void) {
  const reg = g.reg;
  const { w, h, sp, ph, T } = g;
  const o2 = reg.byKey.get('O2');
  const o2Id = o2 ? o2.id : -1;

  for (let i = 0; i < g.size; i++) {
    const a = sp[i];
    if (a === AIR) continue;
    const x = i % w;
    const y = (i / w) | 0;

    // um reagente
    const singles = reg.singleIndex.get(a);
    if (singles) {
      for (const rx of singles) {
        const r0 = rx.reactants[0];
        if (r0.phase >= 0 && r0.phase !== ph[i]) continue;
        if (!rollRate(rx, T[i], dt)) continue;
        if (!rollGibbs(g, rx, [i], [false], T[i])) continue;
        if (execute(g, rx, [{ cell: i, fromAir: false, coef: r0.coef, id: a }], T[i], onEvent)) break;
      }
    }

    // par com vizinho aleatório
    const [dx, dy] = NB[(Math.random() * 4) | 0];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const j = ny * w + nx;
    let b = sp[j];
    const fromAir = b === AIR;
    if (fromAir) {
      if (o2Id < 0) continue;
      b = o2Id;
    }
    const list = reg.pairIndex.get(a * 65536 + b);
    if (!list) continue;
    // a interface reage na temperatura do lado mais quente
    const Tr = Math.max(T[i], T[j]);
    for (const rx of list) {
      // casa reagentes com células
      const [r0, r1] = rx.reactants;
      let first: number;
      let second: number;
      if (r0.id === a && r1.id === b) {
        first = i;
        second = j;
      } else {
        first = j;
        second = i;
      }
      const okPhase = (r: typeof r0, c: number, air: boolean) =>
        r.phase < 0 || (air ? r.phase === 2 : r.phase === ph[c]);
      if (!okPhase(r0, first, fromAir && first === j)) continue;
      if (!okPhase(r1, second, fromAir && second === j)) continue;
      if (!rollRate(rx, Tr, dt)) continue;
      const cells = [first, second];
      const airFlags = [fromAir && first === j, fromAir && second === j];
      if (!rollGibbs(g, rx, cells, airFlags, Tr)) continue;
      const sources: Source[] = [
        { cell: first, fromAir: airFlags[0], coef: r0.coef, id: r0.id },
        { cell: second, fromAir: airFlags[1], coef: r1.coef, id: r1.id },
      ];
      if (execute(g, rx, sources, Tr, onEvent)) break;
    }
  }
}

function rollRate(rx: ReactionRt, T: number, dt: number) {
  const k = rx.A * Math.exp(-rx.Ea / (R * T));
  const p = 1 - Math.exp(-k * dt);
  return Math.random() < p;
}

function rollGibbs(g: Grid, rx: ReactionRt, cells: number[], air: boolean[], T: number) {
  const reg = g.reg;
  let dH = 0;
  let dS = 0;
  rx.reactants.forEach((r, k) => {
    const s = reg.species[r.id];
    const p = (air[k] ? 2 : g.ph[cells[k]]) as Phase;
    dH -= r.coef * (s.ha[p] + s.cp[p] * T);
    dS -= r.coef * molarEntropy(s.def, p, T);
  });
  for (const pr of rx.products) {
    const s = reg.species[pr.id];
    const p = naturalPhase(s.def, T);
    dH += pr.coef * (s.ha[p] + s.cp[p] * T);
    dS += pr.coef * molarEntropy(s.def, p, T);
  }
  const dG = dH - T * dS;
  if (dG >= 0) return false;
  return Math.random() < 1 - Math.exp(dG / (R * T));
}

/** Pode abrir espaço em k empurrando a coluna para cima? (sem mexer em células protegidas) */
function canPushUp(g: Grid, k: number, protect: number[]) {
  const w = g.w;
  const x = k % w;
  for (let y = (k / w) | 0; y >= 0; y--) {
    const c = y * w + x;
    if (c !== k && protect.includes(c)) return false;
    if (g.sp[c] === AIR) return true;
    if (g.ph[c] === 0 && g.fixed[c]) return false;
  }
  return false;
}

function execute(
  g: Grid,
  rx: ReactionRt,
  sources: Source[],
  Tr: number,
  onEvent?: (e: ReactionEvent) => void,
): boolean {
  const reg = g.reg;
  const { w, h, n } = g;
  // extensão ξ limitada pelo reagente mais escasso
  let xi = Infinity;
  for (const s of sources) {
    const avail = s.fromAir ? n[s.cell] * g.o2[s.cell] : n[s.cell];
    xi = Math.min(xi, avail / s.coef);
  }
  if (!(xi > 0)) return false;

  const freed: number[] = [];
  for (const s of sources) {
    if (s.fromAir) continue;
    if (n[s.cell] - s.coef * xi <= n[s.cell] * 1e-9) freed.push(s.cell);
  }

  // planeja onde cada produto vai ficar (sem alterar nada ainda)
  type Place = { id: number; mol: number; phase: Phase; cell: number; mode: 'free' | 'merge' | 'air' | 'push' };
  const plan: Place[] = [];
  const used = new Set<number>();
  const around: number[] = [];
  for (const s of sources) {
    const cx = s.cell % w;
    const cy = (s.cell / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const c = ny * w + nx;
        if (!around.includes(c)) around.push(c);
      }
  }
  // 1ª passada: célula liberada, fusão com vizinho igual, ou ar vizinho
  const pending: { id: number; mol: number; phase: Phase }[] = [];
  for (const pr of rx.products) {
    const s = reg.species[pr.id];
    const mol = pr.coef * xi;
    const phase = naturalPhase(s.def, Tr);
    let cell = -1;
    let mode: Place['mode'] = 'free';
    for (const f of freed) if (!used.has(f)) { cell = f; break; }
    if (cell < 0) {
      mode = 'merge';
      for (const c of around) {
        if (used.has(c) || freed.includes(c)) continue;
        if (g.sp[c] === pr.id && g.ph[c] === phase) { cell = c; break; }
      }
    }
    if (cell < 0) {
      mode = 'air';
      for (const c of around) {
        if (used.has(c) || freed.includes(c)) continue;
        if (g.sp[c] === AIR) { cell = c; break; }
      }
    }
    if (cell < 0) {
      pending.push({ id: pr.id, mol, phase });
      continue;
    }
    if (mode !== 'merge') used.add(cell);
    plan.push({ id: pr.id, mol, phase, cell, mode });
  }
  // 2ª passada: no máximo um produto abre espaço empurrando a coluna para cima,
  // sem passar por nenhuma célula já usada (os índices dela mudariam)
  if (pending.length > 1) return false;
  if (pending.length === 1) {
    const protect = [...sources.map((s) => s.cell), ...plan.map((p) => p.cell)];
    let cell = -1;
    for (const c of around) {
      if (protect.includes(c)) continue;
      if (canPushUp(g, c, protect)) { cell = c; break; }
    }
    if (cell < 0) return false; // sem espaço: a reação espera
    plan.unshift({ ...pending[0], cell, mode: 'push' });
  }

  // Equilíbrio térmico local: o calor do evento fica na mistura que reagiu —
  // células participantes, o ar doador de O2 (o N2 dele absorve calor, e é isso
  // que limita a temperatura de chama) e as células que recebem produto por fusão.
  // Ficam de fora as células que serão substituídas por produto e a coluna empurrada.
  const replaced = new Set<number>();
  let pushCol = -1;
  let pushY = -1;
  for (const p of plan) {
    if (p.mode === 'air' || p.mode === 'push') replaced.add(p.cell);
    if (p.mode === 'push') {
      pushCol = p.cell % w;
      pushY = (p.cell / w) | 0;
    }
  }
  const touched = new Set<number>();
  const local = [...sources.map((s) => s.cell), ...plan.filter((p) => p.mode === 'merge').map((p) => p.cell)];
  for (const c of local) {
    if (replaced.has(c)) continue;
    if (c % w === pushCol && ((c / w) | 0) <= pushY) continue;
    touched.add(c);
  }
  let Hbefore = 0;
  for (const c of touched) Hbefore += g.enthalpy(c);
  // O2 tirado de um ar que vai ser substituído: entra só a entalpia do O2
  const o2 = reg.byKey.get('O2');
  for (const s of sources) {
    if (!s.fromAir || !o2 || touched.has(s.cell)) continue;
    const mol = s.coef * xi;
    Hbefore += mol * (o2.ha[2] + o2.cp[2] * g.T[s.cell]);
  }
  const phasesBefore = sources.map((s) => g.ph[s.cell]);
  // aplica consumo
  for (const s of sources) {
    const mol = s.coef * xi;
    if (s.fromAir) {
      const c = s.cell;
      const nO2 = n[c] * g.o2[c] - mol;
      n[c] -= mol;
      g.o2[c] = n[c] > 0 ? Math.max(0, nO2 / n[c]) : 0;
    } else {
      n[s.cell] = Math.max(0, n[s.cell] - mol);
    }
  }
  // coloca produtos
  for (const p of plan) {
    if (p.mode === 'push') g.pushUp(p.cell);
    if (p.mode === 'merge') {
      n[p.cell] += p.mol;
    } else {
      const wasFixed = g.fixed[p.cell] === 1;
      g.setCell(p.cell, p.id, p.phase, Tr, p.mol, wasFixed && reg.species[p.id].rigid);
    }
    touched.add(p.cell);
  }
  // células totalmente consumidas que não receberam produto viram ar
  for (const f of freed) if (!used.has(f)) g.setAir(f, Tr);
  for (const f of freed) if (!used.has(f)) touched.delete(f);

  // temperatura final comum que conserva a entalpia
  let A = 0;
  let B = 0;
  for (const c of touched) {
    const s = reg.species[g.sp[c]];
    const ph = g.ph[c];
    A += n[c] * s.ha[ph];
    B += n[c] * s.cp[ph];
    g.lat[c] = 0;
  }
  if (B <= 0) return true;
  const Tf = Math.max(1, (Hbefore - A) / B);
  for (const c of touched) g.T[c] = Tf;

  // ΔH da reação (J) nas fases reais, para estatística/UI
  let dH = 0;
  sources.forEach((src, k) => {
    const s = reg.species[rx.reactants[k].id];
    const p = (src.fromAir ? 2 : phasesBefore[k]) as Phase;
    dH -= src.coef * xi * (s.ha[p] + s.cp[p] * Tr);
  });
  for (const p of plan) {
    const s = reg.species[p.id];
    dH += p.mol * (s.ha[p.phase] + s.cp[p.phase] * Tr);
  }
  reactionStats.heat += -dH;
  reactionStats.events++;
  onEvent?.({ rx, x: sources[0].cell % w, y: (sources[0].cell / w) | 0, dH });
  return true;
}
