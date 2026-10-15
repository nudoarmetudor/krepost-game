// Draws a run onto a canvas. Reads the run, never changes it.

import { WORLD } from './data.js';
import { fmt } from './format.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.scale = 1;
    this.dpr = 1;
    this.time = 0;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.scale = Math.min(this.w, this.h) / 2 / (WORLD.spawnRadius + 2);
  }

  // screen point -> world point
  toWorld(px, py) {
    return { x: (px - this.w / 2) / this.scale, y: (py - this.h / 2) / this.scale };
  }

  draw(run, realDt) {
    const ctx = this.ctx;
    this.time += realDt;
    const s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background(run);
    ctx.save();
    let ox = 0;
    let oy = 0;
    if (run.shake > 0) {
      const k = run.shake * 6;
      ox = (Math.random() - 0.5) * k;
      oy = (Math.random() - 0.5) * k;
    }
    ctx.translate(this.w / 2 + ox, this.h / 2 + oy);
    ctx.scale(s, s);

    this.fields(run);
    this.ground(run);
    this.enemies(run);
    this.tower(run);
    this.orbs(run);
    this.shots(run);
    this.effects(run);
    this.bubble(run);
    ctx.restore();
  }

  background(run) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, 0, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
    const danger = run && run.S ? 1 - Math.max(0, run.hp) / run.S.maxHp : 0;
    g.addColorStop(0, '#16203a');
    g.addColorStop(1, danger > 0.75 ? '#1a0a14' : '#0a0f1d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  fields(run) {
    const ctx = this.ctx;
    const S = run.S;
    // distance rings
    ctx.lineWidth = 1 / this.scale;
    ctx.strokeStyle = 'rgba(120,150,220,0.07)';
    for (let r = 10; r <= WORLD.spawnRadius; r += 10) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    // range
    ctx.save();
    ctx.setLineDash([1.2, 1.2]);
    ctx.strokeStyle = 'rgba(255,181,71,0.35)';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, S.range, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // time field
    if (run.uw.timefield && run.uw.timefield.active > 0) {
      ctx.fillStyle = 'rgba(102,255,209,0.07)';
      ctx.beginPath();
      ctx.arc(0, 0, S.range, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(102,255,209,0.5)';
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }
    // searchlight
    const sl = S.uw.searchlight;
    if (sl) {
      const half = (sl.angle * Math.PI) / 360;
      for (let b = 0; b < sl.beams; b++) {
        const a = run.searchAngle + (b * TAU) / sl.beams;
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, S.range + 4);
        g.addColorStop(0, 'rgba(255,243,168,0.28)');
        g.addColorStop(1, 'rgba(255,243,168,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, S.range + 4, a - half, a + half);
        ctx.closePath();
        ctx.fill();
      }
    }
    // venom pools
    for (const p of run.pools) {
      const k = Math.min(1, p.t / 1.2);
      ctx.fillStyle = `rgba(157,255,94,${0.18 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(157,255,94,${0.45 * k})`;
      ctx.lineWidth = 0.2;
      ctx.stroke();
    }
    // singularity
    if (run.singularity) {
      const sg = run.singularity;
      const k = Math.min(1, sg.t / 1, (sg.ttl - sg.t) / 0.5 + 0.2);
      const g = ctx.createRadialGradient(sg.x, sg.y, 0, sg.x, sg.y, sg.size * 1.4);
      g.addColorStop(0, `rgba(0,0,0,${0.95 * k})`);
      g.addColorStop(0.45, `rgba(60,20,120,${0.7 * k})`);
      g.addColorStop(1, 'rgba(169,139,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sg.x, sg.y, sg.size * 1.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(169,139,255,${0.6 * k})`;
      ctx.lineWidth = 0.25;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const a0 = this.time * (2 + i) + i * 2;
        ctx.arc(sg.x, sg.y, sg.size * (0.5 + i * 0.25), a0, a0 + 2);
        ctx.stroke();
      }
    }
    // annihilation rings
    if (run.waves) {
      for (const w of run.waves) {
        ctx.strokeStyle = 'rgba(255,95,122,0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, w.r, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,95,122,0.25)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  ground(run) {
    const ctx = this.ctx;
    for (const m of run.mines) {
      ctx.fillStyle = m.big ? '#ff9b5e' : '#ffb547';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.big ? 0.8 : 0.55, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,181,71,0.35)';
      ctx.lineWidth = 0.15;
      ctx.beginPath();
      ctx.arc(m.x, m.y, (m.big ? 1.5 : 1.1) + Math.sin(this.time * 6) * 0.2, 0, TAU);
      ctx.stroke();
    }
    for (const p of run.packages) {
      const bob = Math.sin(p.t * 8) * 0.3;
      ctx.fillStyle = '#7cf5a8';
      ctx.fillRect(p.x - 1, p.y - 1 + bob, 2, 2);
      ctx.fillStyle = '#0d1220';
      ctx.fillRect(p.x - 0.2, p.y - 0.7 + bob, 0.4, 1.4);
      ctx.fillRect(p.x - 0.7, p.y - 0.2 + bob, 1.4, 0.4);
    }
  }

  enemies(run) {
    const ctx = this.ctx;
    for (const e of run.enemies) {
      const d = e.def;
      ctx.save();
      ctx.translate(e.x, e.y);
      const flash = e.hitFlash > 0;
      ctx.fillStyle = flash ? '#ffffff' : d.color;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 0.25;
      const r = e.r;
      ctx.rotate(e.angle);
      switch (d.shape) {
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(-r * 0.8, r * 0.8);
          ctx.lineTo(-r * 0.8, -r * 0.8);
          ctx.closePath();
          ctx.fill();
          break;
        case 'diamond':
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(0, r * 0.75);
          ctx.lineTo(-r, 0);
          ctx.lineTo(0, -r * 0.75);
          ctx.closePath();
          ctx.fill();
          break;
        case 'hex':
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          break;
        case 'ring':
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.fill();
          ctx.rotate(-e.angle);
          ctx.strokeStyle = 'rgba(111,231,255,0.25)';
          ctx.setLineDash([0.8, 0.8]);
          ctx.beginPath();
          ctx.arc(0, 0, d.aura, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        case 'boss': {
          ctx.rotate(this.time * 0.4);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            const rr = i % 2 ? r * 0.72 : r;
            ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#2a0a0a';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.35, 0, TAU);
          ctx.fill();
          break;
        }
        default:
          ctx.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
      }
      ctx.restore();
      if (e.shielded) {
        ctx.strokeStyle = 'rgba(111,231,255,0.7)';
        ctx.lineWidth = 0.2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 0.5, 0, TAU);
        ctx.stroke();
      }
      if ((e.boss || e.type === 'tank' || e.hp < e.maxHp) && e.hp > 0) {
        const w = Math.max(2.4, e.r * 2.2);
        const y = e.y - e.r - 1;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, y, w, 0.6);
        ctx.fillStyle = e.boss ? '#ff3d3d' : '#7cf5a8';
        ctx.fillRect(e.x - w / 2, y, (w * Math.max(0, e.hp)) / e.maxHp, 0.6);
      }
    }
    // enemy bolts
    ctx.fillStyle = '#ff6b6b';
    for (const s of run.enemyShots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 0.7, 0, TAU);
      ctx.fill();
    }
  }

  tower(run) {
    const ctx = this.ctx;
    const R = WORLD.towerRadius;
    const S = run.S;
    const hpFrac = Math.max(0, run.hp) / S.maxHp;
    // glow
    const glow = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 3);
    const demon = run.demonT > 0;
    glow.addColorStop(0, demon ? 'rgba(255,60,60,0.5)' : 'rgba(255,181,71,0.35)');
    glow.addColorStop(1, 'rgba(255,181,71,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, R * 3, 0, TAU);
    ctx.fill();

    // walls: an octagon with merlons
    ctx.fillStyle = run.towerFlash > 0 ? '#ffd0c0' : '#2b3550';
    ctx.strokeStyle = '#ffb547';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + Math.PI / 16;
      const rr = i % 2 ? R * 0.86 : R;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // keep
    ctx.fillStyle = '#1a2136';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.58, 0, TAU);
    ctx.fill();
    // health arc
    ctx.strokeStyle = hpFrac > 0.5 ? '#7cf5a8' : hpFrac > 0.25 ? '#ffd35a' : '#ff5f7a';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.58, -Math.PI / 2, -Math.PI / 2 + TAU * hpFrac);
    ctx.stroke();
    // turret
    ctx.save();
    ctx.rotate(run.aim);
    ctx.fillStyle = '#ffb547';
    ctx.fillRect(0, -0.45, R * 1.05, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.36, 0, TAU);
    ctx.fill();
    ctx.restore();
    // shield
    if (run.shieldReady) {
      ctx.strokeStyle = 'rgba(111,231,255,0.7)';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, R + 1.2, 0, TAU);
      ctx.stroke();
    }
  }

  orbs(run) {
    const S = run.S;
    if (!S.orbs) return;
    const ctx = this.ctx;
    const R = run.orbRadius();
    ctx.strokeStyle = 'rgba(90,176,255,0.12)';
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < S.orbs; i++) {
      const a = run.orbAngle + (i * TAU) / S.orbs;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 2.2);
      g.addColorStop(0, 'rgba(160,215,255,1)');
      g.addColorStop(0.4, 'rgba(90,176,255,0.8)');
      g.addColorStop(1, 'rgba(90,176,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }
  }

  shots(run) {
    const ctx = this.ctx;
    for (const s of run.shots) {
      if (s.missile) {
        const t = s.target;
        const a = t ? Math.atan2(t.y - s.y, t.x - s.x) : 0;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(a);
        ctx.fillStyle = '#ffb547';
        ctx.beginPath();
        ctx.moveTo(1.5, 0);
        ctx.lineTo(-1.2, 0.7);
        ctx.lineTo(-1.2, -0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,120,60,0.6)';
        ctx.fillRect(-2.6, -0.3, 1.4, 0.6);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = s.big ? '#ff9bf2' : s.crit ? '#ffd35a' : '#fff1d6';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.big ? 1.1 : s.crit ? 0.85 : 0.65, 0, TAU);
      ctx.fill();
    }
  }

  effects(run) {
    const ctx = this.ctx;
    for (const f of run.fx) {
      const k = 1 - f.age / f.ttl;
      switch (f.type) {
        case 'burst': {
          ctx.fillStyle = f.color;
          ctx.globalAlpha = k;
          const n = f.n;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + (f.x * 7 + f.y * 3) % 1;
            const d = f.r + (1 - k) * (f.n > 10 ? 9 : 4) * (0.6 + ((i * 37) % 10) / 20);
            const sz = 0.25 + 0.3 * k;
            ctx.fillRect(f.x + Math.cos(a) * d - sz / 2, f.y + Math.sin(a) * d - sz / 2, sz, sz);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'ring':
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = 0.4 + k * 0.4;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - k * k), 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'bolt':
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = 0.35;
          ctx.beginPath();
          f.pts.forEach(([x, y], i) => {
            const j = i && i < f.pts.length ? (Math.sin(f.age * 90 + i) * 0.6) : 0;
            ctx[i ? 'lineTo' : 'moveTo'](x + j, y - j);
          });
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'beam':
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = f.w * k;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(f.x, f.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'num':
        case 'text': {
          const px = 1 / this.scale;
          ctx.save();
          ctx.translate(f.x, f.y - (1 - k) * 3);
          ctx.scale(px, px);
          ctx.globalAlpha = Math.min(1, k * 1.5);
          ctx.font = `700 ${f.type === 'num' ? 12 : 13}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = f.color;
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 3;
          const txt = f.type === 'num' ? fmt(f.text) : f.text;
          ctx.strokeText(txt, 0, 0);
          ctx.fillText(txt, 0, 0);
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }
  }

  bubble(run) {
    const b = run.gemBubble;
    if (!b) return;
    const ctx = this.ctx;
    const bob = Math.sin(this.time * 3) * 0.6;
    const r = 2 + Math.sin(this.time * 5) * 0.2;
    ctx.save();
    ctx.translate(b.x, b.y + bob);
    ctx.fillStyle = 'rgba(111,231,255,0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, r + 1.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#6fe7ff';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
