import type { ViewMode } from '../render/renderer';
import type { App } from './app';
import { $ } from './dom';

const SPEEDS: [string, number][] = [
  ['0,1×', 1 / 600],
  ['1×', 1 / 60],
  ['10×', 1 / 6],
  ['60×', 1],
];

const VIEWS: [ViewMode, string][] = [
  ['material', 'Material'],
  ['temp', 'Temperatura'],
  ['voltage', 'Tensão'],
  ['current', 'Corrente'],
];

export function renderToolbar(app: App) {
  const root = $('#toolbar');
  const s = app.sim.settings;
  root.innerHTML = `
    <button id="tb-play" class="btn btn-primary w-20">${s.running ? '⏸ Pausar' : '▶ Rodar'}</button>
    <button id="tb-step" class="btn btn-ghost" title="Avança um quadro">⏭</button>
    <span class="lbl ml-2">Tempo</span>
    <div class="flex">${SPEEDS.map(([l, v]) => `<button data-speed="${v}" class="btn btn-ghost rounded-none first:rounded-l-md last:rounded-r-md ${Math.abs(s.dtFrame - v) < 1e-9 ? 'on' : ''}">${l}</button>`).join('')}</div>
    <span class="lbl ml-2">Vista</span>
    <div class="flex">${VIEWS.map(([m, l]) => `<button data-view="${m}" class="btn btn-ghost rounded-none first:rounded-l-md last:rounded-r-md ${app.renderer.mode === m ? 'on' : ''}">${l}</button>`).join('')}</div>
    <span class="lbl ml-2">Fonte</span>
    <input id="tb-volt" type="number" step="0.1" value="${s.sourceV}" class="inp w-20 py-1 text-xs"> <span class="text-slate-400">V</span>
    <span class="lbl ml-2">Pincel</span>
    <input id="tb-brush" type="range" min="0" max="15" value="${app.state.brushR}" class="w-20 accent-blue-500">
    <span class="lbl ml-2">T pintura</span>
    <input id="tb-temp" type="number" step="1" value="${app.state.brushT}" class="inp w-20 py-1 text-xs"> <span class="text-slate-400">K</span>
    <label class="ml-2 flex items-center gap-1 text-slate-300"><input id="tb-fix" type="checkbox" ${app.state.fixSolids ? 'checked' : ''}> fixar sólidos</label>
    <label class="flex items-center gap-1 text-slate-300" title="Gases saem pelo topo e o ar do topo é renovado"><input id="tb-open" type="checkbox" ${s.openTop ? 'checked' : ''}> topo aberto</label>
    <button id="tb-clear" class="btn btn-danger ml-auto">Limpar</button>`;

  $('#tb-play').onclick = () => {
    s.running = !s.running;
    renderToolbar(app);
  };
  $('#tb-step').onclick = () => {
    app.sim.step();
  };
  root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
    b.onclick = () => {
      s.dtFrame = Number(b.dataset.speed);
      renderToolbar(app);
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
    b.onclick = () => {
      app.renderer.mode = b.dataset.view as ViewMode;
      renderToolbar(app);
    };
  });
  ($('#tb-volt') as HTMLInputElement).onchange = (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (isFinite(v)) s.sourceV = v;
  };
  ($('#tb-brush') as HTMLInputElement).oninput = (e) => (app.state.brushR = Number((e.target as HTMLInputElement).value));
  ($('#tb-temp') as HTMLInputElement).onchange = (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (v > 0) app.state.brushT = v;
  };
  ($('#tb-fix') as HTMLInputElement).onchange = (e) => (app.state.fixSolids = (e.target as HTMLInputElement).checked);
  ($('#tb-open') as HTMLInputElement).onchange = (e) => (s.openTop = (e.target as HTMLInputElement).checked);
  $('#tb-clear').onclick = () => {
    app.sim.grid.clear();
    app.sim.time = 0;
    $('#legend').classList.add('hidden');
  };
}

/** Mantém o campo de tensão em sincronia quando uma cena muda a fonte. */
export function syncToolbar(app: App) {
  const inp = document.getElementById('tb-volt') as HTMLInputElement | null;
  if (inp && document.activeElement !== inp) inp.value = String(app.sim.settings.sourceV);
}
