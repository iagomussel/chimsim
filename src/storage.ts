import type { ReactionDef } from './chem/thermo';
import type { SpeciesDef } from './data/species';

const KEY = 'chimsim.user.v1';

export interface UserData {
  species: SpeciesDef[];
  reactions: ReactionDef[];
}

export function loadUserData(): UserData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as UserData;
      return { species: d.species ?? [], reactions: d.reactions ?? [] };
    }
  } catch {
    /* armazenamento indisponível */
  }
  return { species: [], reactions: [] };
}

export function saveUserData(d: UserData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* armazenamento indisponível */
  }
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickJson(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('Nenhum arquivo'));
      try {
        resolve(JSON.parse(await f.text()));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
