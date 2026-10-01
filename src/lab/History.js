import { Molecule } from '../chem/Molecule.js';
import { BY_SYMBOL } from '../chem/elements.js';
import { SUBSTANCES } from '../chem/substances.js';

const MAX = 30;

function mixtureState(m) {
  return {
    items: [...m.items],
    suspended: [...m.suspended],
    temperature: m.temperature,
    foam: m.foam,
  };
}

function restoreMixture(m, s) {
  m.clear();
  for (const [id, ml] of s.items) if (SUBSTANCES[id]) m.items.set(id, ml);
  for (const [id, ml] of s.suspended) if (SUBSTANCES[id]) m.suspended.set(id, ml);
  m.temperature = s.temperature;
  m.foam = s.foam;
  m.version++;
}

/**
 * Undo: a snapshot of the lab (atoms, molecules, equipment and their contents) is taken
 * right before every action — adding things, bonding, breaking bonds, synthesizing,
 * combining, pouring, breaking glass, resetting — and the Undo buttons step back.
 */
export class History {
  constructor(app) {
    this.app = app;
    this.stack = [];
    this.restoring = false;
    this.lastTime = 0;
  }

  get canUndo() {
    return this.stack.length > 0;
  }

  get lastLabel() {
    return this.stack.length ? this.stack[this.stack.length - 1].label : null;
  }

  /** Remember the current state before an action. `debounce` (s) merges rapid repeats. */
  record(label, { debounce = 0 } = {}) {
    if (this.restoring || !this.app.ready) return;
    const now = performance.now();
    const top = this.stack[this.stack.length - 1];
    if (debounce && top && top.label === label && now - this.lastTime < debounce * 1000) {
      this.lastTime = now;
      return;
    }
    this.stack.push({ label, state: this.capture() });
    if (this.stack.length > MAX) this.stack.shift();
    this.lastTime = now;
    this.app.events.emit('historychange');
  }

  capture() {
    const app = this.app;
    const molecules = app.molecules.molecules.filter((m) => !m.absorbing).map((m) => ({
      atoms: m.atoms.map((a) => ({ s: a.el.symbol, local: a.local.clone() })),
      bonds: m.bonds.map((b) => [m.atoms.indexOf(b.a), m.atoms.indexOf(b.b), b.order]),
      pos: m.object.position.clone(),
      quat: m.object.quaternion.clone(),
      stasis: m.stasis,
    }));
    const equipment = app.entities.filter((e) => e.kind === 'equipment' && !e.removed && e.catalogId).map((e) => {
      const saved = app.dissolver.active.get(e)?.saved;
      return {
        id: e.catalogId,
        pos: (saved ? saved.position : e.object.position).clone(),
        quat: (saved ? saved.quaternion : e.object.quaternion).clone(),
        contents: e.contents ? mixtureState(saved?.contents || e.contents) : null,
        load: e.load ? mixtureState(e.load) : null,
        on: !!e.on,
        stasis: e.stasis,
      };
    });
    return {
      molecules,
      equipment,
      machine: { lastProduct: app.machine.lastProduct?.id || null, amountIndex: app.machine.amountIndex },
    };
  }

  undo() {
    const entry = this.stack.pop();
    if (!entry) {
      this.app.toasts.show('Nothing to undo', '#a9c6e6', 1.5);
      return false;
    }
    this.restore(entry.state);
    this.app.audio?.play('rotate', { volume: 0.5 });
    this.app.toasts.show(`Undone: ${entry.label}`, '#7fe3ff', 2);
    this.app.events.emit('historychange');
    this.app.events.emit('undo', entry.label);
    return true;
  }

  restore(state) {
    const app = this.app;
    this.restoring = true;
    try {
      for (const h of app.input.hands) if (h.held) app.grab.release(h, true);
      app.dissolver.clear();
      app.fluids.clear();
      app.machine.cancel();
      app.machine.docked = null;
      for (const e of app.entities.slice()) {
        if (e.kind === 'molecule' || e.kind === 'equipment') e.destroy();
      }
      for (const m of state.molecules) {
        const mol = Molecule.create(app, m.atoms.map((a) => ({ el: BY_SYMBOL[a.s], local: a.local })), m.bonds, m.pos, m.quat);
        if (m.stasis) mol.enterStasis();
        app.addEntity(mol);
      }
      for (const s of state.equipment) {
        const e = app.spawnEquipment(s.id, s.pos, s.quat, { stasis: s.stasis });
        if (s.contents && e.contents) restoreMixture(e.contents, s.contents);
        if (s.load && e.load) restoreMixture(e.load, s.load);
        if (s.on && e.toggle) e.toggle(true);
      }
      app.machine.lastProduct = state.machine.lastProduct ? SUBSTANCES[state.machine.lastProduct] : null;
      app.machine.amountIndex = state.machine.amountIndex;
      app.machine.screen.dirty = true;
    } finally {
      this.restoring = false;
    }
  }

  clear() {
    this.stack.length = 0;
    this.app.events.emit('historychange');
  }
}

