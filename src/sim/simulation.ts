import { PRESET_REACTIONS } from '../data/reactions';
import { PRESET_SPECIES } from '../data/species';
import { Circuit } from './electric';
import { stepElectrochem } from './electrochem';
import { Grid } from './grid';
import { stepMovement } from './movement';
import { stepReactions, type ReactionEvent } from './reactions';
import { Registry } from './registry';
import { addHeat, stepConduction, stepPhases, stepRadiation } from './thermal';

export interface SimSettings {
  running: boolean;
  /** segundos simulados por quadro */
  dtFrame: number;
  sourceV: number;
  openTop: boolean;
}

export class Simulation {
  /** aresta da célula (m) */
  readonly dx = 1e-3;
  reg: Registry;
  grid: Grid;
  circuit: Circuit;
  time = 0;
  settings: SimSettings = { running: true, dtFrame: 1 / 60, sourceV: 12, openTop: true };
  events: ReactionEvent[] = [];

  constructor(w: number, h: number) {
    this.reg = new Registry(this.dx ** 3);
    for (const s of PRESET_SPECIES) this.reg.addSpecies(s);
    for (const r of PRESET_REACTIONS) this.reg.addReaction(r);
    this.grid = new Grid(w, h, this.reg);
    this.circuit = new Circuit(this.grid);
  }

  step() {
    const g = this.grid;
    const dt = this.settings.dtFrame;
    stepMovement(g, this.settings.openTop);
    // passos curtos precisam de menos subdivisões na condução
    const sub = dt <= 1 / 50 ? 2 : 4;
    for (let k = 0; k < sub; k++) {
      stepConduction(g, dt / sub, this.dx);
      stepRadiation(g, dt / sub, this.dx);
      stepPhases(g);
    }
    stepReactions(g, dt, (e) => {
      this.events.push(e);
      if (this.events.length > 200) this.events.shift();
    });
    const res = this.circuit.step(this.settings.sourceV, dt, this.dx, (i, E) => addHeat(g, i, E));
    if (res.faces.length) stepElectrochem(g, res.faces, dt);
    stepPhases(g);
    this.time += dt;
  }
}
