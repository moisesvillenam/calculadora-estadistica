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
  get('calculator').querySelector = () => get('variance-radio');
  get('auth-mode').value = 'login';
  get('auth-login').value = 'login';
  get('auth-signup').value = 'signup';
  let callback;
  const session = { user: { id: 'owner', email: 'owner@example.invalid' } };
  const service = { list: async (...args) => {
    const result = await list(...args);
    return Array.isArray(result) ? { rows: result, hasNext: false } : result;
  }, save: async () => ({ id: 'saved' }), get: async () => ({ name: 'Datos', values: [2, 4], variance_type: 'sample' }), remove: async () => {} };
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

test('reintentos simultáneos inicializan el cliente y la suscripción una sola vez', async () => {
  const ui = await setup({ loadError: new Error('SDK ausente') });
  const pending = deferred();
  let loads = 0, subscriptions = 0;
  ui.window.ClaraCloud.loadClient = async () => { loads++; return pending.promise; };
  const subscribe = ui.client.auth.onAuthStateChange;
  ui.client.auth.onAuthStateChange = callback => { subscriptions++; return subscribe(callback); };
  const first = ui.click('cloud-retry'), second = ui.click('cloud-retry');
  assert.equal(loads, 1);
  pending.resolve(ui.client);
  await Promise.all([first, second]);
  assert.equal(subscriptions, 1);
  assert.equal(ui.get('auth-form').hidden, false);
});

test('registro sin sesión, login, listado y logout conservan datos locales', async () => {
  const ui = await setup();
  ui.get('auth-mode').value = 'signup';
  ui.get('auth-mode').dispatchEvent({ type: 'change' });
  ui.get('auth-password').value = 'test-password';
  await ui.submit('auth-form', 'auth-signup');
  assert.match(ui.get('cloud-status').textContent, /correo/);
  assert.equal(ui.get('cloud-signed-in').hidden, true);
  ui.get('auth-mode').value = 'login';
  ui.get('auth-mode').dispatchEvent({ type: 'change' });
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
  ui.service.list = async () => ({ rows: [], hasNext: false });
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
  let inputs = 0, changes = 0, deletes = 0;
  ui.get('variance-radio').addEventListener('change', () => {
    changes++;
    assert.equal(ui.get('numbers').value, '2; 4');
    assert.equal(ui.get('calculator').elements.variance.value, 'sample');
  });
  ui.get('numbers').addEventListener('input', () => { inputs++; });
  ui.service.remove = async () => { deletes++; };
  const [recover, remove] = ui.get('datasets-list').querySelectorAll('button');
  await recover.dispatchEvent({ type: 'click' });
  assert.equal(ui.get('numbers').value, '2; 4');
  assert.equal(ui.get('calculator').elements.variance.value, 'sample');
  assert.equal(inputs, 1);
  assert.equal(changes, 1);
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

const row = id => ({ id: String(id), name: `Datos ${id}`, variance_type: 'sample', created_at: '2026-10-19' });
const owner = { user: { id: 'owner' } };

test('eliminar y actualizar conservan la página mientras tenga filas', async () => {
  let rows = Array.from({ length: 42 }, (_, i) => row(i));
  const pages = [];
  const ui = await setup({ initial: owner, list: async (_owner, page) => {
    pages.push(page);
    return { rows: rows.slice(page * 20, page * 20 + 20), hasNext: rows.length > page * 20 + 20 };
  } });
  ui.service.remove = async (_owner, id) => { rows = rows.filter(item => item.id !== id); };
  await ui.click('datasets-next');
  await ui.click('datasets-next');
  assert.equal(ui.get('datasets-page').textContent, 'Página 3');
  await ui.get('datasets-list').querySelectorAll('button')[1].dispatchEvent({ type: 'click' });
  assert.equal(ui.get('datasets-page').textContent, 'Página 3');
  assert.equal(ui.get('datasets-list').children.length, 1);
  await ui.click('datasets-refresh');
  assert.equal(ui.get('datasets-page').textContent, 'Página 3');
  await ui.get('datasets-list').querySelectorAll('button')[1].dispatchEvent({ type: 'click' });
  assert.equal(ui.get('datasets-page').textContent, 'Página 2');
  assert.equal(ui.get('datasets-list').children.length, 20);
  assert.equal(ui.get('datasets-next').disabled, true);
  assert.deepEqual(pages, [0, 1, 2, 2, 2, 2, 1]);
});

test('fallos al navegar conservan página y filas; fin exacto desactiva siguiente', async () => {
  const ui = await setup({ initial: owner, list: async () => ({ rows: Array.from({ length: 20 }, (_, i) => row(i)), hasNext: true }) });
  ui.service.list = async () => { throw new Error('Sin conexión'); };
  await ui.click('datasets-next');
  assert.equal(ui.get('datasets-page').textContent, 'Página 1');
  assert.equal(ui.get('datasets-list').children.length, 20);
  ui.service.list = async () => ({ rows: Array.from({ length: 20 }, (_, i) => row(i + 20)), hasNext: false });
  await ui.click('datasets-next');
  assert.equal(ui.get('datasets-page').textContent, 'Página 2');
  assert.equal(ui.get('datasets-next').disabled, true);
});

test('borrado exitoso seguido de fallo de lista conserva página y quita solo la fila eliminada', async () => {
  const ui = await setup({ initial: owner, list: async () => ({ rows: [row(1), row(2)], hasNext: true }) });
  await ui.click('datasets-next');
  ui.service.list = async () => { throw new Error('Sin conexión'); };
  await ui.get('datasets-list').querySelectorAll('button')[1].dispatchEvent({ type: 'click' });
  assert.equal(ui.get('datasets-page').textContent, 'Página 2');
  assert.equal(ui.get('datasets-list').children.length, 1);
  assert.match(ui.get('cloud-status').textContent, /Dataset eliminado/);
  assert.equal(ui.get('cloud-error').hidden, false);
});

test('páginas vacías por borrados externos retroceden y descartan respuestas tras logout', async () => {
  const ui = await setup({ initial: owner, list: async () => ({ rows: [row(1)], hasNext: true }) });
  await ui.click('datasets-next');
  await ui.click('datasets-next');
  const pages = [];
  const pending = deferred();
  ui.service.list = async (_owner, page) => {
    pages.push(page);
    return page === 0 ? pending.promise : { rows: [], hasNext: false };
  };
  const refreshing = ui.click('datasets-refresh');
  await tick();
  assert.deepEqual(pages, [2, 1, 0]);
  ui.emit(null);
  pending.resolve({ rows: [row('private')], hasNext: false });
  await refreshing;
  assert.equal(ui.get('datasets-page').textContent, 'Página 1');
  assert.equal(ui.get('datasets-list').children.length, 0);
});

test('autocomplete depende del modo antes de escribir; Enter respeta registro', async () => {
  const ui = await setup();
  assert.equal(ui.get('auth-password').autocomplete, 'current-password');
  assert.equal(ui.get('auth-signup').hidden, true);
  ui.get('auth-password').value = 'existing-password';
  ui.get('auth-mode').value = 'signup';
  ui.get('auth-mode').dispatchEvent({ type: 'change' });
  assert.equal(ui.get('auth-password').autocomplete, 'new-password');
  assert.equal(ui.get('auth-password').value, '');
  assert.equal(ui.get('auth-login').hidden, true);
  assert.equal(ui.get('auth-password').minLength, 8);
  let signups = 0;
  ui.client.auth.signUp = async () => { signups++; return { data: { session: null } }; };
  ui.get('auth-password').value = 'short';
  await ui.submit('auth-form');
  assert.equal(signups, 0);
  ui.get('auth-password').value = 'new-password';
  await ui.submit('auth-form');
  assert.equal(signups, 1);
  ui.get('auth-mode').value = 'login';
  ui.get('auth-mode').dispatchEvent({ type: 'change' });
  assert.equal(ui.get('auth-password').autocomplete, 'current-password');
  assert.equal(ui.get('auth-login').hidden, false);
});
