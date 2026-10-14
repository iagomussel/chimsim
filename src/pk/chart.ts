import type { PkResult } from './model';

export interface Curve {
  r: PkResult;
  color: string;
  label: string;
  /** fator de unidade (mg/L → unidade exibida) */
  f: number;
  /** massa molar (g/mol), para converter curvas fixadas */
  M?: number | null;
}

export interface ChartOpts {
  curves: Curve[];
  refs: { label: string; v: number; t?: number }[];
  unit: string;
  log: boolean;
  tEnd: number;
  hoverT: number | null;
}

const PAD = { l: 64, r: 16, t: 16, b: 40 };

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

function fmt(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) < 0.01 || Math.abs(v) >= 1e5) return v.toExponential(0);
  return Number(v.toPrecision(3)).toLocaleString('pt-BR');
}

export class Chart {
  private ctx: CanvasRenderingContext2D;
  private yMin = 0;
  private yMax = 1;
  private opts: ChartOpts | null = null;
  /** pixels do canvas por pixel CSS */
  dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  get plotW() {
    return this.canvas.width / this.dpr - PAD.l - PAD.r;
  }
  get plotH() {
    return this.canvas.height / this.dpr - PAD.t - PAD.b;
  }

  xOf(t: number) {
    return PAD.l + (t / (this.opts?.tEnd || 1)) * this.plotW;
  }
  tOf(px: number) {
    return ((px - PAD.l) / this.plotW) * (this.opts?.tEnd || 1);
  }
  yOf(v: number) {
    const o = this.opts!;
    let f: number;
    if (o.log) f = (Math.log10(Math.max(v, this.yMin)) - Math.log10(this.yMin)) / (Math.log10(this.yMax) - Math.log10(this.yMin));
    else f = (v - this.yMin) / (this.yMax - this.yMin);
    return PAD.t + (1 - f) * this.plotH;
  }

  draw(o: ChartOpts) {
    this.opts = o;
    const { ctx, canvas } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width / this.dpr, canvas.height / this.dpr);

    let max = 0;
    for (const c of o.curves) for (const v of c.r.c) max = Math.max(max, v * c.f);
    for (const r of o.refs) if (r.v < max * 3) max = Math.max(max, r.v);
    if (max <= 0) max = 1;
    if (o.log) {
      this.yMax = 10 ** Math.ceil(Math.log10(max * 1.05));
      this.yMin = this.yMax / 1e4;
    } else {
      const step = niceStep(max * 1.08, 6);
      this.yMin = 0;
      this.yMax = Math.ceil((max * 1.08) / step) * step;
    }

    ctx.font = '11px ui-monospace, monospace';
    ctx.lineWidth = 1;
    // grade Y
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks: number[] = [];
    if (o.log) for (let v = this.yMin; v <= this.yMax * 1.0001; v *= 10) yTicks.push(v);
    else {
      const step = niceStep(this.yMax, 6);
      for (let v = 0; v <= this.yMax + step * 1e-6; v += step) yTicks.push(v);
    }
    for (const v of yTicks) {
      const y = this.yOf(v);
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + this.plotW, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(fmt(v), PAD.l - 6, y);
    }
    // grade X
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xs = niceStep(o.tEnd, 10);
    for (let t = 0; t <= o.tEnd + 1e-9; t += xs) {
      const x = this.xOf(t);
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, PAD.t + this.plotH);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(fmt(t), x, PAD.t + this.plotH + 6);
    }
    ctx.fillText('tempo (h)', PAD.l + this.plotW / 2, PAD.t + this.plotH + 22);
    ctx.save();
    ctx.translate(14, PAD.t + this.plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`concentração (${o.unit})`, 0, -6);
    ctx.restore();

    // referências
    for (const r of o.refs) {
      if (r.v > this.yMax || r.v < this.yMin) continue;
      const y = this.yOf(r.v);
      ctx.strokeStyle = '#f87171';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(PAD.l + this.plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (r.t !== undefined && r.t <= o.tEnd) {
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(this.xOf(r.t), y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fca5a5';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(r.label, PAD.l + this.plotW - 4, y - 3);
    }

    // curvas (a última é a atual, desenhada por cima)
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.l, PAD.t, this.plotW, this.plotH);
    ctx.clip();
    o.curves.forEach((c, ci) => {
      const cur = ci === o.curves.length - 1;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = cur ? 2.5 : 1.5;
      ctx.beginPath();
      const { t, c: v } = c.r;
      for (let i = 0; i < t.length; i++) {
        const x = this.xOf(t[i]);
        const y = this.yOf(v[i] * c.f);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.restore();

    // doses da curva atual
    const cur = o.curves[o.curves.length - 1];
    if (cur) {
      ctx.fillStyle = '#38bdf8';
      for (const d of cur.r.doses) {
        const x = this.xOf(d);
        const y = PAD.t + this.plotH;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 7);
        ctx.lineTo(x + 5, y + 7);
        ctx.fill();
      }
    }

    // eixo
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD.l + 0.5, PAD.t + 0.5, this.plotW, this.plotH);

    if (o.hoverT !== null && o.hoverT >= 0 && o.hoverT <= o.tEnd) {
      const x = this.xOf(o.hoverT);
      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, PAD.t + this.plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
