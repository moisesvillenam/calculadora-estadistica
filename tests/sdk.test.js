const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createHash } = require('node:crypto');
const version = require('@supabase/supabase-js/package.json').version;
const manifest = require('../vendor/supabase-sdk.json');
const bundle = fs.readFileSync(path.join(__dirname, '../vendor', manifest.file));
const config = { url: 'https://example.invalid', publishableKey: 'sb_publishable_TEST_ONLY_NOT_A_CREDENTIAL' };

test('dependencia, lockfile, manifiesto y bytes UMD coinciden con el SDK instalado', () => {
  assert.equal(require('../package.json').dependencies['@supabase/supabase-js'], version);
  const lock = require('../package-lock.json');
  assert.equal(lock.packages[''].dependencies['@supabase/supabase-js'], version);
  assert.equal(lock.packages['node_modules/@supabase/supabase-js'].version, version);
  assert.equal(manifest.package, '@supabase/supabase-js');
  assert.equal(manifest.version, version);
  assert.equal(manifest.file, `supabase-js-${version}.js`);
  assert.equal(createHash('sha256').update(bundle).digest('hex'), manifest.sha256);
  const installed = path.dirname(require.resolve('@supabase/supabase-js/package.json'));
  assert.ok(bundle.equals(fs.readFileSync(path.join(installed, 'dist/umd/supabase.js'))));
});

function setup() {
  const scripts = [], timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    URL, Statistics: require('../statistics.js'),
    document: {
      currentScript: { src: 'https://app.example.invalid/clara/cloud-service.js' },
      baseURI: 'https://app.example.invalid/clara/',
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { append(script) { scripts.push(script); } }
    },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../cloud-service.js'), 'utf8'), context);
  return { context, scripts, timers, load: () => context.ClaraCloud.loadClient(config) };
}

test('carga concurrente comparte un único script local con versión fija y limpia recursos', async () => {
  const sdk = setup();
  const first = sdk.load(), second = sdk.load();
  assert.equal(sdk.scripts.length, 1);
  const script = sdk.scripts[0];
  assert.equal(script.src, `https://app.example.invalid/clara/vendor/supabase-js-${version}.js`);
  assert.equal(script.async, true);
  sdk.context.supabase = { createClient: () => 'client' };
  script.onload();
  assert.deepEqual(await Promise.all([first, second]), ['client', 'client']);
  assert.equal(sdk.timers.size, 0);
  assert.equal(script.onload, null);
  assert.equal(script.onerror, null);
  assert.equal(await sdk.load(), 'client');
  assert.equal(sdk.scripts.length, 1);
});

for (const failure of ['error', 'timeout', 'invalid']) {
  test(`fallo SDK (${failure}) rechaza todos los consumidores, limpia y permite reintentar`, async () => {
    const sdk = setup();
    const pending = [sdk.load(), sdk.load()];
    const script = sdk.scripts[0];
    const lateLoad = script.onload;
    const checks = pending.map(promise => assert.rejects(promise));
    if (failure === 'error') script.onerror();
    else if (failure === 'timeout') [...sdk.timers.values()][0]();
    else { sdk.context.supabase = { createClient: 'invalid' }; script.onload(); }
    await Promise.all(checks);
    assert.equal(script.removed, true);
    assert.equal(sdk.timers.size, 0);
    assert.equal(script.onload, null);
    lateLoad(); // A late event cannot settle an already failed attempt again.
    sdk.context.supabase = undefined;
    const retry = sdk.load();
    assert.equal(sdk.scripts.length, 2);
    sdk.context.supabase = { createClient: () => 'retried' };
    sdk.scripts[1].onload();
    assert.equal(await retry, 'retried');
  });
}

test('bundle UMD real: versión en peticiones, Auth y CRUD con transporte simulado', async t => {
  const sdk = setup();
  const requests = [], events = [];
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'person@example.invalid' };
  const row = { id: '00000000-0000-4000-8000-000000000002', name: 'Ejemplo', user_id: user.id,
    data: { values: [1, 2, 3], variance_type: 'sample' }, created_at: '2026-10-19T12:00:00Z' };
  const token = ['header', 'payload'].map(() => Buffer.from(JSON.stringify({ sub: user.id,
    exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')).join('.') + '.signature';
  let rows = [];
  Object.assign(sdk.context, {
    Headers, Request, Response, AbortController, TextEncoder, TextDecoder, WebSocket,
    setTimeout, clearTimeout, setInterval, clearInterval, console,
    async fetch(input, options) {
      const url = new URL(input), headers = new Headers(options.headers);
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ url, method, headers, body });
      assert.equal(url.origin, config.url);
      assert.equal(headers.get('apikey'), config.publishableKey);
      assert.equal(headers.get('x-client-info').split(';')[0], `supabase-js/${version}`);
      let data;
      if (url.pathname === '/auth/v1/signup') data = { user, session: null };
      else if (url.pathname === '/auth/v1/token') {
        assert.equal(url.searchParams.get('grant_type'), 'password');
        data = { user, access_token: token, refresh_token: 'TEST_ONLY', token_type: 'bearer', expires_in: 3600 };
      } else if (url.pathname === '/auth/v1/logout') {
        assert.equal(url.searchParams.get('scope'), 'local');
        assert.equal(headers.get('authorization'), `Bearer ${token}`);
        return new Response(null, { status: 204 });
      } else {
        assert.equal(url.pathname, '/rest/v1/datasets');
        assert.equal(headers.get('authorization'), `Bearer ${token}`);
        assert.equal(headers.get(method === 'GET' ? 'accept-profile' : 'content-profile'), 'public');
        if (method === 'POST') {
          assert.deepEqual(body, { name: row.name, data: row.data, user_id: user.id });
          rows = [row]; data = { id: row.id };
        } else {
          assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`);
          if (url.searchParams.has('id')) assert.equal(url.searchParams.get('id'), `eq.${row.id}`);
          if (method === 'DELETE') { data = rows.map(item => ({ id: item.id })); rows = []; }
          else {
            assert.equal(method, 'GET');
            if (!url.searchParams.has('id')) {
              assert.equal(url.searchParams.get('offset'), '0');
              assert.equal(url.searchParams.get('limit'), '21');
            }
            data = rows;
          }
        }
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const loading = sdk.load();
  assert.equal(sdk.scripts[0].src, `https://app.example.invalid/clara/vendor/${manifest.file}`);
  vm.runInContext(bundle.toString('utf8'), sdk.context, { filename: manifest.file });
  sdk.scripts[0].onload();
  const client = await loading;
  t.after(() => client.auth.stopAutoRefresh());
  const { data: { subscription } } = client.auth.onAuthStateChange(event => events.push(event));
  t.after(() => subscription.unsubscribe());
  assert.equal(client.auth.persistSession, true);
  assert.equal(client.auth.autoRefreshToken, true);
  assert.equal(client.auth.detectSessionInUrl, true);
  assert.equal((await client.auth.getSession()).data.session, null);
  const credentials = { email: user.email, password: 'TEST_ONLY_PASSWORD' };
  const signup = await client.auth.signUp(credentials);
  assert.equal(signup.error, null);
  assert.equal(signup.data.session, null);
  const login = await client.auth.signInWithPassword(credentials);
  assert.equal(login.error, null);
  assert.equal((await client.auth.getSession()).data.session.user.id, user.id);
  const service = sdk.context.ClaraCloud.createService(client);
  assert.equal((await service.save(user.id, { name: row.name, ...row.data })).id, row.id);
  const page = await service.list(user.id);
  assert.equal(page.rows.length, 1);
  assert.equal(page.hasNext, false);
  assert.equal(page.rows[0].variance_type, 'sample');
  const dataset = await service.get(user.id, row.id);
  assert.deepEqual(Array.from(dataset.values), row.data.values);
  assert.equal(dataset.variance_type, 'sample');
  await service.remove(user.id, row.id);
  await assert.rejects(service.get(user.id, row.id), /ya no está disponible/);
  assert.equal((await client.auth.signOut({ scope: 'local' })).error, null);
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.ok(events.includes('SIGNED_IN'));
  assert.ok(events.includes('SIGNED_OUT'));
  assert.equal(requests.length, 8);
});
