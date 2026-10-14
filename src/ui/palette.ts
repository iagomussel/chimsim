import { formulaHtml } from '../chem/formula';
import { SCENES } from '../data/scenes';
import { AIR, WALL } from '../sim/registry';
import type { App, Tool } from './app';
import { $, esc } from './dom';

const CATEGORY_ORDER: [string, string][] = [
  ['metal', 'Metais e condutores'],
  ['composto', 'Compostos'],
  ['solução', 'Soluções'],
  ['gás', 'Gases'],
  ['usuário', 'Suas espécies'],
];

function toolKey(t: Tool) {
  return t.kind === 'species' ? `sp-${t.id}` : t.kind === 'term' ? `term${t.sign}` : t.kind;
}

export function renderPalette(app: App) {
  const root = $('#palette');
  const reg = app.sim.reg;
  const active = toolKey(app.state.tool);
  const btn = (key: string, color: string, title: string, sub: string) => `
    <button class="tool-btn ${key === active ? 'active' : ''}" data-tool="${key}">
      <span class="dot" style="background:${color}"></span>
      <span class="flex min-w-0 flex-col">
        <span class="truncate text-xs font-bold leading-tight">${title}</span>
        <span class="truncate text-[10px] text-slate-400">${sub}</span>
      </span>
    </button>`;

  let html = `<h2 class="section-title">Ferramentas</h2>`;
  html += btn('erase', '#0b1220', 'Borracha', 'vira ar ambiente');
  html += btn(`sp-${WALL}`, '#64748b', 'Parede', 'inerte, não funde');
  html += btn('heat', '#f97316', 'Aquecer', '+ energia na área');
  html += btn('cool', '#38bdf8', 'Resfriar', '− energia na área');
  html += btn('spark', '#facc15', 'Faísca', 'leva a área a 1500 K');
  html += btn('term1', '#ef4444', 'Terminal +', 'fonte DC, polo positivo');
  html += btn('term-1', '#3b82f6', 'Terminal −', 'fonte DC, polo negativo (0 V)');

  for (const [cat, label] of CATEGORY_ORDER) {
    const list = reg.species.filter((s) => s.def.category === cat && s.id !== AIR && s.id !== WALL);
    if (!list.length) continue;
    html += `<h2 class="section-title mt-4">${label}</h2>`;
    for (const s of list) {
      const ph = s.def.refPhase === 's' ? 0 : s.def.refPhase === 'l' ? 1 : 2;
      html += btn(`sp-${s.id}`, s.def.color[ph], esc(s.def.name), formulaHtml(esc(s.def.formula)));
    }
  }

  html += `<h2 class="section-title mt-4">Cenas prontas</h2><div class="flex flex-col gap-1">`;
  for (const sc of SCENES) {
    html += `<button class="btn btn-ghost justify-start text-left" data-scene="${sc.key}" title="${esc(sc.description)}">${esc(sc.name)}</button>`;
  }
  html += `</div>`;
  root.innerHTML = html;

  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.tool!;
      let t: Tool;
      if (k.startsWith('sp-')) t = { kind: 'species', id: Number(k.slice(3)) };
      else if (k === 'term1') t = { kind: 'term', sign: 1 };
      else if (k === 'term-1') t = { kind: 'term', sign: -1 };
      else t = { kind: k as 'erase' | 'heat' | 'cool' | 'spark' };
      app.selectTool(t);
      if (t.kind === 'species') {
        app.state.infoSpecies = t.id;
        app.showTab('info');
      }
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach((b) => {
    b.onclick = () => {
      const sc = SCENES.find((s) => s.key === b.dataset.scene)!;
      app.sim.grid.clear();
      app.sim.time = 0;
      sc.build(app.sim);
      app.sim.events.length = 0;
      app.refresh();
      const box = $('#legend');
      box.innerHTML = `<b class="text-slate-100">${esc(sc.name)}</b><br>${esc(sc.description)}`;
      box.classList.remove('hidden');
      box.style.maxWidth = '340px';
      box.style.whiteSpace = 'normal';
    };
  });
}
