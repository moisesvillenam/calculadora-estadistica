const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cloud = require('../cloud-service.js');
const statistics = require('../statistics.js');

// Minimal DOM double for Cloud state transitions. Real layout is covered separately in Chromium.
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.events = {}; this.value = ''; this.hidden = false; this.textContent = ''; }
  addEventListener(type, listener) { this.events[type] = listener; }
  dispatchEvent(event) { return this.events[event.type]?.(event); }
  setAttribute() {}
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelectorAll(tag) { return this.children.flatMap(node => [...(node.tag === tag ? [node] : []), ...node.querySelectorAll(tag)]); }
  focus() {}
}

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function setup({ initial = null, list = async () => [], loadError } = {}) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  get('calculator').elements = { variance: { value: 'population' } };
  get('auth-login').value = 'login';
  get('auth-signup').value = 'signup';
  let callback;
  const session = { user: { id: 'owner', email: 'owner@example.invalid' } };
  const service = { list, save: async () => ({ id: 'saved' }), get: async () => ({ name: 'Datos', values: [2, 4], variance_type: 'sample' }), remove: async () => {} };
  const client = { auth: {
    onAuthStateChange(cb) { callback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: initial } }; },
    async signUp() { return { data: { session: null } }; },
    async signInWithPassword() { callback('SIGNED_IN', session); return { data: { session } }; },
    async signOut() { callback('SIGNED_OUT', null); return {}; }
  } };
  const window = {
    ClaraCloud: { ...cloud, loadClient: async () => { if (loadError) throw loadError; return client; }, createService: () => service },
    Statistics: statistics, confirm: () => true, addEventListener() {}
  };
  const context = vm.createContext({ window, document: { getElementById: get, createElement: tag => new Element(tag) }, setTimeout, Event: class { constructor(type) { this.type = type; } } });
  vm.runInContext(fs.readFileSync(require.resolve('../cloud-ui.js'), 'utf8'), context);
  await tick();
  const submit = (id, button) => get(id).dispatchEvent({ type: 'submit', preventDefault() {}, submitter: get(button) });
  const click = id => get(id).dispatchEvent({ type: 'click' });
  return { get, submit, click, service, client, emit: next => callback('SIGNED_IN', next), session, window };
}

test('fallo al cargar SDK mantiene modo local y permite reintentar', async () => {
  const ui = await setup({ loadError: new Error('No se pudo cargar Clara Cloud.') });
  assert.equal(ui.get('auth-form').hidden, true);
  assert.equal(ui.get('cloud-retry').hidden, false);
  assert.match(ui.get('cloud-status').textContent, /Modo local/);
});

test('registro sin sesión, login, listado y logout conservan datos locales', async () => {
  const ui = await setup();
  ui.get('auth-password').value = 'test-password';
  await ui.submit('auth-form', 'auth-signup');
  assert.match(ui.get('cloud-status').textContent, /correo/);
  assert.equal(ui.get('cloud-signed-in').hidden, true);
  await ui.submit('auth-form', 'auth-login');
  await tick();
  assert.equal(ui.get('cloud-signed-in').hidden, false);
  assert.equal(ui.get('datasets-empty').hidden, false);
  ui.get('numbers').value = '2; 4';
  await ui.click('auth-logout');
  assert.equal(ui.get('cloud-signed-in').hidden, true);
  assert.equal(ui.get('numbers').value, '2; 4');
});

test('restauración de sesión y respuestas tardías tras cambio de cuenta', async () => {
  const pending = deferred();
  const owner = { user: { id: 'owner' } };
  const ui = await setup({ initial: owner, list: () => pending.promise });
  assert.equal(ui.get('datasets-refresh').disabled, true);
  ui.emit(null);
  pending.resolve([{ id: 'private', name: 'Privado', created_at: '2026-10-19', variance_type: 'population' }]);
  await tick();
  assert.equal(ui.get('datasets-list').children.length, 0);
  assert.equal(ui.get('cloud-signed-in').hidden, true);
  ui.service.list = async () => [];
  ui.emit({ user: { id: 'second-owner' } });
  await tick();
  assert.equal(ui.get('datasets-list').children.length, 0);
  assert.equal(ui.get('cloud-signed-in').hidden, false);
});

test('guardado bloquea doble envío y diferencia éxito de fallo al refrescar', async () => {
  const ui = await setup({ initial: { user: { id: 'owner' } } });
  const pending = deferred();
  let saves = 0;
  ui.service.save = () => { saves++; return pending.promise; };
  ui.service.list = async () => { throw { code: '42501' }; };
  ui.get('numbers').value = '2; 4';
  ui.get('dataset-name').value = 'Datos';
  ui.submit('dataset-form', 'dataset-save');
  ui.submit('dataset-form', 'dataset-save');
  assert.equal(ui.get('dataset-save').disabled, true);
  assert.equal(saves, 1);
  pending.resolve({ id: 'saved' });
  await tick();
  assert.match(ui.get('cloud-status').textContent, /Dataset guardado/);
  assert.match(ui.get('cloud-error').textContent, /políticas/);
  assert.equal(ui.get('dataset-save').disabled, false);
});

test('recuperar usa el evento local y eliminar exige confirmación', async () => {
  const ui = await setup({ initial: { user: { id: 'owner' } }, list: async () => [{ id: 'one', name: 'Datos', variance_type: 'sample', created_at: '2026-10-19' }] });
  let inputs = 0, deletes = 0;
  ui.get('numbers').addEventListener('input', () => { inputs++; });
  ui.service.remove = async () => { deletes++; };
  const [recover, remove] = ui.get('datasets-list').querySelectorAll('button');
  await recover.dispatchEvent({ type: 'click' });
  assert.equal(ui.get('numbers').value, '2; 4');
  assert.equal(ui.get('calculator').elements.variance.value, 'sample');
  assert.equal(inputs, 1);
  ui.window.confirm = () => false;
  await remove.dispatchEvent({ type: 'click' });
  assert.equal(deletes, 0);
  ui.window.confirm = () => true;
  await remove.dispatchEvent({ type: 'click' });
  assert.equal(deletes, 1);
  assert.equal(ui.get('numbers').value, '2; 4');
});

test('fallo de cierre conserva sesión y comunica el error', async () => {
  const ui = await setup({ initial: { user: { id: 'owner' } } });
  ui.client.auth.signOut = async () => ({ error: { message: 'Failed to fetch' } });
  await ui.click('auth-logout');
  assert.equal(ui.get('cloud-signed-in').hidden, false);
  assert.equal(ui.get('auth-logout').disabled, false);
  assert.match(ui.get('cloud-status').textContent, /No se pudo cerrar/);
});
