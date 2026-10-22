const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  class Element extends EventTarget {
    value = '';
    textContent = '';
    hidden = false;
    attrs = {};
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
  }
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  get('calculator').elements = { variance: { value: 'population' } };
  get('calculator').querySelectorAll = () => [get('variance')];
  get('numbers').value = '8; 12';
  let updates = 0;
  get('numbers').addEventListener('input', () => updates++);
  vm.runInNewContext(fs.readFileSync(require.resolve('../import-ui.js'), 'utf8'), {
    document: { getElementById: get }, Event,
    DataImport: require('../data-import.js'), Statistics: require('../statistics.js')
  });
  const choose = (text, name = 'datos.csv') => {
    get('data-file').files = [{ name, size: 10, text: typeof text === 'function' ? text : async () => text }];
    get('data-file').dispatchEvent(new Event('change'));
  };
  return { get, choose, updates: () => updates };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('carga actualiza el campo y emite input; permite seleccionar el mismo archivo', async () => {
  const ui = setup();
  for (let i = 0; i < 2; i++) {
    ui.choose('1,2,3');
    assert.equal(ui.get('data-file').attrs['aria-busy'], 'true');
    await tick();
    assert.equal(ui.get('numbers').value, '1; 2; 3');
    assert.match(ui.get('import-status').textContent, /3 valores cargados/);
    assert.equal(ui.get('data-file').value, '');
    assert.equal(ui.get('data-file').attrs['aria-busy'], undefined);
  }
  assert.equal(ui.updates(), 2);
});

test('errores de formato, cálculo y lectura preservan los datos y resultados anteriores', async () => {
  const ui = setup();
  ui.get('calculator').elements.variance.value = 'sample';
  for (const content of ['cabecera\n1', '1', '1e308,-1e308', () => Promise.reject(new Error('fallo'))]) {
    ui.choose(content);
    await tick();
    assert.equal(ui.get('numbers').value, '8; 12');
    assert.equal(ui.get('import-error').hidden, false);
    assert.equal(ui.get('data-file').attrs['aria-invalid'], 'true');
    assert.equal(ui.updates(), 0);
  }
  ui.choose('1,2');
  await tick();
  assert.equal(ui.get('import-error').hidden, true);
  assert.equal(ui.get('data-file').attrs['aria-invalid'], undefined);
});

test('lecturas tardías no reemplazan ediciones, ejemplos, limpieza o cambios de varianza', async () => {
  for (const [id, type] of [['numbers', 'input'], ['example', 'click'], ['calculator', 'reset'], ['variance', 'change']]) {
    const ui = setup();
    let resolve;
    ui.choose(() => new Promise(done => { resolve = done; }));
    ui.get(id).dispatchEvent(new Event(type));
    resolve('1,2,3');
    await tick();
    assert.equal(ui.get('numbers').value, '8; 12');
    assert.equal(ui.get('import-status').textContent, '');
    assert.equal(ui.get('data-file').attrs['aria-busy'], undefined);
  }
});

test('una selección más reciente prevalece aunque la anterior termine o falle después', async () => {
  for (const fail of [false, true]) {
    const ui = setup();
    let finish;
    ui.choose(() => new Promise((resolve, reject) => { finish = fail ? reject : resolve; }));
    ui.choose('4,5');
    await tick();
    finish(fail ? new Error('fallo') : '1,2');
    await tick();
    assert.equal(ui.get('numbers').value, '4; 5');
    assert.match(ui.get('import-status').textContent, /2 valores cargados/);
    assert.equal(ui.get('import-error').hidden, true);
  }
});
