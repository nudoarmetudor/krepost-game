// Number and time formatting shared by the game and the interface.

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'q', 'Q', 's', 'S', 'O', 'N', 'D'];

let notation = 'letters';

export function setNotation(mode) {
  notation = mode === 'scientific' ? 'scientific' : 'letters';
}

function trim(x, digits) {
  // only zeros after the decimal point: 50 stays 50
  const t = x.toFixed(digits);
  return digits > 0 ? t.replace(/\.?0+$/, '') : t;
}

export function fmt(n, digits = 2) {
  if (n === Infinity) return '∞';
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  const a = Math.abs(n);
  let out;
  if (a < 1000) {
    out = a < 10 && a % 1 !== 0 ? trim(a, digits) : a < 100 && a % 1 !== 0 ? trim(a, 1) : String(Math.floor(a));
  } else if (notation === 'scientific') {
    const e = Math.floor(Math.log10(a));
    out = trim(a / 10 ** e, digits) + 'e' + e;
  } else {
    const tier = Math.floor(Math.log10(a) / 3);
    const scaled = a / 1000 ** tier;
    let suffix = SUFFIXES[tier];
    if (suffix === undefined) {
      // aa, ab, ac ... after the named suffixes run out
      const k = tier - SUFFIXES.length;
      suffix = String.fromCharCode(97 + Math.floor(k / 26) % 26) + String.fromCharCode(97 + (k % 26));
    }
    out = trim(scaled, scaled >= 100 ? 0 : scaled >= 10 ? 1 : digits) + suffix;
  }
  return (neg ? '-' : '') + out;
}

export function fmtInt(n) {
  return n < 1000 ? String(Math.floor(n)) : fmt(n);
}

export function fmtPct(x, digits = 1) {
  return trim(x * 100, digits) + '%';
}

export function fmtMult(x) {
  return '×' + (x >= 1000 ? fmt(x) : trim(x, 2));
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
