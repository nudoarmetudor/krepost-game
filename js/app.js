// Shared application state. main.js fills in the actions at startup.

import { persist } from './state.js';

export const app = {
  save: null,
  run: null,
  renderer: null,
  screen: 'home',
  paused: false,
  live: [], // functions refreshing the visible screen once per tick
  ui: { runTab: 'attack', runMult: 1, wsTab: 'attack', wsMult: 1, modFilter: 'all' },
  go: () => {},
  refresh: () => {},
  startRun: () => {},
  continueRun: () => {},
  startChallenge: () => {},
  openStats: () => {},
};

export function commit() {
  if (!app.save) return;
  if (app.run && !app.run.over) app.save.run = app.run.snapshot();
  persist(localStorage, app.save);
}
