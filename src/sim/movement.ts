import { idealGasMoles } from '../chem/thermo';
import type { Grid } from './grid';
import { AIR, AIR_O2 } from './registry';

/**
 * Movimento por fase e densidade (autômato celular).
 * - sólido fixo: parado
 * - sólido solto (pó): cai, escorrega na diagonal, afunda/boia em líquidos pela densidade
 * - líquido: cai, escorre para os lados
 * - gás: empuxo pela densidade (ρ = PM/RT), difusão aleatória, expansão quando comprimido
 * O movimento é visual: um passo por quadro, sem escala de tempo física.
 */
export function stepMovement(g: Grid, openTop: boolean) {
  const { w, h, sp, ph, fixed, n, T } = g;
  g.upd.fill(0);
  const upd = g.upd;

  for (let y = h - 1; y >= 0; y--) {
    const ltr = Math.random() < 0.5;
    for (let c = 0; c < w; c++) {
      const x = ltr ? c : w - 1 - c;
      const i = y * w + x;
      if (upd[i]) continue;
      const p = ph[i];
      if (p === 0 && fixed[i]) continue;
      const dir = Math.random() < 0.5 ? 1 : -1;

      if (p === 0) {
        movePowder(g, x, y, i, dir);
      } else if (p === 1) {
        moveLiquid(g, x, y, i, dir);
      } else {
        // gás (inclui ar)
        if (openTop && y === 0) {
          if (sp[i] === AIR) {
            g.o2[i] = AIR_O2;
            T[i] += (g.ambientT - T[i]) * 0.05;
            n[i] = idealGasMoles(g.cellVolume, T[i]);
          } else if (Math.random() < 0.05) {
            g.setAir(i, g.ambientT);
          }
          continue;
        }
        if (sp[i] !== AIR && n[i] > 2 * idealGasMoles(g.cellVolume, T[i])) {
          if (expandGas(g, x, y, i)) continue;
        }
        moveGas(g, x, y, i, dir);
      }
    }
  }
  // ar: mantém n coerente com T (o ar é reservatório a 1 atm)
  for (let i = 0; i < g.size; i++) {
    if (sp[i] === AIR) n[i] = idealGasMoles(g.cellVolume, T[i]);
  }
}

function isFluid(g: Grid, j: number) {
  return g.ph[j] !== 0 || !g.fixed[j];
}

function movePowder(g: Grid, x: number, y: number, i: number, dir: number) {
  const { w, h, ph } = g;
  const rho = g.density(i);
  if (y + 1 < h) {
    const below = i + w;
    if (ph[below] !== 0 && g.density(below) < rho) {
      if (ph[below] === 2 || Math.random() < 0.5) return g.swap(i, below);
    }
    for (const dx of [dir, -dir]) {
      const nx = x + dx;
      if (nx < 0 || nx >= w) continue;
      const j = below + dx;
      if (ph[j] !== 0 && g.density(j) < rho && ph[i + dx] !== 0) {
        if (ph[j] === 2 || Math.random() < 0.3) return g.swap(i, j);
      }
    }
  }
  // boia se for menos denso que o líquido de cima
  if (y > 0) {
    const above = i - w;
    if (ph[above] === 1 && g.density(above) > rho && Math.random() < 0.3) return g.swap(i, above);
  }
}

function moveLiquid(g: Grid, x: number, y: number, i: number, dir: number) {
  const { w, h, ph, sp } = g;
  const rho = g.density(i);
  if (y + 1 < h) {
    const below = i + w;
    if (ph[below] === 2) return g.swap(i, below);
    if (ph[below] === 1 && sp[below] !== sp[i] && g.density(below) < rho && Math.random() < 0.5) {
      return g.swap(i, below);
    }
    if (ph[below] === 0 && !g.fixed[below] && g.density(below) < rho && Math.random() < 0.3) {
      return g.swap(i, below);
    }
    for (const dx of [dir, -dir]) {
      const nx = x + dx;
      if (nx < 0 || nx >= w) continue;
      if (ph[below + dx] === 2 && ph[i + dx] === 2) return g.swap(i, below + dx);
    }
  }
  for (const dx of [dir, -dir]) {
    const nx = x + dx;
    if (nx < 0 || nx >= w) continue;
    const j = i + dx;
    if (ph[j] === 2) return g.swap(i, j);
  }
}

function moveGas(g: Grid, x: number, y: number, i: number, dir: number) {
  const { w, h, ph, sp } = g;
  if (sp[i] === AIR) {
    // caminho rápido do ar: convecção (ar mais quente que o de cima sobe) e mistura de O2.
    // As interações do ar com outros gases são tratadas pelo outro gás.
    const T = g.T;
    if (y > 0) {
      const a = i - w;
      if (sp[a] === AIR && T[i] > T[a] + 0.5 && Math.random() < 0.5) return g.swap(i, a);
    }
    const nx = x + dir;
    if (nx >= 0 && nx < w) {
      const j = i + dir;
      if (sp[j] === AIR && g.o2[i] !== g.o2[j]) {
        const m = (g.o2[i] + g.o2[j]) * 0.5;
        g.o2[i] = m;
        g.o2[j] = m;
      }
    }
    return;
  }
  const rho = g.density(i);
  // bolha subindo dentro de líquido ou pó
  if (y > 0) {
    const above = i - w;
    if (ph[above] !== 2 && isFluid(g, above)) return g.swap(i, above);
    if (ph[above] === 2 && g.density(above) > rho * 1.001 && Math.random() < 0.6) {
      return g.swap(i, above);
    }
  }
  if (y + 1 < h) {
    const below = i + w;
    if (ph[below] === 2 && g.density(below) * 1.001 < rho && Math.random() < 0.6) {
      return g.swap(i, below);
    }
  }
  // difusão lateral aleatória
  const nx = x + dir;
  if (nx >= 0 && nx < w) {
    const j = i + dir;
    if (ph[j] === 2) {
      if (sp[i] === AIR && sp[j] === AIR) {
        const m = (g.o2[i] + g.o2[j]) * 0.5;
        g.o2[i] = m;
        g.o2[j] = m;
      } else if (Math.random() < 0.3) {
        return g.swap(i, j);
      }
    }
  }
}

/** Gás com mais mol que cabe a 1 atm ocupa a célula de ar vizinha. */
function expandGas(g: Grid, x: number, y: number, i: number): boolean {
  const { w, h } = g;
  const order = [
    [0, -1], [-1, 0], [1, 0], [0, 1],
  ];
  const k = (Math.random() * 4) | 0;
  for (let t = 0; t < 4; t++) {
    const [dx, dy] = order[(k + t) % 4];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const j = ny * w + nx;
    if (g.sp[j] !== AIR) continue;
    const half = g.n[i] / 2;
    // o ar deslocado sai pelo reservatório; o gás divide mol e mantém T
    g.copy(i, j);
    g.n[i] = half;
    g.n[j] = half;
    g.lat[i] = g.lat[j] = g.lat[i] / 2;
    g.upd[i] = 1;
    g.upd[j] = 1;
    return true;
  }
  return false;
}
