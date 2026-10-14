import { ELEMENT_BY_SYMBOL } from '../data/elements';

export type AtomCounts = Record<string, number>;

/**
 * Lê uma fórmula química e devolve a contagem de átomos.
 * Aceita parênteses/colchetes e hidratos com "·" ou ".": "Fe2O3", "Ca(OH)2", "NaCl(H2O)10", "CuSO4·5H2O".
 */
export function parseFormula(formula: string): AtomCounts {
  const parts = formula.replace(/\s+/g, '').split(/[·.*]/);
  const total: AtomCounts = {};
  for (const part of parts) {
    if (!part) continue;
    const m = /^(\d+)(.*)$/.exec(part);
    const mult = m ? parseInt(m[1], 10) : 1;
    const body = m ? m[2] : part;
    const counts = parseGroup(body);
    for (const [el, c] of Object.entries(counts)) total[el] = (total[el] ?? 0) + c * mult;
  }
  if (Object.keys(total).length === 0) throw new Error(`Fórmula vazia: "${formula}"`);
  return total;
}

function parseGroup(s: string): AtomCounts {
  const stack: AtomCounts[] = [{}];
  let i = 0;
  const readNum = (): number => {
    let j = i;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
    const n = j > i ? parseInt(s.slice(i, j), 10) : 1;
    i = j;
    return n;
  };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(' || ch === '[') {
      stack.push({});
      i++;
    } else if (ch === ')' || ch === ']') {
      i++;
      const n = readNum();
      const group = stack.pop();
      if (!group || stack.length === 0) throw new Error(`Parênteses desbalanceados em "${s}"`);
      const top = stack[stack.length - 1];
      for (const [el, c] of Object.entries(group)) top[el] = (top[el] ?? 0) + c * n;
    } else if (ch >= 'A' && ch <= 'Z') {
      let sym = ch;
      i++;
      while (i < s.length && s[i] >= 'a' && s[i] <= 'z') sym += s[i++];
      if (!ELEMENT_BY_SYMBOL[sym]) throw new Error(`Elemento desconhecido: "${sym}"`);
      const n = readNum();
      const top = stack[stack.length - 1];
      top[sym] = (top[sym] ?? 0) + n;
    } else {
      throw new Error(`Caractere inválido "${ch}" em "${s}"`);
    }
  }
  if (stack.length !== 1) throw new Error(`Parênteses desbalanceados em "${s}"`);
  return stack[0];
}

/** Massa molar em g/mol. */
export function molarMass(formula: string | AtomCounts): number {
  const counts = typeof formula === 'string' ? parseFormula(formula) : formula;
  let m = 0;
  for (const [el, c] of Object.entries(counts)) m += ELEMENT_BY_SYMBOL[el].mass * c;
  return m;
}

export function atomTotal(counts: AtomCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** Fórmula em HTML com subscritos. */
export function formulaHtml(formula: string): string {
  return formula.replace(/(\d+)/g, (d, _g, off: number) => {
    const prev = formula[off - 1];
    // número no início de um termo de hidrato é coeficiente, não subscrito
    if (off === 0 || prev === '·' || prev === '.') return d;
    return `<sub>${d}</sub>`;
  });
}
