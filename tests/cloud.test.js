const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, validateDataset, createService, loadClient, errorMessage, timedFetch } = require('../cloud-service.js');

const valid = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_TEST_ONLY_NOT_A_CREDENTIAL' };
const dataset = { name: '  Ejemplo  ', values: [1, 2, 3], variance_type: 'sample' };
const stored = { id: 'one', user_id: 'owner', name: dataset.name,
  data: { values: dataset.values, variance_type: dataset.variance_type }, created_at: '2026-10-19T12:00:00Z' };
const columns = ['id', 'user_id', 'name', 'data', 'created_at'];

function mock(response) {
  const calls = [];
  const query = {};
  for (const method of ['schema', 'from', 'select', 'eq', 'order', 'range', 'insert', 'single', 'maybeSingle', 'delete']) {
    query[method] = (...args) => {
      if (method === 'select') assert.ok(args[0].split(',').every(column => columns.includes(column)));
      if (method === 'insert') assert.ok(Object.keys(args[0]).every(column => columns.includes(column)));
      calls.push([method, ...args]); return query;
    };
  }
  query.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
  return { service: createService(query), calls };
}

test('configuración ausente, marcadores, secretos y URL inválida se rechazan', () => {
  for (const config of [undefined, {}, { url: 'REEMPLAZAR', publishableKey: 'REEMPLAZAR' },
    { ...valid, url: 'postgresql://user:password@host/db' }, { ...valid, url: 'https://user:password@host' },
    { ...valid, url: 'https://example.com/path' }, { ...valid, url: 'http://example.com' },
    { ...valid, publishableKey: 'sb_secret_TEST_ONLY' }, { ...valid, publishableKey: 'eyJ.TEST_ONLY.JWT' }]) {
    assert.throws(() => validateConfig(config));
  }
  assert.deepEqual(validateConfig(valid), valid);
});

test('valida datos, nombre, límites y tipo antes de guardar', () => {
  assert.deepEqual(validateDataset(dataset), { ...dataset, name: 'Ejemplo' });
  for (const change of [{ name: ' ' }, { name: 'x'.repeat(101) }, { values: [] }, { values: [Infinity] },
    { values: [1] }, { values: Array(10001).fill(1) }, { variance_type: 'unknown' }, { variance_type: undefined }]) {
    assert.throws(() => validateDataset({ ...dataset, ...change }));
  }
});

test('listado paginado y orden estable restringido al propietario en public.datasets', async () => {
  const { service, calls } = mock({ data: [], error: null });
  assert.deepEqual(await service.list('owner', 2), { rows: [], hasNext: false });
  assert.deepEqual(calls, [['schema', 'public'], ['from', 'datasets'], ['select', 'id,name,data,created_at'],
    ['eq', 'user_id', 'owner'], ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['range', 40, 60]]);
});

test('inserción fuerza el propietario y solo guarda los campos permitidos', async () => {
  const { service, calls } = mock({ data: { id: 'saved' } });
  assert.deepEqual(await service.save('owner', { ...dataset, user_id: 'attacker', data: { values: [99] }, extra: 'ignored' }), { id: 'saved' });
  assert.ok(calls.some(call => call[0] === 'single'));
  assert.deepEqual(calls.find(call => call[0] === 'insert')[1], { name: 'Ejemplo', user_id: 'owner', data: stored.data });
  await assert.rejects(service.save('owner', { ...dataset, values: [] }));
});

test('recuperación valida contenido remoto y filtra por usuario e id', async () => {
  const { service, calls } = mock({ data: stored });
  assert.deepEqual(await service.get('owner', 'one'), { ...dataset, id: 'one', name: 'Ejemplo' });
  assert.deepEqual(calls.find(call => call[0] === 'select'), ['select', 'id,name,data']);
  assert.ok(calls.some(call => call.join() === 'eq,user_id,owner'));
  assert.ok(calls.some(call => call.join() === 'eq,id,one'));
  assert.ok(calls.some(call => call[0] === 'maybeSingle'));
  assert.ok(!calls.some(call => call[0] === 'single'));
  await assert.rejects(mock({ data: null }).service.get('owner', 'one'), /ya no está disponible/);
  await assert.rejects(mock({ error: { code: 'PGRST116' } }).service.get('owner', 'one'), error => error.code === 'PGRST116');
  await assert.rejects(mock({ data: { ...stored, data: { ...stored.data, values: ['bad'] } } }).service.get('owner', 'one'));
});

test('recuperación rechaza JSON ausente o inválido sin usar campos de nivel superior', async () => {
  for (const data of [undefined, null, [], 'texto', 1, true, {}, { values: [1, 2] },
    { variance_type: 'population' }, { values: [1], variance_type: 'sample' },
    { values: [1, 2], variance_type: 'unknown' }, { values: [null], variance_type: 'population' }]) {
    await assert.rejects(mock({ data: { ...stored, ...dataset, data } }).service.get('owner', 'one'));
  }
});

test('save y get conservan el contrato JSON para ambas varianzas', async () => {
  for (const variance_type of ['population', 'sample']) {
    const input = { name: 'Repetidos', values: [3.5, -2, 3.5, 0], variance_type };
    const saving = mock({ data: { id: 'one' } });
    await saving.service.save('owner', input);
    const payload = saving.calls.find(call => call[0] === 'insert')[1];
    const remote = JSON.parse(JSON.stringify({ ...payload, id: 'one' }));
    assert.deepEqual(remote.data, { values: input.values, variance_type });
    assert.deepEqual(await mock({ data: remote }).service.get('owner', 'one'), { id: 'one', ...input });
  }
});

test('rechaza variance_type antes de leer o calcular los valores', () => {
  for (const variance_type of [undefined, null, '', 'unknown']) {
    const invalid = { name: 'Datos', variance_type, values: [] };
    assert.throws(() => validateDataset(invalid), /Tipo de varianza/);
  }
});

test('paginación detecta el final exacto y no expone la fila adicional', async () => {
  for (const length of [0, 19, 20, 21]) {
    const rows = Array.from({ length }, (_, id) => ({ ...stored, id }));
    const result = await mock({ data: rows }).service.list('owner');
    assert.deepEqual(result, { rows: rows.slice(0, 20).map(row => ({
      id: row.id, name: row.name, variance_type: row.data.variance_type, created_at: row.created_at
    })), hasNext: length > 20 });
  }
  const { service, calls } = mock({ data: [] });
  for (const page of [-1, 0.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(service.list('owner', page), /Página no válida/);
  }
  assert.equal(calls.length, 0);
});

test('eliminación exige fila afectada y ambos filtros', async () => {
  const { service, calls } = mock({ data: [{ id: 'one' }] });
  await service.remove('owner', 'one');
  assert.ok(calls.some(call => call.join() === 'eq,user_id,owner'));
  assert.ok(calls.some(call => call.join() === 'eq,id,one'));
  await assert.rejects(mock({ data: [] }).service.remove('owner', 'one'), /No se eliminó/);
});

test('operaciones sin sesión no consultan tablas y errores remotos se propagan', async () => {
  const { service, calls } = mock({ error: { code: '42501' } });
  await assert.rejects(service.list(''));
  await assert.rejects(service.save('', dataset));
  await assert.rejects(service.get('', 'one'));
  await assert.rejects(service.remove('', 'one'));
  assert.equal(calls.length, 0);
  await assert.rejects(service.list('owner'), error => error.code === '42501');
  assert.match(errorMessage({ code: '42501' }), /políticas/);
  assert.match(errorMessage({ code: 'email_not_confirmed' }), /Confirma/);
  assert.match(errorMessage({ code: 'invalid_credentials' }), /incorrectos/);
  assert.match(errorMessage(new TypeError('Failed to fetch')), /conexión/);
  assert.doesNotMatch(errorMessage({ message: 'private server detail' }), /private/);
});

test('fetch conserva cancelación y limpia recursos al completar', async () => {
  const original = global.fetch;
  const abort = new AbortController();
  abort.abort();
  global.fetch = async (_url, options) => { assert.equal(options.signal.aborted, true); return 'ok'; };
  try { assert.equal(await timedFetch('https://example.invalid', { signal: abort.signal }), 'ok'); }
  finally { global.fetch = original; }
});

test('configuración faltante no intenta cargar SDK ni conectar', async () => {
  const original = global.document;
  let touched = false;
  global.document = { createElement() { touched = true; throw new Error('No debe cargarse'); } };
  try { await assert.rejects(loadClient({})); assert.equal(touched, false); }
  finally { global.document = original; }
});

test('SDK usa URL y clave publicable con sesión persistente y fetch acotado', async () => {
  const original = global.supabase;
  let received;
  global.supabase = { createClient(...args) { received = args; return 'client'; } };
  try {
    assert.equal(await loadClient(valid), 'client');
    assert.equal(received[0], valid.url);
    assert.equal(received[1], valid.publishableKey);
    assert.deepEqual(received[2].auth, { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true });
    assert.equal(received[2].global.fetch, timedFetch);
    assert.equal(received[2].db.schema, 'public');
  } finally { global.supabase = original; }
});
