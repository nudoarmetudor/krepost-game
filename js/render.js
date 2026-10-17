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
    this.bg = null;
  }

  // The still part of the backdrop, drawn once per size.
  backdrop() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, 0, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    g.addColorStop(0, '#18244a');
    g.addColorStop(0.55, '#0f1730');
    g.addColorStop(1, '#070b16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    // a faint grid of dots, denser near the walls
    const step = Math.max(14, this.scale * 4);
    ctx.fillStyle = 'rgba(150,175,255,0.10)';
    for (let x = (this.w / 2) % step; x < this.w; x += step) {
      for (let y = (this.h / 2) % step; y < this.h; y += step) {
        const d = Math.hypot(x - this.w / 2, y - this.h / 2) / (this.scale * WORLD.spawnRadius);
        if (d > 1.05) continue;
        ctx.globalAlpha = 0.35 + 0.65 * (1 - d);
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
    ctx.globalAlpha = 1;
    // the spawn edge
    ctx.strokeStyle = 'rgba(255,95,122,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.w / 2, this.h / 2, WORLD.spawnRadius * this.scale, 0, TAU);
    ctx.stroke();
    return c;
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
    this.background();
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
    this.vignette(run);
  }

  background() {
    const ctx = this.ctx;
    if (!this.bg) this.bg = this.backdrop();
    ctx.drawImage(this.bg, 0, 0, this.w, this.h);
  }

  // Red edges that breathe when the walls are low.
  vignette(run) {
    const frac = Math.max(0, run.hp) / run.S.maxHp;
    if (frac > 0.35 || run.over) return;
    const ctx = this.ctx;
    const k = (1 - frac / 0.35) * (0.55 + 0.45 * Math.sin(this.time * (frac < 0.15 ? 9 : 5)) ** 2);
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    g.addColorStop(0, 'rgba(255,40,70,0)');
    g.addColorStop(1, `rgba(255,40,70,${0.42 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  fields(run) {
    const ctx = this.ctx;
    const S = run.S;
    // distance rings
    ctx.lineWidth = 1 / this.scale;
    ctx.strokeStyle = 'rgba(120,150,220,0.06)';
    for (let r = 10; r < WORLD.spawnRadius; r += 10) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    // range
    const rg = ctx.createRadialGradient(0, 0, S.range * 0.6, 0, 0, S.range);
    rg.addColorStop(0, 'rgba(255,181,71,0)');
    rg.addColorStop(1, 'rgba(255,181,71,0.05)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, S.range, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.setLineDash([1.2, 1.4]);
    ctx.lineDashOffset = -this.time * 1.5;
    ctx.strokeStyle = 'rgba(255,181,71,0.4)';
    ctx.lineWidth = 0.22;
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
    // soft halo under every enemy, one pass
    for (const e of run.enemies) {
      ctx.globalAlpha = e.boss ? 0.22 : 0.13;
      ctx.fillStyle = e.def.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.75, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const e of run.enemies) {
      const d = e.def;
      const r = e.r;
      // fade in at the spawn edge
      const edge = (WORLD.spawnRadius - Math.hypot(e.x, e.y)) / 5;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, edge + 0.15));
      ctx.save();
      ctx.translate(e.x, e.y);
      if (d.shape === 'ring') {
        ctx.strokeStyle = 'rgba(111,231,255,0.22)';
        ctx.lineWidth = 0.22;
        ctx.setLineDash([0.8, 0.8]);
        ctx.lineDashOffset = this.time * 2;
        ctx.beginPath();
        ctx.arc(0, 0, d.aura, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.rotate(d.shape === 'boss' ? e.angle + this.time * 0.4 : d.shape === 'ring' || d.shape === 'hex' ? e.angle + this.time * 0.8 : e.angle);
      shapePath(ctx, d.shape, r);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : d.color;
      ctx.fill();
      ctx.lineWidth = 0.28;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.stroke();
      // darker heart, so every shape reads as a solid body
      ctx.scale(0.5, 0.5);
      shapePath(ctx, d.shape, r);
      ctx.fillStyle = d.shape === 'boss' ? 'rgba(40,0,0,0.75)' : 'rgba(5,10,25,0.32)';
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      if (e.shielded) {
        ctx.strokeStyle = 'rgba(111,231,255,0.75)';
        ctx.lineWidth = 0.22;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 0.55, 0, TAU);
        ctx.stroke();
      }
      if (!e.boss && e.hp < e.maxHp && e.hp > 0) {
        const w = Math.max(2.4, e.r * 2.1);
        const y = e.y - e.r - 1.1;
        const f = Math.max(0, e.hp) / e.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - w / 2 - 0.1, y - 0.1, w + 0.2, 0.7);
        ctx.fillStyle = f > 0.5 ? '#7cf5a8' : f > 0.25 ? '#ffd35a' : '#ff5f7a';
        ctx.fillRect(e.x - w / 2, y, w * f, 0.5);
      }
    }
    // enemy bolts
    for (const s of run.enemyShots) {
      ctx.fillStyle = 'rgba(255,107,107,0.25)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff8b8b';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 0.6, 0, TAU);
      ctx.fill();
    }
  }

  tower(run) {
    const ctx = this.ctx;
    const R = WORLD.towerRadius;
    const S = run.S;
    const hpFrac = Math.max(0, run.hp) / S.maxHp;
    const demon = run.demonT > 0;
    const pulse = Math.max(0, run.fireT || 0) / 0.12;
    // glow
    const glow = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 3.2);
    glow.addColorStop(0, demon ? 'rgba(255,60,60,0.55)' : `rgba(255,181,71,${0.3 + 0.12 * pulse})`);
    glow.addColorStop(1, 'rgba(255,181,71,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, R * 3.2, 0, TAU);
    ctx.fill();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(0.5, 0.7, R * 1.02, 0, TAU);
    ctx.fill();

    // walls: a star fort with merlons, lit from the top left
    const wall = ctx.createLinearGradient(-R, -R, R, R);
    if (run.towerFlash > 0) {
      wall.addColorStop(0, '#ffe2d6');
      wall.addColorStop(1, '#ff9b86');
    } else {
      wall.addColorStop(0, '#46557e');
      wall.addColorStop(1, '#222b45');
    }
    ctx.fillStyle = wall;
    ctx.strokeStyle = demon ? '#ff5f5f' : '#ffb547';
    ctx.lineWidth = 0.32;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + Math.PI / 16;
      const rr = i % 2 ? R * 0.86 : R;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // inner wall ring
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.74, 0, TAU);
    ctx.stroke();
    // courtyard
    ctx.fillStyle = '#141a2e';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.6, 0, TAU);
    ctx.fill();
    // health ring
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.42;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.6, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = hpFrac > 0.5 ? '#7cf5a8' : hpFrac > 0.25 ? '#ffd35a' : '#ff5f7a';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.6, -Math.PI / 2, -Math.PI / 2 + TAU * hpFrac);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // the core every shot leaves from: swells and brightens as it fires
    const cr = R * (0.3 + 0.07 * pulse);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * 1.6);
    const hot = demon ? '255,120,120' : '255,214,140';
    core.addColorStop(0, '#fffaf0');
    core.addColorStop(0.35, `rgba(${hot},1)`);
    core.addColorStop(0.7, demon ? 'rgba(255,60,60,0.85)' : 'rgba(255,160,40,0.85)');
    core.addColorStop(1, 'rgba(255,140,30,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, cr * 1.6, 0, TAU);
    ctx.fill();
    // slow rune ring around the core
    ctx.save();
    ctx.rotate(this.time * 0.6);
    ctx.strokeStyle = demon ? 'rgba(255,120,120,0.5)' : 'rgba(255,200,120,0.45)';
    ctx.lineWidth = 0.14;
    ctx.setLineDash([0.5, 0.45]);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.46, 0, TAU);
    ctx.stroke();
    ctx.restore();
    // shield
    if (run.shieldReady) {
      ctx.strokeStyle = 'rgba(111,231,255,0.75)';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, R + 1.2, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(111,231,255,0.06)';
      ctx.fill();
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
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of run.shots) {
      const t = s.target;
      if (s.missile) {
        const a = t ? Math.atan2(t.y - s.y, t.x - s.x) : 0;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,120,60,0.55)';
        ctx.fillRect(-3, -0.35, 1.8, 0.7);
        ctx.fillStyle = '#ffb547';
        ctx.beginPath();
        ctx.moveTo(1.5, 0);
        ctx.lineTo(-1.2, 0.7);
        ctx.lineTo(-1.2, -0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }
      const color = s.big ? '255,155,242' : s.crit ? '255,211,90' : '255,226,170';
      const rad = s.big ? 1.1 : s.crit ? 0.85 : 0.62;
      let dx = 0;
      let dy = 0;
      if (t) {
        const d = Math.hypot(t.x - s.x, t.y - s.y) || 1;
        dx = (t.x - s.x) / d;
        dy = (t.y - s.y) / d;
      }
      // tail
      ctx.strokeStyle = `rgba(${color},0.32)`;
      ctx.lineWidth = rad * 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x - dx * 2.6, s.y - dy * 2.6);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      // halo and head
      ctx.fillStyle = `rgba(${color},0.28)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad * 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${color})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad, 0, TAU);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }

  effects(run) {
    const ctx = this.ctx;
    for (const f of run.fx) {
      const k = 1 - f.age / f.ttl;
      switch (f.type) {
        case 'burst': {
          ctx.fillStyle = f.color;
          if (k > 0.6) {
            ctx.globalAlpha = (k - 0.6) * 1.2;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (1.2 + (1 - k) * 1.5), 0, TAU);
            ctx.fill();
          }
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
        case 'fizzle':
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = k * 0.8;
          ctx.lineWidth = 0.18;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 0.4 + (1 - k) * 1.4, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 0.5 * k, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
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

function shapePath(ctx, shape, r) {
  ctx.beginPath();
  switch (shape) {
    case 'triangle':
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.8, r * 0.8);
      ctx.lineTo(-r * 0.8, -r * 0.8);
      break;
    case 'diamond':
      ctx.moveTo(r, 0);
      ctx.lineTo(0, r * 0.75);
      ctx.lineTo(-r, 0);
      ctx.lineTo(0, -r * 0.75);
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case 'ring':
      ctx.arc(0, 0, r, 0, TAU);
      break;
    case 'boss':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const rr = i % 2 ? r * 0.72 : r;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
      }
      break;
    default: {
      const q = r * 0.8;
      const c = r * 0.22;
      ctx.moveTo(-q + c, -q);
      ctx.lineTo(q - c, -q);
      ctx.quadraticCurveTo(q, -q, q, -q + c);
      ctx.lineTo(q, q - c);
      ctx.quadraticCurveTo(q, q, q - c, q);
      ctx.lineTo(-q + c, q);
      ctx.quadraticCurveTo(-q, q, -q, q - c);
      ctx.lineTo(-q, -q + c);
      ctx.quadraticCurveTo(-q, -q, -q + c, -q);
    }
  }
  ctx.closePath();
}
