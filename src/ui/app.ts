import type { Renderer } from '../render/renderer';
import type { Simulation } from '../sim/simulation';
import type { UserData } from '../storage';

export type Tool =
  | { kind: 'species'; id: number }
  | { kind: 'erase' }
  | { kind: 'heat' }
  | { kind: 'cool' }
  | { kind: 'spark' }
  | { kind: 'term'; sign: 1 | -1 };

export interface AppState {
  tool: Tool;
  brushR: number;
  /** temperatura de pintura (K) */
  brushT: number;
  fixSolids: boolean;
  /** espécie mostrada na aba Detalhes */
  infoSpecies: number;
}

export interface App {
  sim: Simulation;
  renderer: Renderer;
  state: AppState;
  user: UserData;
  /** redesenha paleta, construtores e detalhes */
  refresh(): void;
  selectTool(t: Tool): void;
  showTab(tab: 'compound' | 'reaction' | 'info'): void;
}
