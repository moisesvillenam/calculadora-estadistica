(async function () {
  const output = document.getElementById('test-result');
  const passed = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = () => new Promise(resolve => setTimeout(resolve, 40));
  const base = new URL('../', location.href).href;
  let realClient;
  function isolate() {
    // Supabase falls back to its memory adapter when storage is unavailable.
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('Las pruebas no deben acceder a localStorage'); }
    });
    window.fetch = () => { throw new Error('Las pruebas no deben acceder a la red'); };
  }
  function prepareHtml(html, mock) {
    // Parse without executing scripts; attribute order, quotes and whitespace
    // must not decide whether the project's real configuration is loaded.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const configs = [...doc.querySelectorAll('script[src]')].filter(script =>
      new URL(script.getAttribute('src'), base).pathname.endsWith('/supabase-config.js'));
    assert(configs.length === 1, 'Debe existir una única configuración sustituible antes de cargar la aplicación');
    const config = doc.createElement('script');
    if (mock) {
      config.src = 'tests/browser-mock.js';
      config.defer = true;
    } else config.textContent = 'window.CLARA_SUPABASE_CONFIG = {};';
    configs[0].replaceWith(config);
    doc.querySelectorAll('base').forEach(element => element.remove());
    const baseTag = doc.createElement('base');
    baseTag.href = base;
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "connect-src 'none'; form-action 'none'";
    const sandbox = doc.createElement('script');
    sandbox.textContent = `(${isolate.toString()})();`;
    doc.head.prepend(policy, baseTag, sandbox);
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }
  async function frame(html, mock) {
    // Fail closed before attaching a browsing context if replacement fails.
    const source = prepareHtml(html, mock);
    const iframe = document.createElement('iframe');
    iframe.style.width = '390px';
    iframe.style.height = '800px';
    const loaded = new Promise(resolve => { iframe.onload = resolve; });
    iframe.srcdoc = source;
    document.body.append(iframe);
    await loaded;
    await wait();
    return iframe.contentWindow;
  }
  try {
    const html = window.CLARA_TEST_HTML || await (await fetch(new URL('index.html', base))).text();
    const variants = [
      '<script src="supabase-config.js" defer></script>',
      "<SCRIPT defer data-test='a > b' SRC='./supabase-config.js?v=1#config'></SCRIPT>",
      '<script\n defer\n src = supabase-config.js\n></script>'
    ];
    for (const tag of variants) {
      for (const mock of [false, true]) {
        const source = prepareHtml(`<html><head lang="es">${tag}</head><body></body></html>`, mock);
        assert(!source.includes('supabase-config.js'), 'Sustituye configuración independientemente del formato');
        assert(source.includes("connect-src 'none'"), 'Bloquea conexiones antes de ejecutar la aplicación');
      }
    }
    for (const tags of ['', variants[0] + variants[1]]) {
      let rejected = false;
      try { prepareHtml(`<head>${tags}</head>`, false); } catch { rejected = true; }
      assert(rejected, 'Configuración ausente o duplicada impide cargar la aplicación');
    }
    passed.push('Fixtures: sustitución de configuración y bloqueo de conexiones');
    const local = await frame(html, false);
    const l = id => local.document.getElementById(id);
    assert(l('cloud-error').textContent.includes('no está configurado'), 'Mensaje de configuración faltante');
    assert(!local.document.querySelector('script[src*="supabase-js-"]'), 'Sin configuración no se descarga SDK');
    l('example').click();
    assert(l('count').textContent === '7', 'Ejemplo local calcula sin Cloud');
    l('view-points').click();
    assert(local.document.querySelectorAll('#data-chart circle').length === 7, 'Gráfico de puntos local');
    l('simulate').click();
    await wait();
    assert(Number(l('simulation-progress').value) > 0, 'Simulación local funciona');
    l('simulate').click();
    passed.push('Modo local: configuración ausente, cálculos, gráficos y simulación');

    async function importFile(text, name) {
      const transfer = new local.DataTransfer();
      transfer.items.add(new local.File([text], name, { type: 'text/plain' }));
      l('data-file').files = transfer.files;
      l('data-file').dispatchEvent(new local.Event('change', { bubbles: true }));
      for (let i = 0; i < 50 && l('data-file').hasAttribute('aria-busy'); i++) await wait();
      assert(!l('data-file').hasAttribute('aria-busy'), 'La lectura debe finalizar');
    }
    await importFile('1,2\r\n3,4', 'datos.csv');
    assert(l('numbers').value === '1; 2; 3; 4', 'CSV rellena el campo manual');
    assert(l('count').textContent === '4' && l('mean').textContent === '2,5', 'Archivo recalcula resultados');
    assert(local.document.querySelectorAll('#data-chart circle').length === 4, 'Archivo actualiza gráficos');
    assert(l('import-status').textContent.includes('4 valores cargados'), 'Confirma la carga');
    await importFile('valor\n1', 'datos.csv');
    assert(!l('import-error').hidden && l('numbers').value === '1; 2; 3; 4', 'Archivo inválido conserva datos');
    assert(l('mean').textContent === '2,5', 'Archivo inválido conserva resultados');
    await importFile('5; 10\n15', 'datos.txt');
    assert(l('mean').textContent === '10' && l('import-error').hidden, 'TXT carga después de un error');
    l('numbers').value = '2; 6';
    l('numbers').dispatchEvent(new local.Event('input', { bubbles: true }));
    assert(l('mean').textContent === '4' && l('import-status').textContent === '', 'Edición manual sigue funcionando');
    assert(local.document.documentElement.scrollWidth <= local.innerWidth, 'Selector de archivo sin desbordamiento móvil');
    l('clear').click();
    await wait();
    assert(l('numbers').value === '' && l('import-status').textContent === '', 'Limpiar reinicia la importación');
    passed.push('Archivos locales: CSV, TXT, errores sin pérdida de datos, gráficos, edición y limpieza');

    // Exercise the real script loader and browser UMD export with no backend calls.
    const version = window.CLARA_TEST_SDK_VERSION || (await (await fetch(new URL('vendor/supabase-sdk.json', base))).json()).version;
    realClient = await local.ClaraCloud.loadClient({ url: 'https://example.invalid', publishableKey: 'sb_publishable_TEST_ONLY' });
    assert(local.document.querySelector(`script[src="${new URL(`vendor/supabase-js-${version}.js`, base).href}"]`), 'Carga el bundle local de la versión declarada');
    assert(realClient.headers['X-Client-Info'].split(';')[0] === `supabase-js/${version}`, 'El bundle ejecutado declara la versión esperada');
    assert(typeof realClient.auth.signInWithPassword === 'function' && typeof realClient.schema === 'function', 'SDK real expone Auth y consultas');
    const session = await realClient.auth.getSession();
    assert(!session.error && session.data.session === null, 'SDK real inicia sin sesión');
    assert(realClient.auth.memoryStorage && Object.keys(realClient.auth.memoryStorage).length === 0, 'SDK real usa almacenamiento vacío en memoria');
    await realClient.auth.stopAutoRefresh();
    passed.push('SDK oficial: carga local, versión y sesión inicial sin red');

    const win = await frame(html, true);
    const get = id => win.document.getElementById(id);
    const mock = win.Mock;
    win.confirm = () => true;
    function submit(id, button) {
      get(id).dispatchEvent(new win.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: get(button) }));
    }
    get('auth-email').value = 'person@example.invalid';
    get('auth-mode').value = 'signup';
    get('auth-mode').dispatchEvent(new win.Event('change'));
    assert(get('auth-password').autocomplete === 'new-password', 'Registro usa contraseña nueva');
    get('auth-password').value = 'test-password';
    submit('auth-form', 'auth-signup');
    assert(get('auth-fields').disabled, 'Registro muestra carga');
    await wait();
    assert(get('cloud-status').textContent.includes('correo'), 'Registro informa confirmación pendiente');
    assert(get('cloud-signed-in').hidden, 'Registro sin sesión no habilita datasets');
    get('auth-mode').value = 'login';
    get('auth-mode').dispatchEvent(new win.Event('change'));
    assert(get('auth-password').autocomplete === 'current-password', 'Login usa contraseña actual');
    mock.fail = { code: 'invalid_credentials' };
    get('auth-password').value = 'incorrect';
    submit('auth-form', 'auth-login');
    await wait();
    assert(get('cloud-error').textContent.includes('incorrectos'), 'Error de credenciales visible');
    mock.fail = null;
    get('auth-password').value = 'test-password';
    submit('auth-form', 'auth-login');
    await wait();
    assert(!get('cloud-signed-in').hidden && !get('datasets-empty').hidden, 'Login y lista vacía');
    assert(get('auth-password').value === '', 'Contraseña se limpia');
    passed.push('Registro, confirmación, inicio de sesión y errores');

    get('numbers').value = '1; 2; 3; 4';
    get('numbers').dispatchEvent(new win.Event('input'));
    get('calculator').elements.variance.value = 'sample';
    get('dataset-name').value = '<img src=x onerror=alert(1)>';
    submit('dataset-form', 'dataset-save');
    assert(get('dataset-save').disabled, 'Guardar bloquea doble envío');
    submit('dataset-form', 'dataset-save');
    await wait();
    assert(mock.rows.length === 1, 'Un solo guardado');
    assert(JSON.stringify(mock.rows[0].data) === JSON.stringify({ values: [1, 2, 3, 4], variance_type: 'sample' }), 'Guarda valores y varianza dentro de data');
    assert(!('values' in mock.rows[0]) && !('variance_type' in mock.rows[0]), 'No crea columnas inexistentes');
    assert(get('datasets-list').textContent.includes('Muestral'), 'Lista lee la varianza desde data');
    assert(!get('datasets-list').querySelector('img'), 'Nombre remoto se muestra como texto');
    get('numbers').value = '100; 200';
    get('calculator').elements.variance.value = 'population';
    let varianceChanges = 0;
    get('calculator').addEventListener('change', () => { varianceChanges++; });
    get('datasets-list').querySelector('button').click();
    await wait();
    assert(get('numbers').value === '1; 2; 3; 4', 'Recupera números');
    assert(get('calculator').elements.variance.value === 'sample', 'Recupera tipo');
    assert(varianceChanges === 1, 'Recuperación emite change con propagación');
    assert(get('variance-label').textContent === 'Varianza muestral', 'Sincroniza etiqueta de varianza');
    assert(get('count').textContent === '4' && get('mean').textContent === '2,5', 'Recuperar recalcula');
    assert(get('data-chart').querySelectorAll('button').length > 0, 'Recuperar actualiza histograma');
    win.confirm = () => false;
    get('datasets-list').querySelectorAll('button')[1].click();
    await wait();
    assert(mock.rows.length === 1, 'Cancelar borrado conserva dataset');
    win.confirm = () => true;
    get('datasets-list').querySelectorAll('button')[1].click();
    await wait();
    assert(mock.rows.length === 0 && !get('datasets-empty').hidden, 'Eliminar actualiza lista');
    assert(get('numbers').value === '1; 2; 3; 4', 'Eliminar conserva calculadora');
    passed.push('Guardar, recuperar, recalcular y eliminar; doble envío y texto seguro');

    mock.rows = Array.from({ length: 21 }, (_, i) => ({ id: String(i), name: `Dataset ${i}`, data: { values: [1, 2], variance_type: 'population' }, user_id: 'owner', created_at: '2026-10-19' }));
    get('datasets-refresh').click(); await wait();
    assert(get('datasets-list').children.length === 20 && !get('datasets-next').disabled, 'Primera página');
    get('datasets-next').click(); await wait();
    assert(get('datasets-list').children.length === 1 && get('datasets-next').disabled, 'Segunda página');
    mock.fail = { code: '42501' };
    get('datasets-refresh').click(); await wait();
    assert(!get('cloud-error').hidden && !get('datasets-refresh').disabled, 'Error RLS recuperable');
    get('auth-logout').click(); await wait();
    assert(!get('cloud-signed-in').hidden && get('cloud-status').textContent.includes('No se pudo cerrar'), 'Fallo de logout no simula cierre');
    mock.fail = null;
    passed.push('Paginación y errores de permisos y cierre de sesión');

    let release;
    mock.hold = new Promise(resolve => { release = resolve; });
    get('datasets-refresh').click(); await wait();
    assert(get('datasets-refresh').disabled, 'Carga pendiente visible');
    mock.emit(null);
    release({ data: mock.rows, error: null });
    await wait();
    assert(get('datasets-list').children.length === 0 && get('cloud-signed-in').hidden, 'Respuesta antigua no reaparece tras logout externo');
    mock.hold = null;
    mock.emit(mock.user('different-owner')); await wait();
    assert(get('datasets-list').children.length === 0, 'Otra cuenta no ve datos anteriores');
    get('auth-logout').click(); await wait();
    assert(mock.calls.some(call => call[0] === 'logout' && call[1].scope === 'local'), 'Logout local explícito');
    assert(get('cloud-signed-in').hidden && get('numbers').value === '1; 2; 3; 4', 'Logout conserva herramientas locales');
    get('example').click();
    assert(get('count').textContent === '7', 'Calculadora sigue operativa');
    assert(win.document.documentElement.scrollWidth <= win.innerWidth, 'Vista móvil sin desbordamiento');
    passed.push('Cambio de cuenta, respuestas tardías, logout y vista móvil');
    output.dataset.status = 'passed';
    output.textContent = passed.join('\n');
  } catch (error) {
    output.dataset.status = 'failed';
    output.textContent = passed.join('\n') + '\nERROR: ' + error.stack;
  } finally {
    if (realClient) await realClient.auth.stopAutoRefresh();
  }
})();
