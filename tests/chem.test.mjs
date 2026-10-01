// Pure chemistry tests (no browser): bonding rules, identification, mixtures, reactions.
import assert from 'node:assert/strict';
globalThis.CHEMLAB_NO_LOOKUP = true; // keep these tests offline and deterministic
import { BY_SYMBOL, ELEMENTS } from '../src/chem/elements.js';
import { addBond, removeBond, bondsToSeparate, components, formulaString, canAcceptBond, vsepr } from '../src/chem/graph.js';
import { identify, knownCompoundCount } from '../src/chem/compounds.js';
import { Mixture } from '../src/chem/Mixture.js';
import { react } from '../src/chem/reactions.js';
import { SUBSTANCES } from '../src/chem/substances.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error('FAIL', name);
    throw e;
  }
};

const A = (s) => ({ el: BY_SYMBOL[s] });
function build(symbols, pairs) {
  const atoms = symbols.map(A);
  const bonds = [];
  for (const [i, j] of pairs) assert.ok(addBond(atoms, bonds, atoms[i], atoms[j]), `bond ${i}-${j} in ${symbols.join('')}`);
  return { atoms, bonds, id: identify(atoms, bonds) };
}
const orders = (bonds) => bonds.map((b) => b.order).sort().join('');

test('118 elements with positions', () => {
  assert.equal(ELEMENTS.length, 118);
  const cells = new Set(ELEMENTS.map((e) => e.row + ':' + e.col));
  assert.equal(cells.size, 118, 'no two elements share a cell');
  for (const e of ELEMENTS) {
    assert.ok(e.col >= 1 && e.col <= 18 && e.row >= 1 && e.row <= 10, e.symbol);
    assert.ok(e.covalentRadius > 0 && e.mass > 0, e.symbol);
  }
});

test('every element has a substance', () => {
  for (const e of ELEMENTS) assert.ok(SUBSTANCES['elem:' + e.symbol], e.symbol);
});

test('database is large and consistent', () => {
  assert.ok(knownCompoundCount() > 100);
  for (const s of Object.values(SUBSTANCES)) {
    if (s.aq) assert.ok(SUBSTANCES[s.aq], `${s.id} -> ${s.aq}`);
  }
});

test('water from H + O + H', () => {
  const r = build(['O', 'H', 'H'], [[0, 1], [0, 2]]);
  assert.equal(r.id.substance.id, 'water');
  assert.equal(orders(r.bonds), '11');
});

test('H2 cannot bond to O until pulled apart', () => {
  const atoms = [A('H'), A('H'), A('O')];
  const bonds = [];
  addBond(atoms, bonds, atoms[0], atoms[1]);
  assert.equal(canAcceptBond(atoms[0], bonds), false);
  const cut = bondsToSeparate(atoms[0], atoms[1], bonds);
  for (const b of cut) removeBond(atoms, bonds, b);
  assert.equal(components(atoms, bonds).length, 3);
  assert.ok(canAcceptBond(atoms[0], bonds));
});

test('bond orders: O2, N2, CO2, HCN, ethene, benzene', () => {
  assert.equal(orders(build(['O', 'O'], [[0, 1]]).bonds), '2');
  assert.equal(orders(build(['N', 'N'], [[0, 1]]).bonds), '3');
  assert.equal(orders(build(['O', 'C', 'O'], [[0, 1], [1, 2]]).bonds), '22');
  assert.equal(build(['H', 'C', 'N'], [[0, 1], [1, 2]]).id.substance.id, 'hydrogen_cyanide');
  assert.equal(build(['C', 'C', 'H', 'H', 'H', 'H'], [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5]]).id.substance.id, 'ethene');
  const benz = build(['C', 'C', 'C', 'C', 'C', 'C', 'H', 'H', 'H', 'H', 'H', 'H'],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]]);
  assert.equal(benz.id.substance.id, 'benzene');
});

test('hypervalent sulfur: SO2 and H2SO4 in any build order', () => {
  assert.equal(build(['S', 'O', 'O'], [[0, 1], [0, 2]]).id.substance.id, 'sulfur_dioxide');
  assert.equal(build(['S', 'O', 'O', 'O', 'O', 'H', 'H'], [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 6]]).id.substance.id, 'sulfuric_acid');
  assert.equal(build(['H', 'O', 'S', 'O', 'O', 'O', 'H'], [[0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [5, 6]]).id.substance.id, 'sulfuric_acid');
});

test('isomers are distinguished', () => {
  const eth = build(['C', 'C', 'O', 'H', 'H', 'H', 'H', 'H', 'H'], [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5], [1, 6], [1, 7], [2, 8]]);
  const dme = build(['C', 'O', 'C', 'H', 'H', 'H', 'H', 'H', 'H'], [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5], [2, 6], [2, 7], [2, 8]]);
  assert.equal(eth.id.substance.id, 'ethanol');
  assert.equal(dme.id.substance.id, 'dimethyl_ether');
});

test('incomplete molecules are rejected with a reason', () => {
  const r = build(['C', 'H', 'H', 'H'], [[0, 1], [0, 2], [0, 3]]);
  assert.equal(r.id.ok, false);
  assert.match(r.id.reason, /free bond/);
  const o = identify([A('O')], []);
  assert.equal(o.ok, false);
  assert.ok(identify([A('Na')], []).ok);
  assert.ok(identify([A('He')], []).ok);
});

test('unknown but valid molecule gets a generic substance', () => {
  const r = build(['C', 'O', 'O', 'C', 'H', 'H', 'H', 'H', 'H', 'H'], [[0, 1], [1, 2], [2, 3], [0, 4], [0, 5], [0, 6], [3, 7], [3, 8], [3, 9]]);
  assert.ok(r.id.ok);
  assert.equal(r.id.known, false);
  assert.equal(formulaString(r.atoms), 'C2H6O2');
});

test('VSEPR angles', () => {
  const w = build(['O', 'H', 'H'], [[0, 1], [0, 2]]);
  assert.equal(vsepr(w.atoms[0], w.bonds).angle, 104.5);
  const m = build(['C', 'H', 'H', 'H', 'H'], [[0, 1], [0, 2], [0, 3], [0, 4]]);
  assert.equal(vsepr(m.atoms[0], m.bonds).angle, 109.47);
  const c = build(['O', 'C', 'O'], [[0, 1], [1, 2]]);
  assert.equal(vsepr(c.atoms[1], c.bonds).angle, 180);
  const a = build(['N', 'H', 'H', 'H'], [[0, 1], [0, 2], [0, 3]]);
  assert.equal(vsepr(a.atoms[0], a.bonds).angle, 107);
});

const run = (mix, seconds, env = {}) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 30) events.push(...react(mix, 1 / 30, env));
  return events;
};

test('neutralisation HCl + NaOH -> salt water, pH 7', () => {
  const m = new Mixture();
  m.add('hydrochloric_acid', 50);
  m.add('naoh_aq', 50);
  run(m, 3);
  assert.ok(m.amount('nacl_aq') > 45, 'salt formed');
  assert.ok(Math.abs(m.pH - 7) < 0.5, 'neutral pH ' + m.pH);
  assert.ok(m.temperature > 22, 'exothermic');
});

test('dissolving copper sulfate makes a blue solution', () => {
  const m = new Mixture();
  m.add('water', 100);
  m.add('cuso4', 5);
  run(m, 5);
  assert.ok(m.amount('cuso4_aq') > 15);
  assert.ok(m.liquidLook().color[2] > m.liquidLook().color[0], 'blue');
});

test('baking soda + vinegar fizzes and foams', () => {
  const m = new Mixture();
  m.add('acetic_acid', 30);
  m.add('nahco3', 10);
  const ev = run(m, 1);
  assert.ok(ev.some((e) => e.type === 'fizz'));
  assert.ok(m.foam > 0);
});

test('silver nitrate + salt water precipitates silver chloride', () => {
  const m = new Mixture();
  m.add('agno3_aq', 20);
  m.add('nacl_aq', 20);
  const ev = run(m, 2);
  assert.ok(ev.some((e) => e.type === 'precipitate'));
  assert.ok(m.amount('agcl') > 1);
});

test('sodium in water makes NaOH and hydrogen', () => {
  const m = new Mixture();
  m.add('water', 100);
  m.add('elem:Na', 2);
  const ev = run(m, 3);
  assert.ok(m.amount('naoh_aq') > 1);
  assert.ok(ev.some((e) => e.type === 'fizz'));
  assert.ok(m.pH > 12);
});

test('hydrogen peroxide + catalyst foams (elephant toothpaste)', () => {
  const m = new Mixture();
  m.add('hydrogen_peroxide', 40);
  m.add('ki_aq', 5);
  const ev = run(m, 2);
  assert.ok(ev.some((e) => e.type === 'foam'));
  assert.ok(m.amount('hydrogen_peroxide') < 30);
});

test('boiling salt water leaves salt crystals', () => {
  const m = new Mixture();
  m.add('nacl_aq', 20);
  run(m, 40, { heatRate: 6 });
  assert.ok(m.amount('nacl') > 0.5, 'salt left ' + m.amount('nacl'));
});

test('iron nail in copper sulfate deposits copper', () => {
  const m = new Mixture();
  m.add('cuso4_aq', 50);
  m.add('elem:Fe', 3);
  run(m, 8);
  assert.ok(m.amount('copper_deposit') > 0.1);
  assert.ok(m.amount('feso4_aq') > 1);
});

test('acids are corrosive, water is not', () => {
  const a = new Mixture();
  a.add('hydrochloric_acid', 10);
  assert.ok(a.isCorrosive);
  const w = new Mixture();
  w.add('water', 10);
  assert.equal(w.isCorrosive, false);
});

console.log(`chemistry: ${passed} tests passed`);
