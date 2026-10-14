import { describe, expect, it } from 'vitest';
import { DRUGS } from '../src/pk/drugs';
import { bateman, kaFromTmax, metrics, scaleParams, simulate, tmaxOral, type Regimen } from '../src/pk/model';

const base: Regimen = { dose: 500, route: 'oral', tau: 6, count: 1, weight: 70, tEnd: 24 };
const drug = (k: string) => DRUGS.find((d) => d.key === k)!;

describe('farmacocinética', () => {
  it('RK4 bate com a equação de Bateman (1 dose oral)', () => {
    const p = scaleParams(drug('paracetamol'), 70);
    const r = simulate(p, base);
    for (const t of [0.25, 1, 3, 10]) {
      const i = r.t.findIndex((x) => x >= t);
      expect(r.c[i]).toBeCloseTo(bateman(p, base.dose, r.t[i]), 6);
    }
  });

  it('doses repetidas = soma das doses isoladas (linearidade)', () => {
    const p = scaleParams(drug('caffeine'), 70);
    const reg = { ...base, count: 4, tau: 6 };
    const r = simulate(p, reg);
    const t = 20;
    const i = r.t.findIndex((x) => x >= t);
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += bateman(p, reg.dose, r.t[i] - k * 6);
    expect(r.c[i]).toBeCloseTo(sum, 6);
  });

  it('AUC total = F·Dose/CL', () => {
    const p = scaleParams(drug('paracetamol'), 70);
    const r = simulate(p, { ...base, tEnd: 60 });
    expect(metrics(p, { ...base, tEnd: 60 }, r).auc).toBeCloseTo((p.F * base.dose) / p.CL, 2);
  });

  it('IV bolus: C0 = Dose/V e meia-vida ln2·V/CL', () => {
    const p = scaleParams(drug('caffeine'), 70);
    const reg: Regimen = { ...base, route: 'iv' };
    const r = simulate(p, reg);
    expect(Math.max(...r.c)).toBeCloseTo(base.dose / p.V1, 6);
    expect(metrics(p, reg, r).halfLife).toBeCloseTo(4.1, 6);
  });

  it('kaFromTmax inverte tmaxOral', () => {
    const ka = kaFromTmax(0.79, 0.38);
    expect(tmaxOral(ka, 0.38)).toBeCloseTo(0.79, 6);
  });

  it('estado de equilíbrio: média em um intervalo ≈ F·D/(CL·τ)', () => {
    const p = scaleParams(drug('ibuprofen'), 70);
    const reg: Regimen = { ...base, dose: 400, count: 30, tau: 6, tEnd: 180 };
    const r = simulate(p, reg);
    const m = metrics(p, reg, r);
    let auc = 0;
    for (let i = 1; i < r.t.length; i++) {
      if (r.t[i - 1] >= 168 && r.t[i] <= 174) auc += ((r.c[i] + r.c[i - 1]) / 2) * (r.t[i] - r.t[i - 1]);
    }
    expect(auc / 6).toBeCloseTo(m.cssAvg, 2);
  });

  it('modelo de 2 compartimentos conserva AUC = F·D/CL', () => {
    const p = scaleParams({ ...drug('caffeine'), Q: 0.5, V2: 1 }, 70);
    const reg = { ...base, tEnd: 150 };
    const r = simulate(p, reg);
    const m = metrics(p, reg, r);
    expect(m.auc).toBeCloseTo((p.F * base.dose) / p.CL, 1);
    expect(m.halfLife).toBeGreaterThan(Math.LN2 / (p.CL / p.V1));
  });

  it('ibuprofeno 200 mg, 71,4 kg: compara com a bula (Cmax 19, Tmax 0,79, AUC 64)', () => {
    const p = scaleParams(drug('ibuprofen'), 200 / 2.8);
    const reg: Regimen = { ...base, dose: 200, tEnd: 48 };
    const m = metrics(p, reg, simulate(p, reg));
    expect(m.tmax).toBeCloseTo(0.79, 1);
    expect(m.auc).toBeGreaterThan(64 * 0.85);
    expect(m.auc).toBeLessThan(64 * 1.15);
    expect(m.cmax).toBeGreaterThan(19 * 0.75);
    expect(m.cmax).toBeLessThan(19 * 1.25);
  });
});
