import { describe, expect, it } from 'vitest';
import { molarMass, parseFormula } from '../src/chem/formula';
import {
  checkBalance,
  decompositionVoltage,
  equilibriumTemperatures,
  molarEnthalpy,
  reactionThermo,
} from '../src/chem/thermo';
import { PRESET_SPECIES } from '../src/data/species';
import { PRESET_REACTIONS } from '../src/data/reactions';

const lookup = (k: string) => PRESET_SPECIES.find((s) => s.key === k);
const rx = (k: string) => PRESET_REACTIONS.find((r) => r.key === k)!;

describe('fórmulas', () => {
  it('lê fórmulas com parênteses e hidratos', () => {
    expect(parseFormula('Ca(OH)2')).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula('CuSO4·5H2O')).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(parseFormula('NaCl(H2O)10')).toEqual({ Na: 1, Cl: 1, H: 20, O: 10 });
  });
  it('massa molar', () => {
    expect(molarMass('H2O')).toBeCloseTo(18.015, 2);
    expect(molarMass('Fe2O3')).toBeCloseTo(159.69, 1);
  });
  it('rejeita elemento inválido', () => {
    expect(() => parseFormula('Xx2')).toThrow();
  });
});

describe('termoquímica', () => {
  it('todas as reações pré-definidas estão balanceadas', () => {
    for (const r of PRESET_REACTIONS) {
      const b = checkBalance(r, lookup);
      expect(b.ok, `${r.key}: ${JSON.stringify(b.diff)} ${b.error ?? ''}`).toBe(true);
    }
  });
  it('detecta reação desbalanceada', () => {
    const b = checkBalance(
      { reactants: [{ sp: 'H2', coef: 1 }, { sp: 'O2', coef: 1 }], products: [{ sp: 'H2O', coef: 1 }] },
      lookup,
    );
    expect(b.ok).toBe(false);
    expect(b.diff).toEqual({ O: -1 });
  });
  it('ΔH combustão do metano (água líquida) ≈ −890 kJ', () => {
    const r = rx('ch4_comb');
    const t = reactionThermo(r, 298.15, lookup, (term) => (term.sp === 'H2O' ? 1 : undefined));
    expect(t.dH / 1000).toBeCloseTo(-890.3, 0);
  });
  it('ΔH termita ≈ −851,5 kJ', () => {
    expect(reactionThermo(rx('thermite'), 298.15, lookup).dH / 1000).toBeCloseTo(-851.5, 0);
  });
  it('entalpia do vapor de água a 298 K ≈ −241,8 kJ/mol', () => {
    expect(molarEnthalpy(lookup('H2O')!, 2, 298.15) / 1000).toBeCloseTo(-241.8, 0);
  });
  it('calcinação: ΔG = 0 perto de 1110 K', () => {
    const Ts = equilibriumTemperatures(rx('calcination'), lookup);
    expect(Ts.some((T) => T > 1050 && T < 1170)).toBe(true);
  });
  it('salmoura ferve perto de 381 K', () => {
    const Ts = equilibriumTemperatures(rx('brine_evap'), lookup);
    expect(Ts.some((T) => T > 375 && T < 390)).toBe(true);
  });
  it('tensão de decomposição da água ≈ 1,23 V', () => {
    expect(decompositionVoltage(rx('water_electrolysis'), 298.15, lookup)).toBeCloseTo(1.229, 2);
  });
  it('tensão da cloro-soda ≈ 2,19 V', () => {
    expect(decompositionVoltage(rx('brine_electrolysis'), 298.15, lookup)).toBeCloseTo(2.19, 1);
  });
  it('Na + água ≈ −184 kJ por mol de Na', () => {
    expect(reactionThermo(rx('na_water'), 298.15, lookup).dH / 2000).toBeCloseTo(-184, -1);
  });
});
