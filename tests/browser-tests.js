(async function () {
  const output = document.getElementById('test-result');
  const passed = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = () => new Promise(resolve => setTimeout(resolve, 40));
  const base = new URL('../', location.href).href;
  const html = window.CLARA_TEST_HTML || await (await fetch(new URL('index.html', base))).text();
  const configTag = '<script src="supabase-config.js" defer></script>';
  async function frame(mock) {
    assert(html.includes(configTag), 'Debe poder sustituirse la configuración antes de cargar la aplicación');
    const iframe = document.createElement('iframe');
    iframe.style.width = '390px';
    iframe.style.height = '800px';
    const loaded = new Promise(resolve => { iframe.onload = resolve; });
    // Never read the project's real URL/key, even when Cloud is configured locally.
    const configScript = mock ? '<script src="tests/browser-mock.js" defer></script>'
      : '<script>window.CLARA_SUPABASE_CONFIG = {};</script>';
    iframe.srcdoc = html.replace('<head>', `<head><base href="${base}">`)
      .replace(configTag, configScript);
    document.body.append(iframe);
    await loaded;
    await wait();
    return iframe.contentWindow;
  }
  try {
    const local = await frame(false);
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

    // Exercise the real script loader and browser UMD export with no backend calls.
    const version = window.CLARA_TEST_SDK_VERSION || (await (await fetch(new URL('vendor/supabase-sdk.json', base))).json()).version;
    local.fetch = () => { throw new Error('La prueba del SDK no debe acceder a la red'); };
    const realClient = await local.ClaraCloud.loadClient({ url: 'https://example.invalid', publishableKey: 'sb_publishable_TEST_ONLY' });
    assert(local.document.querySelector(`script[src="${new URL(`vendor/supabase-js-${version}.js`, base).href}"]`), 'Carga el bundle local de la versión declarada');
    assert(realClient.headers['X-Client-Info'].split(';')[0] === `supabase-js/${version}`, 'El bundle ejecutado declara la versión esperada');
    assert(typeof realClient.auth.signInWithPassword === 'function' && typeof realClient.schema === 'function', 'SDK real expone Auth y consultas');
    const session = await realClient.auth.getSession();
    assert(!session.error && session.data.session === null, 'SDK real inicia sin sesión');
    await realClient.auth.stopAutoRefresh();
    passed.push('SDK oficial: carga local, versión y sesión inicial sin red');

    const win = await frame(true);
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
  }
})();
