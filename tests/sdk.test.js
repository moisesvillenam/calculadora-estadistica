const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = { url: 'https://example.invalid', publishableKey: 'sb_publishable_TEST_ONLY_NOT_A_CREDENTIAL' };

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
  const version = require('../package.json').dependencies['@supabase/supabase-js'];
  assert.equal(version, '2.49.10');
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
