import { atomTotal, formulaHtml, molarMass, parseFormula } from '../chem/formula';
import {
  checkBalance,
  decompositionVoltage,
  equilibriumTemperatures,
  estimators,
  reactionThermo,
  type ReactionDef,
  type ReactionTerm,
} from '../chem/thermo';
import { ELEMENTS } from '../data/elements';
import { PHASE_NAMES, type SpeciesDef } from '../data/species';
import { AIR } from '../sim/registry';
import { downloadJson, pickJson, saveUserData } from '../storage';
import type { App } from './app';
import { $, esc, num, toast } from './dom';

// ---------------------------------------------------------------- Composto

interface FieldDef {
  id: string;
  label: string;
  unit: string;
  /** valor padrão vazio = precisa ser preenchido ou estimado */
  def?: number;
}

const FIELDS: FieldDef[] = [
  { id: 'Hf', label: 'ΔHf°', unit: 'kJ/mol' },
  { id: 'S', label: 'S°', unit: 'J/mol·K' },
  { id: 'cpS', label: 'Cp sólido', unit: 'J/mol·K' },
  { id: 'cpL', label: 'Cp líquido', unit: 'J/mol·K' },
  { id: 'cpG', label: 'Cp gás', unit: 'J/mol·K' },
  { id: 'Tm', label: 'T fusão', unit: 'K' },
  { id: 'Tb', label: 'T ebulição', unit: 'K' },
  { id: 'Hfus', label: 'ΔH fusão', unit: 'kJ/mol' },
  { id: 'Hvap', label: 'ΔH vaporização', unit: 'kJ/mol' },
  { id: 'rhoS', label: 'ρ sólido', unit: 'kg/m³' },
  { id: 'rhoL', label: 'ρ líquido', unit: 'kg/m³' },
  { id: 'k', label: 'k térmica', unit: 'W/m·K' },
  { id: 'sigS', label: 'σ sólido', unit: 'S/m', def: 0 },
  { id: 'sigL', label: 'σ líquido', unit: 'S/m', def: 0 },
];

export function renderCompoundBuilder(app: App) {
  const root = $('#tab-compound');
  const elOpts = ELEMENTS.map((e) => `<option value="${e.symbol}">${e.symbol} — ${esc(e.name)}</option>`).join('');
  root.innerHTML = `
    <div class="field"><label>Nome</label><input id="c-name" class="inp" placeholder="Ex: Etanol"></div>
    <div class="field"><label>Fórmula</label>
      <input id="c-formula" class="inp font-mono" placeholder="Ex: C2H5OH, Ca(OH)2, CuSO4·5H2O">
      <div class="flex gap-1">
        <select id="c-el" class="inp flex-1 text-xs">${elOpts}</select>
        <input id="c-elq" type="number" min="1" value="1" class="inp w-14 text-center text-xs">
        <button id="c-eladd" class="btn btn-ghost">+</button>
      </div>
      <div id="c-mm" class="text-xs text-slate-400">—</div>
    </div>
    <div class="grid2">
      <div class="field"><label>Fase a 25 °C</label>
        <select id="c-ref" class="inp"><option value="s">sólido</option><option value="l">líquido</option><option value="g">gás</option></select></div>
      <div class="field"><label>Cor</label><input id="c-color" type="color" value="#22d3ee" class="inp h-9 p-1"></div>
    </div>
    <div class="mb-2 flex flex-wrap gap-3 text-xs text-slate-300">
      <label class="flex items-center gap-1"><input id="c-rigid" type="checkbox"> sólido fixo</label>
      <label class="flex items-center gap-1"><input id="c-metal" type="checkbox"> condutor eletrônico</label>
    </div>
    <div class="card mb-2">
      <div class="lbl mb-2">Dados termodinâmicos (25 °C, 1 atm)</div>
      <div class="grid2">
        ${FIELDS.map(
          (f) => `<div class="field"><label class="normal-case" title="${f.unit}">${f.label} <span class="normal-case text-slate-500">${f.unit}</span></label>
          <input id="c-${f.id}" type="number" step="any" class="inp" ${f.def !== undefined ? `value="${f.def}"` : ''}></div>`,
        ).join('')}
      </div>
      <button id="c-est" class="btn btn-ghost mt-1 w-full">Estimar campos vazios (Kopp, Trouton, Richards)</button>
      <p class="mt-2 text-[10px] leading-snug text-slate-500">ΔHf° e S° não têm boa estimativa: use valores de tabela (NIST WebBook, CRC). Estimativas: Cp sólido por Kopp–Neumann, ΔHvap por Trouton, ΔHfus por Richards; Cp gás, k e ρ são só ordem de grandeza. Campos estimados ficam com borda âmbar.</p>
    </div>
    <button id="c-save" class="btn btn-success w-full py-2">+ Salvar espécie</button>
    <div class="mt-3 flex gap-1">
      <button id="c-export" class="btn btn-ghost flex-1">Exportar JSON</button>
      <button id="c-import" class="btn btn-ghost flex-1">Importar JSON</button>
    </div>`;

  const val = (id: string) => ($(`#c-${id}`) as HTMLInputElement).value;
  const estimated = new Set<string>();
  const formulaInput = $('#c-formula') as HTMLInputElement;
  const updateMM = () => {
    const out = $('#c-mm');
    try {
      const f = parseFormula(formulaInput.value);
      out.innerHTML = `M = <b class="text-slate-100">${num(molarMass(f), 6)} g/mol</b> · ${atomTotal(f)} átomos · ${formulaHtml(esc(formulaInput.value))}`;
    } catch (e) {
      out.textContent = formulaInput.value ? (e as Error).message : '—';
    }
  };
  formulaInput.oninput = updateMM;
  $('#c-eladd').onclick = () => {
    const el = val('el');
    const q = parseInt(val('elq'), 10) || 1;
    formulaInput.value += el + (q > 1 ? q : '');
    updateMM();
  };
  for (const f of FIELDS) {
    $(`#c-${f.id}`).addEventListener('input', (e) => {
      estimated.delete(f.id);
      (e.target as HTMLElement).classList.remove('est');
    });
  }

  $('#c-est').onclick = () => {
    let atoms = 2;
    let counts: Record<string, number> = {};
    try {
      counts = parseFormula(formulaInput.value);
      atoms = atomTotal(counts);
    } catch {
      return toast('Escreva uma fórmula válida primeiro');
    }
    const set = (id: string, v: number) => {
      const inp = $(`#c-${id}`) as HTMLInputElement;
      if (inp.value !== '') return;
      inp.value = String(Number(v.toPrecision(4)));
      inp.classList.add('est');
      estimated.add(id);
    };
    const Tm = Number(val('Tm')) || 0;
    const Tb = Number(val('Tb')) || 0;
    set('cpS', estimators.cpSolid(counts));
    set('cpL', estimators.cpSolid(counts) * 1.3);
    set('cpG', 29.1 + 8.3 * Math.max(0, atoms - 2));
    if (Tm) set('Hfus', estimators.hfus(Tm, atoms));
    if (Tb) set('Hvap', estimators.hvap(Tb));
    set('k', 1);
    const rhoS = Number(val('rhoS'));
    if (rhoS) set('rhoL', rhoS * 0.9);
    else set('rhoS', 1500), set('rhoL', 1350);
    toast('Estimativas preenchidas — confira com dados reais', 'ok');
  };

  $('#c-save').onclick = () => {
    const name = val('name').trim();
    if (!name) return toast('Dê um nome para a espécie');
    try {
      parseFormula(val('formula'));
    } catch (e) {
      return toast((e as Error).message);
    }
    const nums: Record<string, number> = {};
    for (const f of FIELDS) {
      const v = val(f.id);
      if (v === '' || !isFinite(Number(v))) return toast(`Preencha "${f.label}" ou use Estimar`);
      nums[f.id] = Number(v);
    }
    if (nums.Tm >= nums.Tb) return toast('T fusão precisa ser menor que T ebulição');
    if (nums.rhoS <= 0 || nums.rhoL <= 0) return toast('Densidade precisa ser positiva');
    const color = val('color');
    const key = 'u_' + name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString(36);
    const def: SpeciesDef = {
      key,
      name,
      formula: val('formula').replace(/\s+/g, ''),
      category: 'usuário',
      refPhase: val('ref') as 's' | 'l' | 'g',
      Hf: nums.Hf,
      S: nums.S,
      cp: [nums.cpS, nums.cpL, nums.cpG],
      Tm: nums.Tm,
      Tb: nums.Tb,
      Hfus: nums.Hfus,
      Hvap: nums.Hvap,
      rho: [nums.rhoS, nums.rhoL],
      k: [nums.k, nums.k * 0.5, 0.025],
      sigma: [nums.sigS, nums.sigL, 0],
      color: [color, color, color],
      rigid: ($('#c-rigid') as HTMLInputElement).checked,
      metal: ($('#c-metal') as HTMLInputElement).checked,
      estimated: [...estimated],
      source: 'Definida pelo usuário',
    };
    const rt = app.sim.reg.addSpecies(def);
    app.user.species.push(def);
    saveUserData(app.user);
    app.selectTool({ kind: 'species', id: rt.id });
    app.state.infoSpecies = rt.id;
    app.refresh();
    toast(`${name} adicionada à paleta`, 'ok');
  };

  $('#c-export').onclick = () => {
    downloadJson('chimsim-dados.json', app.user);
  };
  $('#c-import').onclick = async () => {
    try {
      const d = (await pickJson()) as { species?: SpeciesDef[]; reactions?: ReactionDef[] };
      for (const s of d.species ?? []) {
        app.sim.reg.addSpecies(s);
        if (!app.user.species.some((x) => x.key === s.key)) app.user.species.push(s);
      }
      for (const r of d.reactions ?? []) {
        try {
          app.sim.reg.addReaction(r);
          if (!app.user.reactions.some((x) => x.key === r.key)) app.user.reactions.push(r);
        } catch (e) {
          toast(`${r.name}: ${(e as Error).message}`);
        }
      }
      saveUserData(app.user);
      app.refresh();
      toast('Dados importados', 'ok');
    } catch (e) {
      toast(`Falha ao importar: ${(e as Error).message}`);
    }
  };
}

// ---------------------------------------------------------------- Reação

interface RxForm {
  reactants: ReactionTerm[];
  products: ReactionTerm[];
  name: string;
  Ea: number;
  Tign: number;
}

const form: RxForm = {
  reactants: [{ sp: 'H2', coef: 2 }, { sp: 'O2', coef: 1 }],
  products: [{ sp: 'H2O', coef: 2 }],
  name: '',
  Ea: 100,
  Tign: 700,
};

export function renderReactionBuilder(app: App) {
  const root = $('#tab-reaction');
  const reg = app.sim.reg;
  const opts = (sel: string) =>
    reg.species
      .filter((s) => s.id !== AIR && !s.inert)
      .map((s) => `<option value="${s.def.key}" ${s.def.key === sel ? 'selected' : ''}>${esc(s.def.name)} (${esc(s.def.formula)})</option>`)
      .join('');
  const row = (side: 'reactants' | 'products', t: ReactionTerm, k: number) => `
    <div class="mb-1 flex gap-1">
      <input type="number" min="1" step="1" value="${t.coef}" data-side="${side}" data-k="${k}" data-f="coef" class="inp w-12 px-1 text-center text-xs">
      <select data-side="${side}" data-k="${k}" data-f="sp" class="inp min-w-0 flex-1 text-xs">${opts(t.sp)}</select>
      ${side === 'reactants' ? `<select data-side="${side}" data-k="${k}" data-f="phase" class="inp w-14 px-1 text-xs">
        <option value="">fase</option>${['s', 'l', 'g'].map((p, i) => `<option value="${p}" ${t.phase === p ? 'selected' : ''}>${PHASE_NAMES[i].slice(0, 3)}</option>`).join('')}
      </select>` : ''}
      <button data-del="${side}" data-k="${k}" class="btn btn-ghost px-2">×</button>
    </div>`;

  root.innerHTML = `
    <div class="field"><label>Nome</label><input id="r-name" class="inp" value="${esc(form.name)}" placeholder="Ex: Combustão do etanol"></div>
    <div class="lbl">Reagentes (até 2 — reagem célula com célula)</div>
    ${form.reactants.map((t, k) => row('reactants', t, k)).join('')}
    ${form.reactants.length < 2 ? `<button data-add="reactants" class="btn btn-ghost mb-2 w-full">+ reagente</button>` : ''}
    <div class="lbl mt-2">Produtos (até 3)</div>
    ${form.products.map((t, k) => row('products', t, k)).join('')}
    ${form.products.length < 3 ? `<button data-add="products" class="btn btn-ghost mb-2 w-full">+ produto</button>` : ''}
    <div class="grid2 mt-2">
      <div class="field"><label>Eₐ efetiva <span class="normal-case text-slate-500">kJ/mol</span></label><input id="r-Ea" type="number" class="inp" value="${form.Ea}"></div>
      <div class="field"><label>T de ignição <span class="normal-case text-slate-500">K</span></label><input id="r-Tign" type="number" class="inp" value="${form.Tign}"></div>
    </div>
    <div id="r-calc" class="card mb-2 text-xs"></div>
    <button id="r-save" class="btn btn-success w-full py-2">+ Adicionar reação</button>
    <h2 class="section-title mt-4">Reações ativas</h2>
    <div id="r-list" class="space-y-1"></div>`;

  const calc = () => {
    const out = $('#r-calc');
    const lookup = reg.lookup;
    try {
      const bal = checkBalance(form, lookup);
      if (bal.error) throw new Error(bal.error);
      const t298 = reactionThermo(form, 298.15, lookup);
      const eq = equilibriumTemperatures(form, lookup);
      out.innerHTML = `
        <div class="kv"><span>Balanceamento</span><span class="${bal.ok ? 'text-emerald-400' : 'text-red-400'}">${
          bal.ok ? 'OK' : Object.entries(bal.diff).map(([e, d]) => `${e} ${d > 0 ? '+' : ''}${d}`).join(', ')
        }</span></div>
        <div class="kv"><span>ΔH° (298 K)</span><span>${num(t298.dH / 1000, 5)} kJ</span></div>
        <div class="kv"><span>ΔS° (298 K)</span><span>${num(t298.dS, 5)} J/K</span></div>
        <div class="kv"><span>ΔG° (298 K)</span><span class="${t298.dG < 0 ? 'text-emerald-400' : 'text-amber-400'}">${num(t298.dG / 1000, 5)} kJ</span></div>
        <div class="kv"><span>ΔG = 0 em</span><span>${eq.length ? eq.map((T) => `${num(T, 4)} K`).join(', ') : '—'}</span></div>
        <p class="mt-1 text-[10px] text-slate-500">Fases de equilíbrio a cada T. ${t298.dH < 0 ? 'Exotérmica' : 'Endotérmica'} a 298 K.</p>`;
    } catch (e) {
      out.innerHTML = `<span class="text-red-400">${esc((e as Error).message)}</span>`;
    }
  };
  calc();

  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-side]').forEach((el) => {
    el.onchange = () => {
      const t = form[el.dataset.side as 'reactants' | 'products'][Number(el.dataset.k)];
      const f = el.dataset.f!;
      if (f === 'coef') t.coef = Math.max(1, Math.round(Number(el.value)) || 1);
      else if (f === 'sp') t.sp = el.value;
      else t.phase = (el.value || undefined) as ReactionTerm['phase'];
      calc();
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => {
    b.onclick = () => {
      form[b.dataset.add as 'reactants' | 'products'].push({ sp: 'H2O', coef: 1 });
      renderReactionBuilder(app);
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
    b.onclick = () => {
      const list = form[b.dataset.del as 'reactants' | 'products'];
      if (list.length > 1) list.splice(Number(b.dataset.k), 1);
      renderReactionBuilder(app);
    };
  });
  ($('#r-name') as HTMLInputElement).oninput = (e) => (form.name = (e.target as HTMLInputElement).value);
  ($('#r-Ea') as HTMLInputElement).oninput = (e) => (form.Ea = Number((e.target as HTMLInputElement).value));
  ($('#r-Tign') as HTMLInputElement).oninput = (e) => (form.Tign = Number((e.target as HTMLInputElement).value));

  $('#r-save').onclick = () => {
    if (!form.name.trim()) return toast('Dê um nome para a reação');
    if (!(form.Ea >= 0) || !(form.Tign > 0)) return toast('Eₐ ≥ 0 e T de ignição > 0');
    const def: ReactionDef = {
      key: 'u_rx_' + Date.now().toString(36),
      name: form.name.trim(),
      reactants: form.reactants.map((t) => ({ ...t })),
      products: form.products.map((t) => ({ ...t })),
      Ea: form.Ea,
      Tign: form.Tign,
      user: true,
      estimated: ['Ea', 'Tign'],
    };
    try {
      reg.addReaction(def);
    } catch (e) {
      return toast((e as Error).message);
    }
    app.user.reactions.push(def);
    saveUserData(app.user);
    form.name = '';
    app.refresh();
    toast('Reação adicionada', 'ok');
  };

  const list = $('#r-list');
  list.innerHTML = reg.reactions
    .map((r) => {
      const t = reactionThermo(r.def, 298.15, reg.lookup);
      const eq = (ts: ReactionTerm[]) => ts.map((x) => `${x.coef > 1 ? x.coef : ''}${formulaHtml(esc(reg.lookup(x.sp)?.formula ?? x.sp))}`).join(' + ');
      const extra = r.def.electro
        ? `E mín ≈ ${num(decompositionVoltage(r.def, 298.15, reg.lookup) + r.def.electro.overpotential, 3)} V`
        : `Eₐ ${r.def.Ea} kJ · ign. ${r.def.Tign} K`;
      return `<div class="card p-2 text-[11px]">
        <div class="flex justify-between gap-1"><b class="text-slate-100">${esc(r.def.name)}</b>
          ${r.def.user ? `<button data-rm="${r.def.key}" class="text-red-400 hover:text-red-300">remover</button>` : ''}</div>
        <div class="font-mono text-slate-300">${eq(r.def.reactants)} → ${eq(r.def.products)}</div>
        <div class="text-slate-500">ΔH° ${num(t.dH / 1000, 4)} kJ · ${extra}${r.def.electro ? ' · eletroquímica' : ''}</div>
      </div>`;
    })
    .join('');
  list.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach((b) => {
    b.onclick = () => {
      reg.removeReaction(b.dataset.rm!);
      app.user.reactions = app.user.reactions.filter((r) => r.key !== b.dataset.rm);
      saveUserData(app.user);
      app.refresh();
    };
  });
}

// ---------------------------------------------------------------- Detalhes

export function renderInfo(app: App) {
  const root = $('#tab-info');
  const s = app.sim.reg.species[app.state.infoSpecies];
  if (!s) {
    root.innerHTML = '<p class="text-xs text-slate-500">Selecione uma espécie na paleta.</p>';
    return;
  }
  const d = s.def;
  const est = new Set(d.estimated ?? []);
  const mark = (k: string) => (est.has(k) ? ' <span class="est-mark" title="estimado">*</span>' : '');
  const kv = (label: string, v: string, k = '') => `<div class="kv"><span>${label}</span><span>${v}${mark(k)}</span></div>`;
  const used = app.sim.reg.reactions.filter(
    (r) => r.def.reactants.some((t) => t.sp === d.key) || r.def.products.some((t) => t.sp === d.key),
  );
  root.innerHTML = `
    <div class="card space-y-1">
      <div class="flex items-center gap-2"><span class="dot" style="background:${d.color[0]}"></span><span class="dot" style="background:${d.color[1]}"></span><span class="dot" style="background:${d.color[2]}"></span>
        <b class="text-sm">${esc(d.name)}</b></div>
      <div class="font-mono text-sm">${formulaHtml(esc(d.formula))}</div>
      ${kv('Massa molar', `${num(s.M * 1000, 6)} g/mol`)}
      ${kv('Fase a 25 °C', PHASE_NAMES[['s', 'l', 'g'].indexOf(d.refPhase)])}
      ${kv('ΔHf°', `${num(d.Hf, 6)} kJ/mol`, 'Hf')}
      ${kv('S°', `${num(d.S, 5)} J/mol·K`, 'S')}
      ${kv('Cp s / l / g', d.cp.map((c) => num(c, 4)).join(' / ') + ' J/mol·K', 'cp')}
      ${kv('T fusão', d.Tm > 1e8 ? '—' : `${num(d.Tm, 5)} K`, 'Tm')}
      ${kv('T ebulição', d.Tb > 1e8 ? '— (ver reações)' : `${num(d.Tb, 5)} K`, 'Tb')}
      ${kv('ΔH fusão / vap.', `${num(d.Hfus, 4)} / ${num(d.Hvap, 4)} kJ/mol`, 'Hfus')}
      ${kv('ρ sólido / líquido', `${num(d.rho[0], 4)} / ${num(d.rho[1], 4)} kg/m³`, 'rho')}
      ${kv('k térmica s/l/g', d.k.map((c) => num(c, 3)).join(' / ') + ' W/m·K', 'k')}
      ${kv('σ s/l/g', d.sigma.map((c) => num(c, 3)).join(' / ') + ' S/m', 'sigma')}
      ${d.alpha ? kv('α resistividade', `${num(d.alpha, 3)} 1/K`, 'alpha') : ''}
      ${kv('Mol por célula (1 mm³)', `${num(s.nCell[0], 3)} (s) · ${num(s.nCell[1], 3)} (l)`)}
    </div>
    ${est.size ? `<p class="mt-2 text-[10px] text-amber-400">* valor estimado, não vem de tabela.</p>` : ''}
    <p class="mt-2 text-[10px] text-slate-500">Fonte: ${esc(d.source ?? '—')}</p>
    ${used.length ? `<h2 class="section-title mt-4">Participa de</h2><ul class="text-xs text-slate-300">${used.map((r) => `<li>• ${esc(r.def.name)}</li>`).join('')}</ul>` : ''}
  `;
}
