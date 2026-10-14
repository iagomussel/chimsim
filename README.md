# ChimSim — simulador químico e elétrico

Simulador em grid (estilo "falling sand") com termoquímica de tabela, calor, mudança de fase, reações por Arrhenius/ΔG, circuito elétrico e eletrólise.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes (química, circuito, energia, cenas)
npm run build    # checagem de tipos + build de produção
```

Farmacocinética: `http://localhost:5173/pk.html` (ou o botão 💊 no simulador). `?remedio=paracetamol|ibuprofen|caffeine`.

URL com cena e vista: `?cena=thermite&vista=temp` (cenas: `electrolysis`, `brine`, `methane`, `thermite`, `sodium`, `wire`, `calcination`, `salt`; vistas: `material`, `temp`, `voltage`, `current`; `rapido=1` = 10×).

## Modelo

| Parte | Como funciona | Arquivo |
|---|---|---|
| Escala | 1 célula = 1 mm³ (fatia 2D de 1 mm). Pressão fixa 1 atm. | `src/sim/simulation.ts` |
| Estado | uma espécie por célula: fase, T, mol, calor latente. Ar = reservatório com fração de O₂ própria. | `src/sim/grid.ts` |
| Termodinâmica | H(T) e S(T) por fase a partir de ΔHf°, S°, Cp, ΔHfus, ΔHvap. ΔH/ΔS/ΔG por lei de Hess. | `src/chem/thermo.ts` |
| Calor | condução de Fourier (média harmônica de k), radiação de Stefan–Boltzmann nas superfícies, calor latente nas transições. | `src/sim/thermal.ts` |
| Movimento | por fase e densidade; gás usa ρ = PM/RT (ar quente sobe). | `src/sim/movement.ts` |
| Reações | Arrhenius k = A·e^(−Ea/RT), só se ΔG(T) < 0, taxa × (1 − e^(ΔG/RT)). Estequiometria em mol; entalpia conservada. | `src/sim/reactions.ts` |
| Circuito | ∇·(σ∇V) = 0 por gradiente conjugado + IC(0). σ(T) de metais. Efeito Joule. | `src/sim/electric.ts` |
| Eletrólise | interface metal/eletrólito só conduz acima de (ΔG/zF + η); lei de Faraday. | `src/sim/electrochem.ts` |

## Dados

`src/data/species.ts` — NBS Tables 1982 / NIST WebBook e CRC Handbook. Campos que não vêm de tabela estão em `estimated` e aparecem com `*` na aba Detalhes.
`src/data/reactions.ts` — ΔH/ΔG são calculados, não digitados. Ea e T de ignição são valores **efetivos** (modelo de um passo calibrado pela temperatura de autoignição), não o mecanismo real.

## Limitações conhecidas

- Cp constante por fase e sem dissociação de H₂O: chamas e termita passam da temperatura adiabática real (a dissociação do CO₂ já limita parte disso). A chama de metano fica em ~2300–3600 K, mas células isoladas chegam a ~9000 K por alguns quadros. A energia total se conserva.
- Uma espécie por célula: misturas e soluções são espécies próprias (ex.: salmoura = `NaCl(H2O)10`).
- Reações com no máximo 2 reagentes (célula com célula).
- Gás com mais mol do que cabe a 1 atm se espalha nas células de ar vizinhas; não há pressão real.
- Movimento é visual (um passo por quadro), não tem escala de tempo física.
- O solver elétrico faz no máximo 15 iterações por quadro depois do primeiro; mudanças grandes levam alguns quadros para convergir (erro ~µA).
- Eletroquímica: só reações definidas como eletrólise (pilha galvânica ainda não existe).

## Farmacocinética (`pk.html`)

Módulo separado, **só educativo**. Não usa o grid e não prevê efeito no corpo a partir da fórmula.

| Parte | Como funciona | Arquivo |
|---|---|---|
| Modelo | intestino →ka→ central (V) →CL→ fora; periférico opcional (Q, V₂). 1ª ordem, linear. | `src/pk/model.ts` |
| Integração | Runge–Kutta 4 (passo ≤ 0,01 h), doses exatamente nos instantes certos. Testado contra a equação de Bateman. | `src/pk/model.ts` |
| Saídas | Cmax, Tmax, AUC, meia-vida, C média no equilíbrio F·D/(CL·τ), acumulação. Unidade mg/L ou µmol/L (pela fórmula). | `src/pk/main.ts` |
| Presets | paracetamol, ibuprofeno, cafeína. Fontes e campos estimados aparecem na tela. | `src/pk/drugs.ts` |

`ka` não costuma ser publicado: é calculado para o modelo dar o Tmax relatado.

Comparação com dados medidos:
- Ibuprofeno 200 mg, 71 kg: modelo Cmax 17,3 mg/L, AUC 61 mg·h/L; bula 19 mg/L e 64 mg·h/L.
- Paracetamol 1 g, 70 kg: modelo Cmax ≈ 10 mg/L; estudos medem 18–21 mg/L. O modelo de 1 compartimento não acerta o pico.

Não modela: metabolismo saturável (overdose), interações, idade, doença de fígado/rim, farmacodinâmica.

## Próximos passos

- Pilha galvânica (FEM entre metais diferentes).
