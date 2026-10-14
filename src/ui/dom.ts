export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function toast(msg: string, kind: 'error' | 'ok' = 'error') {
  const box = $('#toast');
  const div = document.createElement('div');
  div.className = `mb-2 rounded px-5 py-2.5 text-sm font-semibold shadow-2xl ${kind === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`;
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

const PREFIX: [number, string][] = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

/** Formata com prefixo SI: 0.0123 A → "12,3 mA" */
export function si(v: number, unit: string, digits = 3): string {
  if (!isFinite(v)) return `— ${unit}`;
  if (v === 0) return `0 ${unit}`;
  const a = Math.abs(v);
  for (const [f, p] of PREFIX) {
    if (a >= f * 0.9995) return `${(v / f).toPrecision(digits).replace('.', ',')} ${p}${unit}`;
  }
  return `${v.toExponential(2)} ${unit}`;
}

export function num(v: number, digits = 4): string {
  if (!isFinite(v)) return '—';
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6)) return v.toExponential(2).replace('.', ',');
  return Number(v.toPrecision(digits)).toLocaleString('pt-BR');
}

export function temp(T: number): string {
  return `${num(T, 4)} K (${num(T - 273.15, 4)} °C)`;
}
