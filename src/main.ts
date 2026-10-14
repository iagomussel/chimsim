import './style.css';
import { formulaHtml } from './chem/formula';
import { idealGasMoles, naturalPhase } from './chem/thermo';
import { SCENES } from './data/scenes';
import { PHASE_NAMES } from './data/species';
import { Renderer } from './render/renderer';
import { SIGMA_MIN } from './sim/electric';
import { electroStats } from './sim/electrochem';
import { reactionStats } from './sim/reactions';
import { AIR, WALL } from './sim/registry';
import { Simulation } from './sim/simulation';
import { addHeat } from './sim/thermal';
import { loadUserData } from './storage';
import type { App, AppState, Tool } from './ui/app';
import { renderCompoundBuilder, renderInfo, renderReactionBuilder } from './ui/builder';
import { $, esc, num, si, temp } from './ui/dom';
import { renderPalette } from './ui/palette';
import { renderToolbar, syncToolbar } from './ui/toolbar';

const GRID_W = 240;
const GRID_H = 160;

const sim = new Simulation(GRID_W, GRID_H);
const user = loadUserData();
for (const s of user.species) sim.reg.addSpecies(s);
for (const r of user.reactions) {
  try {
    sim.reg.addReaction(r);
  } catch (e) {
    console.warn('Reação salva inválida ignorada', r, e);
  }
}

const canvas = $('#sim-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas, sim);

const state: AppState = {
  tool: { kind: 'species', id: sim.reg.byKey.get('H2O')!.id },
  brushR: 4,
  brushT: 298.15,
  fixSolids: false,
  infoSpecies: sim.reg.byKey.get('H2O')!.id,
};

const app: App = {
  sim,
  renderer,
  state,
  user,
  refresh() {
    renderPalette(app);
    renderReactionBuilder(app);
    renderInfo(app);
    syncToolbar(app);
  },
  selectTool(t: Tool) {
    state.tool = t;
    renderPalette(app);
  },
  showTab(tab) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab));
    document.querySelectorAll('.tab-body').forEach((s) => s.classList.toggle('hidden', s.id !== `tab-${tab}`));
    if (tab === 'info') renderInfo(app);
  },
};

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => {
  b.onclick = () => app.showTab(b.dataset.tab as 'compound' | 'reaction' | 'info');
});

renderToolbar(app);
renderCompoundBuilder(app);
app.refresh();

// ---------------------------------------------------------------- canvas e entrada

function fitCanvas() {
  const wrap = $('#canvas-wrap');
  const scale = Math.max(1, Math.floor(Math.min((wrap.clientWidth - 16) / GRID_W, (wrap.clientHeight - 16) / GRID_H)));
  canvas.width = GRID_W * scale;
  canvas.height = GRID_H * scale;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const mouse = { x: -1, y: -1, down: false, inside: false };
function toGrid(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  mouse.x = Math.floor(((e.clientX - r.left) / r.width) * GRID_W);
  mouse.y = Math.floor(((e.clientY - r.top) / r.height) * GRID_H);
}
canvas.addEventListener('pointerdown', (e) => {
  mouse.down = true;
  canvas.setPointerCapture(e.pointerId);
  toGrid(e);
  applyBrush();
});
canvas.addEventListener('pointermove', (e) => {
  mouse.inside = true;
  toGrid(e);
});
canvas.addEventListener('pointerup', () => (mouse.down = false));
canvas.addEventListener('pointerleave', () => {
  mouse.inside = false;
});

function applyBrush() {
  const g = sim.grid;
  const R = state.brushR;
  const t = state.tool;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + R) continue;
      const x = mouse.x + dx;
      const y = mouse.y + dy;
      if (!g.inside(x, y)) continue;
      const i = g.idx(x, y);
      switch (t.kind) {
        case 'erase':
          g.setAir(i, g.ambientT);
          break;
        case 'heat':
          addHeat(g, i, g.heatCap(i) * 10);
          break;
        case 'cool':
          addHeat(g, i, -g.heatCap(i) * 10);
          break;
        case 'spark':
          if (g.T[i] < 1500) {
            g.T[i] = 1500;
            g.lat[i] = 0;
          }
          break;
        case 'term': {
          const s = sim.reg.species[g.sp[i]];
          if (!(s.metal && s.sigma[g.ph[i]] >= SIGMA_MIN)) {
            const cu = sim.reg.byKey.get('Cu')!;
            g.setCell(i, cu.id, 0, g.ambientT, undefined, true);
          }
          g.term[i] = t.sign;
          break;
        }
        case 'species': {
          const s = sim.reg.species[t.id];
          if (t.id !== WALL && g.sp[i] !== AIR) break;
          const ph = s.inert ? 0 : naturalPhase(s.def, state.brushT);
          const solidFixed = ph === 0 && (s.rigid || state.fixSolids);
          if (!solidFixed && t.id !== WALL && Math.random() < 0.2) break;
          g.setCell(i, t.id, ph, state.brushT, undefined, solidFixed);
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- HUD, inspetor, registro

const hud = $('#hud');
const inspector = $('#inspector');
const log = $('#event-log');
let frames = 0;
let fps = 0;
let lastFpsT = performance.now();
let lastUi = 0;
let lastEvents = -1;

function updateHud() {
  const c = sim.circuit.last;
  hud.innerHTML = `FPS ${fps} · t = ${num(sim.time, 4)} s · Δt/quadro ${si(sim.settings.dtFrame, 's')}<br>
    Fonte ${num(sim.settings.sourceV, 4)} V · I = ${si(c.current, 'A')} · P = ${si(c.power, 'W')}<br>
    Reações: ${reactionStats.events} · elétrons: ${si(electroStats.molElectrons, 'mol')} · células no circuito: ${c.solvedCells}`;
}

function updateInspector() {
  if (!mouse.inside || !sim.grid.inside(mouse.x, mouse.y)) {
    inspector.classList.add('hidden');
    renderer.hover = null;
    return;
  }
  renderer.hover = { x: mouse.x, y: mouse.y, r: state.brushR };
  const g = sim.grid;
  const i = g.idx(mouse.x, mouse.y);
  const s = sim.reg.species[g.sp[i]];
  const p = g.ph[i];
  const mass = g.n[i] * s.M * 1e6; // mg
  let extra = '';
  if (g.sp[i] === AIR) extra = `<br>O₂: ${num(g.o2[i] * 100, 3)} %`;
  else if (p === 2) extra = `<br>${num(g.n[i] / idealGasMoles(g.cellVolume, g.T[i]), 3)}× gás ideal a 1 atm`;
  const sig = sim.circuit.sigma[i];
  inspector.innerHTML = `
    <b class="text-slate-100">${esc(s.def.name)}</b> ${formulaHtml(esc(s.def.formula))} · ${PHASE_NAMES[p]}${g.fixed[i] ? ' (fixo)' : ''}
    ${g.term[i] ? ` · terminal ${g.term[i] > 0 ? '+' : '−'}` : ''}<br>
    T = ${temp(g.T[i])}${g.lat[i] ? ` · latente ${si(g.lat[i], 'J')}` : ''}<br>
    n = ${si(g.n[i], 'mol')} · m = ${num(mass, 3)} mg${extra}<br>
    σ = ${num(sig, 3)} S/m · V = ${si(sim.circuit.V[i], 'V')} · |J| = ${si(sim.circuit.J[i], 'A/m²')}
    <br><span class="text-slate-500">(${mouse.x}, ${mouse.y}) mm</span>`;
  inspector.classList.remove('hidden');
}

function updateLog() {
  if (sim.events.length === lastEvents) return;
  lastEvents = sim.events.length;
  log.innerHTML = sim.events
    .slice(-12)
    .reverse()
    .map((e) => `<li>${esc(e.rx.def.name)} <span class="${e.dH < 0 ? 'text-orange-400' : 'text-sky-400'}">${si(e.dH, 'J')}</span></li>`)
    .join('');
}

function loop(now: number) {
  frames++;
  if (now - lastFpsT >= 1000) {
    fps = frames;
    frames = 0;
    lastFpsT = now;
  }
  if (mouse.down) applyBrush();
  if (sim.settings.running) sim.step();
  renderer.draw();
  if (now - lastUi > 100) {
    lastUi = now;
    updateHud();
    updateInspector();
    updateLog();
  }
  requestAnimationFrame(loop);
}

// cena inicial: ?cena=<chave>&vista=<material|temp|voltage|current>&rapido=1
const params = new URLSearchParams(location.search);
const scene = SCENES.find((s) => s.key === params.get('cena')) ?? SCENES[0];
scene.build(sim);
const view = params.get('vista');
if (view === 'material' || view === 'temp' || view === 'voltage' || view === 'current') renderer.mode = view;
if (params.get('rapido')) sim.settings.dtFrame = 1 / 6;
renderToolbar(app);
syncToolbar(app);
requestAnimationFrame(loop);
