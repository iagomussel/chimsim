import '../style.css';
import { molarMass, parseFormula } from '../chem/formula';
import { downloadJson, pickJson } from '../storage';
import { $, esc, num, toast } from '../ui/dom';
import { Chart, type Curve } from './chart';
import { DRUGS } from './drugs';
import {
  concentrationAt,
  dispositionRates,
  kaFromTmax,
  metrics,
  scaleParams,
  simulate,
  tmaxOral,
  type DrugDef,
  type PkResult,
  type Regimen,
} from './model';

const KEY = 'chimsim.pk.v1';
const PIN_COLORS = ['#a78bfa', '#f472b6', '#facc15', '#4ade80', '#fb923c'];

function loadUser(): DrugDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return (JSON.parse(raw) as DrugDef[]).filter(validDrug);
  } catch {
    /* armazenamento indisponível */
  }
  return [];
}
function saveUser() {
  try {
    localStorage.setItem(KEY, JSON.stringify(userDrugs));
  } catch {
    /* armazenamento indisponível */
  }
}
function validDrug(d: DrugDef): boolean {
  return (
    !!d && typeof d.key === 'string' && typeof d.name === 'string' &&
    [d.F, d.ka, d.V, d.CL].every((x) => typeof x === 'number' && isFinite(x) && x > 0) && d.F <= 1
  );
}

/** Compara os parâmetros (com tolerância, porque os campos mostram 4 dígitos). */
function sameParams(a: DrugDef, b: DrugDef): boolean {
  const close = (x = 0, y = 0) => Math.abs(x - y) <= 1e-3 * Math.max(Math.abs(x), Math.abs(y), 1e-12);
  return (
    a.name === b.name && (a.formula ?? '') === (b.formula ?? '') &&
    close(a.F, b.F) && close(a.ka, b.ka) && close(a.V, b.V) && close(a.CL, b.CL) &&
    close(a.Q, b.Q) && close(a.V2, b.V2) && close(a.refs?.[0]?.mgL, b.refs?.[0]?.mgL)
  );
}

let userDrugs = loadUser();
const allDrugs = () => [...DRUGS, ...userDrugs];

const state = {
  base: DRUGS[0] as DrugDef,
  drug: { ...DRUGS[0] } as DrugDef,
  reg: { dose: 1000, route: 'oral', tau: 6, count: 4, weight: 70, tEnd: 30 } as Regimen,
  unit: 'mg' as 'mg' | 'umol',
  log: false,
  pinned: [] as Curve[],
  hoverT: null as number | null,
  result: null as PkResult | null,
};

const DEFAULT_DOSE: Record<string, number> = { paracetamol: 1000, ibuprofen: 400, caffeine: 100 };

const canvas = $('#pk-canvas') as HTMLCanvasElement;
const chart = new Chart(canvas);

// ---------------------------------------------------------------- formulário

function field(id: string, label: string, value: number | string, opts: { step?: string; title?: string; type?: string } = {}) {
  return `<div class="field"><label class="normal-case" for="${id}" title="${esc(opts.title ?? '')}">${label}</label>
    <input id="${id}" class="inp" type="${opts.type ?? 'number'}" step="${opts.step ?? 'any'}" value="${esc(String(value))}" /></div>`;
}

function molar(d: DrugDef): number | null {
  if (!d.formula) return null;
  try {
    return molarMass(parseFormula(d.formula));
  } catch {
    return null;
  }
}

function renderForm() {
  const d = state.drug;
  const r = state.reg;
  const M = molar(d);
  const tmax = tmaxOral(d.ka, d.CL / d.V);
  const changed = !sameParams(d, state.base);
  $('#pk-form').innerHTML = `
    <h2 class="section-title">Remédio</h2>
    <div class="field">
      <select id="f-drug" class="inp">
        <optgroup label="Presets">${DRUGS.map((x) => `<option value="${x.key}">${esc(x.name)}</option>`).join('')}</optgroup>
        ${userDrugs.length ? `<optgroup label="Meus remédios">${userDrugs.map((x) => `<option value="${x.key}">${esc(x.name)}</option>`).join('')}</optgroup>` : ''}
      </select>
    </div>
    <div id="f-status" class="mb-2 flex items-center justify-between text-xs text-amber-400 ${changed ? '' : 'hidden'}"><span>Parâmetros alterados</span><button id="f-reset" class="btn btn-ghost">Restaurar</button></div>
    <div class="grid2">
      ${field('f-name', 'Nome', d.name, { type: 'text' })}
      ${field('f-formula', 'Fórmula', d.formula ?? '', { type: 'text', title: 'Opcional. Usada para µmol/L.' })}
    </div>
    <p id="f-M" class="mb-2 text-[11px] text-slate-400">${M ? `M = ${num(M, 5)} g/mol` : 'Sem fórmula válida: só mg/L.'}</p>

    <h2 class="section-title mt-2">Parâmetros (por kg)</h2>
    <div class="grid2">
      ${field('f-F', 'F (biodisponib., 0–1)', d.F, { title: 'Fração da dose oral que chega ao sangue' })}
      ${field('f-ka', 'ka (1/h)', +d.ka.toPrecision(4), { title: 'Constante de absorção' })}
      ${field('f-V', 'V (L/kg)', +d.V.toPrecision(4), { title: 'Volume de distribuição central' })}
      ${field('f-CL', 'CL (L/h/kg)', +d.CL.toPrecision(4), { title: 'Clearance (1 mL/min/kg = 0,06 L/h/kg)' })}
      ${field('f-Q', 'Q (L/h/kg)', d.Q ?? 0, { title: 'Clearance entre compartimentos. 0 = 1 compartimento' })}
      ${field('f-V2', 'V₂ (L/kg)', d.V2 ?? 0, { title: 'Volume periférico. 0 = 1 compartimento' })}
    </div>
    <div class="mb-3 flex items-end gap-2">
      ${field('f-tmax', 'Tmax desejado (h)', isFinite(tmax) ? +tmax.toPrecision(3) : '', { title: 'Calcula ka para dar este Tmax (1 compartimento)' })}
      <button id="f-fit" class="btn btn-ghost mb-2">Calcular ka</button>
    </div>
    <div class="grid2">
      ${field('f-refv', 'Linha ref. (mg/L)', d.refs?.[0]?.mgL ?? '', { title: 'Opcional' })}
      ${field('f-refl', 'Rótulo da linha', d.refs?.[0]?.label ?? '', { type: 'text' })}
    </div>

    <h2 class="section-title mt-2">Como tomar</h2>
    <div class="grid2">
      ${field('r-weight', 'Peso (kg)', r.weight)}
      ${field('r-dose', 'Dose (mg)', r.dose)}
      <div class="field"><label class="normal-case" for="r-route">Via</label>
        <select id="r-route" class="inp">
          <option value="oral"${r.route === 'oral' ? ' selected' : ''}>Oral</option>
          <option value="iv"${r.route === 'iv' ? ' selected' : ''}>Intravenosa (bolus)</option>
        </select></div>
      ${field('r-tau', 'Intervalo (h)', r.tau)}
      ${field('r-count', 'Nº de doses', r.count, { step: '1' })}
      ${field('r-tEnd', 'Simular até (h)', r.tEnd)}
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <button id="f-save" class="btn btn-success">Salvar como meu remédio</button>
      ${d.user ? '<button id="f-del" class="btn btn-danger">Excluir</button>' : ''}
      <button id="f-export" class="btn btn-ghost">Exportar</button>
      <button id="f-import" class="btn btn-ghost">Importar</button>
    </div>`;

  ($('#f-drug') as HTMLSelectElement).value = state.base.key;
  bindForm();
}

function refreshFormStatus() {
  const d = state.drug;
  const M = molar(d);
  $('#f-M').innerHTML = M ? `M = ${num(M, 5)} g/mol` : 'Sem fórmula válida: só mg/L.';
  $('#f-status').classList.toggle('hidden', sameParams(d, state.base));
  const tm = $('#f-tmax') as HTMLInputElement;
  if (document.activeElement !== tm) {
    const t = tmaxOral(d.ka, d.CL / d.V);
    tm.value = isFinite(t) ? String(+t.toPrecision(3)) : '';
  }
  if (state.unit === 'umol' && !M) state.unit = 'mg';
}

function numVal(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? parseFloat(el.value.replace(',', '.')) : NaN;
}
function strVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';
}

function readForm(): string | null {
  const d = state.drug;
  const F = numVal('f-F');
  const ka = numVal('f-ka');
  const V = numVal('f-V');
  const CL = numVal('f-CL');
  const Q = numVal('f-Q') || 0;
  const V2 = numVal('f-V2') || 0;
  if (!(F > 0 && F <= 1)) return 'F precisa estar entre 0 e 1';
  if (!(ka > 0 && V > 0 && CL > 0)) return 'ka, V e CL precisam ser maiores que zero';
  if (Q < 0 || V2 < 0) return 'Q e V₂ não podem ser negativos';
  Object.assign(d, { name: strVal('f-name') || 'Sem nome', formula: strVal('f-formula') || undefined, F, ka, V, CL, Q, V2 });
  const refv = numVal('f-refv');
  if (refv > 0) {
    const old = d.refs?.[0];
    d.refs = [{ label: strVal('f-refl') || 'Referência', mgL: refv, t: old && old.mgL === refv ? old.t : undefined }];
  } else d.refs = undefined;

  const r = state.reg;
  const reg = {
    weight: numVal('r-weight'),
    dose: numVal('r-dose'),
    tau: numVal('r-tau'),
    count: Math.round(numVal('r-count')),
    tEnd: numVal('r-tEnd'),
  };
  if (!(reg.weight > 0 && reg.dose > 0 && reg.tEnd > 0)) return 'Peso, dose e duração precisam ser maiores que zero';
  if (!(reg.count >= 1)) return 'Nº de doses precisa ser pelo menos 1';
  if (reg.count > 1 && !(reg.tau > 0)) return 'Intervalo precisa ser maior que zero';
  if (reg.tEnd > 24 * 60) return 'Simule no máximo 60 dias (1440 h)';
  Object.assign(r, reg, { route: (document.getElementById('r-route') as HTMLSelectElement).value as Regimen['route'] });
  return null;
}

function bindForm() {
  const form = $('#pk-form');
  form.querySelectorAll<HTMLInputElement>('input').forEach((el) => {
    el.addEventListener('input', () => {
      if (el.id === 'f-tmax') return;
      if (readForm()) return;
      update();
      refreshFormStatus();
    });
    el.addEventListener('change', () => {
      if (el.id === 'f-tmax') return;
      const err = readForm();
      if (err) toast(err);
    });
  });
  ($('#r-route') as HTMLSelectElement).onchange = () => {
    readForm();
    update();
  };
  ($('#f-drug') as HTMLSelectElement).onchange = (e) => selectDrug((e.target as HTMLSelectElement).value);
  $('#f-reset').onclick = () => selectDrug(state.base.key);
  $('#f-fit').onclick = () => {
    const err = readForm();
    if (err) return toast(err);
    const tmax = numVal('f-tmax');
    try {
      if (!(tmax > 0)) throw new Error('Tmax precisa ser maior que zero');
      state.drug.ka = kaFromTmax(tmax, state.drug.CL / state.drug.V);
    } catch (e) {
      return toast((e as Error).message);
    }
    renderForm();
    update();
  };
  $('#f-save').onclick = () => {
    const err = readForm();
    if (err) return toast(err);
    const d = state.drug;
    const existing = userDrugs.find((x) => x.name === d.name);
    const key = existing?.key ?? `u_${Date.now().toString(36)}`;
    const saved: DrugDef = { ...structuredClone(d), key, user: true };
    if (!d.user) {
      saved.estimated = [...(d.estimated ?? []), ...(sameParams(d, state.base) ? [] : ['valores editados pelo usuário'])];
    }
    userDrugs = existing ? userDrugs.map((x) => (x.key === key ? saved : x)) : [...userDrugs, saved];
    saveUser();
    toast(existing ? `"${d.name}" atualizado` : `"${d.name}" salvo`, 'ok');
    selectDrug(key);
  };
  const del = document.getElementById('f-del');
  if (del)
    del.onclick = () => {
      if (!confirm(`Excluir "${state.drug.name}"?`)) return;
      userDrugs = userDrugs.filter((x) => x.key !== state.base.key);
      saveUser();
      selectDrug(DRUGS[0].key);
    };
  $('#f-export').onclick = () => downloadJson('chimsim-remedios.json', userDrugs.length ? userDrugs : [state.drug]);
  $('#f-import').onclick = async () => {
    try {
      const data = await pickJson();
      const list = (Array.isArray(data) ? data : [data]) as DrugDef[];
      const ok = list.filter(validDrug).map((d) => ({ ...d, key: `u_${Math.random().toString(36).slice(2, 9)}`, user: true }));
      if (!ok.length) throw new Error('Nenhum remédio válido no arquivo');
      userDrugs = [...userDrugs, ...ok];
      saveUser();
      toast(`${ok.length} remédio(s) importado(s)`, 'ok');
      selectDrug(ok[0].key);
    } catch (e) {
      toast((e as Error).message);
    }
  };
}

function selectDrug(key: string) {
  const d = allDrugs().find((x) => x.key === key) ?? DRUGS[0];
  state.base = d;
  state.drug = structuredClone(d);
  if (DEFAULT_DOSE[d.key]) state.reg.dose = DEFAULT_DOSE[d.key];
  renderForm();
  update();
}

// ---------------------------------------------------------------- barra, métricas, fontes

function renderToolbar() {
  const M = molar(state.drug);
  $('#toolbar').innerHTML = `
    <span class="lbl">Unidade</span>
    <button class="btn ${state.unit === 'mg' ? 'on' : 'btn-ghost'}" data-u="mg">mg/L</button>
    <button class="btn ${state.unit === 'umol' ? 'on' : 'btn-ghost'}" data-u="umol" ${M ? '' : 'disabled title="Precisa de fórmula"'}>µmol/L</button>
    <span class="mx-1 h-4 w-px bg-slate-700"></span>
    <button id="t-log" class="btn ${state.log ? 'on' : 'btn-ghost'}">Escala log</button>
    <span class="mx-1 h-4 w-px bg-slate-700"></span>
    <button id="t-pin" class="btn btn-ghost" title="Mantém a curva atual para comparar">📌 Fixar curva</button>
    ${state.pinned.length ? `<button id="t-unpin" class="btn btn-ghost">Limpar fixadas (${state.pinned.length})</button>` : ''}`;
  document.querySelectorAll<HTMLButtonElement>('#toolbar [data-u]').forEach((b) => {
    b.onclick = () => {
      state.unit = b.dataset.u as 'mg' | 'umol';
      renderToolbar();
      renderMetrics();
      draw();
    };
  });
  $('#t-log').onclick = () => {
    state.log = !state.log;
    renderToolbar();
    draw();
  };
  $('#t-pin').onclick = () => {
    if (!state.result) return;
    const r = state.reg;
    state.pinned.push({
      r: state.result,
      color: PIN_COLORS[state.pinned.length % PIN_COLORS.length],
      label: `${state.drug.name} ${num(r.dose, 4)} mg ${r.route === 'iv' ? 'IV' : 'oral'}${r.count > 1 ? ` a cada ${num(r.tau, 3)} h ×${r.count}` : ''}`,
      f: 1,
      M: molar(state.drug),
    });
    if (state.pinned.length > 5) state.pinned.shift();
    renderToolbar();
    draw();
  };
  const unpin = document.getElementById('t-unpin');
  if (unpin)
    unpin.onclick = () => {
      state.pinned = [];
      renderToolbar();
      draw();
    };
}

function unitFactor(): { f: number; unit: string } {
  const M = molar(state.drug);
  if (state.unit === 'umol' && M) return { f: 1000 / M, unit: 'µmol/L' };
  return { f: 1, unit: 'mg/L' };
}

function renderMetrics() {
  const r = state.result!;
  const p = scaleParams(state.drug, state.reg.weight);
  const m = metrics(p, state.reg, r);
  const { f, unit } = unitFactor();
  const { alpha, beta } = dispositionRates(p);
  const two = p.Q > 0;
  const kv = (k: string, v: string, title = '') => `<div class="kv" title="${esc(title)}"><span>${k}</span><span class="font-mono">${v}</span></div>`;
  $('#pk-metrics').innerHTML = `
    <h2 class="section-title">Resultado</h2>
    <div class="card space-y-1">
      ${kv('Cmax', `${num(m.cmax * f, 3)} ${unit}`, 'Maior concentração no período')}
      ${kv('Tmax', `${num(m.tmax, 3)} h`)}
      ${kv('AUC 0–' + num(state.reg.tEnd, 4) + ' h', `${num(m.auc * f, 4)} ${unit}·h`)}
      ${kv('Meia-vida' + (two ? ' terminal' : ''), `${num(m.halfLife, 3)} h`)}
      ${two ? kv('Meia-vida distribuição', `${num(Math.LN2 / alpha, 3)} h`) : ''}
      ${kv('C no fim', `${num(m.cEnd * f, 3)} ${unit}`)}
    </div>
    ${
      isFinite(m.cssAvg)
        ? `<h2 class="section-title mt-4">Doses repetidas</h2>
    <div class="card space-y-1">
      ${kv('C média no equilíbrio', `${num(m.cssAvg * f, 3)} ${unit}`, 'F·Dose / (CL·τ)')}
      ${kv('Acumulação', `${num(m.accumulation, 3)}×`, '1 / (1 − e^(−k·τ))')}
      ${kv('~90 % do equilíbrio em', `${num((Math.log(10) / beta), 3)} h`, '≈ 3,3 meias-vidas')}
      ${kv('Dose diária', `${num((state.reg.dose * 24) / state.reg.tau, 4)} mg/dia`)}
    </div>`
        : ''
    }
    <h2 class="section-title mt-4">Para este peso</h2>
    <div class="card space-y-1">
      ${kv('V', `${num(p.V1, 3)} L`)}
      ${two ? kv('V₂', `${num(p.V2, 3)} L`) : ''}
      ${kv('CL', `${num(p.CL, 3)} L/h (${num((p.CL * 1000) / 60, 3)} mL/min)`)}
      ${kv('k eliminação', `${num(p.CL / p.V1, 3)} /h`)}
      ${kv('ka', `${num(p.ka, 3)} /h`)}
    </div>
    ${
      state.pinned.length
        ? `<h2 class="section-title mt-4">Curvas fixadas</h2><ul class="space-y-1 text-[11px]">${state.pinned
            .map((c) => `<li class="flex items-center gap-2"><span class="dot" style="background:${c.color}"></span>${esc(c.label)}</li>`)
            .join('')}</ul>`
        : ''
    }`;
}

function renderSources() {
  const d = state.drug;
  $('#pk-sources').innerHTML = `
    <h2 class="section-title">Sobre os dados</h2>
    ${d.note ? `<p class="mb-2 text-xs text-slate-300">${esc(d.note)}</p>` : ''}
    ${d.sources?.length ? `<p class="lbl mb-1">Fontes</p><ul class="mb-2 list-disc space-y-1 pl-4 text-[11px] text-slate-400">${d.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    ${d.estimated?.length ? `<p class="lbl mb-1 est-mark">Estimado / ajustado</p><ul class="mb-2 list-disc space-y-1 pl-4 text-[11px] text-amber-300/80">${d.estimated.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    ${!d.sources?.length && d.user ? '<p class="text-[11px] text-amber-300/80">Remédio do usuário: valores sem fonte conferida.</p>' : ''}
    <p class="mt-3 text-[11px] text-slate-500">Modelo: absorção e eliminação de 1ª ordem (linear), 1 ou 2 compartimentos, integrado por Runge–Kutta 4.
    Não inclui metabolismo saturável, interações, idade, doença de fígado/rim nem o efeito do remédio (farmacodinâmica).</p>`;
}

// ---------------------------------------------------------------- gráfico

function draw() {
  if (!state.result) return;
  const { f, unit } = unitFactor();
  const cur: Curve = { r: state.result, color: '#38bdf8', label: state.drug.name, f };
  chart.draw({
    curves: [...visiblePinned(), cur],
    refs: (state.drug.refs ?? []).map((r) => ({ label: r.label, v: r.mgL * f, t: r.t })),
    unit,
    log: state.log,
    tEnd: state.reg.tEnd,
    hoverT: state.hoverT,
  });
  renderHover();
}

/** Curvas fixadas na unidade atual. Em µmol/L, some a curva sem massa molar. */
function visiblePinned(): Curve[] {
  if (state.unit === 'mg') return state.pinned.map((c) => ({ ...c, f: 1 }));
  return state.pinned.filter((c) => c.M).map((c) => ({ ...c, f: 1000 / c.M! }));
}

function renderHover() {
  const box = $('#pk-hover');
  if (state.hoverT === null || !state.result || state.hoverT < 0 || state.hoverT > state.reg.tEnd) {
    box.classList.add('hidden');
    return;
  }
  const { f, unit } = unitFactor();
  const t = state.hoverT;
  const rows = [
    ...visiblePinned().map((c) => ({ color: c.color, label: c.label, v: concentrationAt(c.r, t) * c.f })),
    { color: '#38bdf8', label: 'atual', v: concentrationAt(state.result, t) * f },
  ];
  box.innerHTML = `t = ${num(t, 3)} h<br>${rows
    .map((r) => `<span style="color:${r.color}">●</span> ${num(r.v, 3)} ${unit} <span class="text-slate-500">${esc(r.label)}</span>`)
    .join('<br>')}`;
  const x = chart.xOf(t);
  const rect = canvas.getBoundingClientRect();
  const wrap = $('#canvas-wrap').getBoundingClientRect();
  const left = rect.left - wrap.left + x + 12;
  box.style.left = `${Math.min(left, wrap.width - 260)}px`;
  box.style.top = `${rect.top - wrap.top + 24}px`;
  box.classList.remove('hidden');
}

function fitCanvas() {
  const wrap = $('#canvas-wrap');
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth - 24;
  const h = wrap.clientHeight - 24;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  chart.dpr = dpr;
  draw();
}

canvas.style.cursor = 'crosshair';
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  state.hoverT = chart.tOf(e.clientX - rect.left);
  draw();
});
canvas.addEventListener('pointerleave', () => {
  state.hoverT = null;
  draw();
});
window.addEventListener('resize', fitCanvas);

function update() {
  const p = scaleParams(state.drug, state.reg.weight);
  state.result = simulate(p, state.reg);
  renderToolbar();
  renderMetrics();
  renderSources();
  draw();
}

// ?remedio=<chave>
const want = new URLSearchParams(location.search).get('remedio');
selectDrug(allDrugs().find((d) => d.key === want)?.key ?? DRUGS[0].key);
fitCanvas();
