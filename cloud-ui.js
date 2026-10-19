(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const cloud = window.ClaraCloud;
  let client, service, subscription, session = null;
  let ready = false, initializing = false, authBusy = false, dataBusy = false, epoch = 0, request = 0, page = 0;
  let hasNext = false, displayedRows = [];
  const notify = message => { get('cloud-status').textContent = message; };
  const clearError = () => { get('cloud-error').hidden = true; get('cloud-error').textContent = ''; };
  const showError = error => {
    get('cloud-error').textContent = cloud.errorMessage(error);
    get('cloud-error').hidden = false;
  };

  function controls() {
    get('auth-form').hidden = !ready || !!session;
    get('cloud-signed-in').hidden = !ready || !session;
    get('auth-fields').disabled = authBusy;
    get('auth-form').setAttribute('aria-busy', String(authBusy));
    get('cloud-signed-in').setAttribute('aria-busy', String(dataBusy));
    get('auth-logout').disabled = authBusy;
    ['dataset-save', 'datasets-refresh', 'dataset-name'].forEach(id => { get(id).disabled = dataBusy || authBusy; });
    get('datasets-list').querySelectorAll('button').forEach(button => { button.disabled = dataBusy || authBusy; });
    get('datasets-prev').disabled = dataBusy || authBusy || page === 0;
    get('datasets-next').disabled = dataBusy || authBusy || !hasNext;
    get('datasets-page').textContent = `Página ${page + 1}`;
  }

  function setSession(next) {
    const changed = session?.user.id !== next?.user.id;
    session = next;
    get('cloud-account').textContent = session?.user.email || (session ? 'Sesión iniciada' : 'Sin sesión');
    if (changed) {
      epoch++;
      request++;
      dataBusy = false;
      page = 0;
      hasNext = false;
      displayedRows = [];
      get('datasets-list').replaceChildren();
      get('datasets-empty').hidden = true;
      get('dataset-name').value = '';
      get('auth-password').value = '';
      clearError();
      notify(session ? 'Sesión iniciada.' : 'Sesión cerrada. Tus herramientas locales siguen disponibles.');
      // Never call Supabase asynchronously inside onAuthStateChange's auth lock.
      if (session) setTimeout(() => { if (session && !dataBusy) refresh(); }, 0);
    }
    controls();
  }

  async function datasetTask(message, action) {
    if (!session || dataBusy || authBusy) return;
    const owner = session.user.id, version = epoch, token = ++request;
    const current = () => epoch === version && request === token;
    dataBusy = true;
    clearError();
    notify(message);
    controls();
    try { await action(owner, current); }
    catch (error) { if (current()) { showError(error); notify('La operación no se completó. Puedes reintentar.'); } }
    finally { if (current()) { dataBusy = false; controls(); } }
  }

  function renderRows(result) {
    const { rows } = result;
    displayedRows = rows;
    hasNext = result.hasNext;
    const elements = rows.map(row => {
      const li = document.createElement('li');
      const title = document.createElement('span');
      title.textContent = row.name;
      const detail = document.createElement('small');
      const date = new Date(row.created_at);
      detail.textContent = `${row.variance_type === 'sample' ? 'Muestral' : 'Poblacional'} · ${Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es')}`;
      title.append(detail);
      const actions = document.createElement('div');
      for (const [label, handler] of [['Recuperar', () => recover(row)], ['Eliminar', () => remove(row)]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'clear-button';
        button.textContent = label;
        button.setAttribute('aria-label', `${label} ${row.name}`);
        button.addEventListener('click', handler);
        actions.append(button);
      }
      li.append(title, actions);
      return li;
    });
    get('datasets-list').replaceChildren(...elements);
    get('datasets-empty').textContent = page ? 'No hay más datasets en esta página.' : 'No tienes datasets guardados todavía.';
    get('datasets-empty').hidden = rows.length !== 0;
    controls();
  }

  async function loadPage(owner, target, current) {
    let result = await service.list(owner, target);
    if (!current()) return;
    // Other sessions may have removed several pages since the previous refresh.
    while (target > 0 && result.rows.length === 0) {
      result = await service.list(owner, --target);
      if (!current()) return;
    }
    page = target;
    renderRows(result);
  }

  function refresh(target = page) {
    return datasetTask('Cargando datasets…', async (owner, current) => {
      await loadPage(owner, target, current);
      if (current()) notify('Lista actualizada.');
    });
  }

  function recover(row) {
    return datasetTask('Recuperando dataset…', async (owner, current) => {
      const dataset = await service.get(owner, row.id);
      if (!current()) return;
      if (get('numbers').value.trim() && !window.confirm(`¿Reemplazar los datos actuales de la calculadora con «${dataset.name}»?`)) {
        notify('Recuperación cancelada.');
        return;
      }
      get('calculator').elements.variance.value = dataset.variance_type;
      get('numbers').value = dataset.values.join('; ');
      get('calculator').querySelector('input[name="variance"]:checked').dispatchEvent(new Event('change', { bubbles: true }));
      get('numbers').dispatchEvent(new Event('input', { bubbles: true }));
      get('dataset-name').value = dataset.name;
      notify(`«${dataset.name}» recuperado en la calculadora.`);
      get('numbers').focus();
    });
  }

  function remove(row) {
    if (!window.confirm(`¿Eliminar definitivamente «${row.name}» de tu cuenta? Los números de la calculadora se conservan.`)) return;
    return datasetTask('Eliminando dataset…', async (owner, current) => {
      await service.remove(owner, row.id);
      if (!current()) return;
      renderRows({ rows: displayedRows.filter(item => item.id !== row.id), hasNext });
      notify('Dataset eliminado.');
      try {
        await loadPage(owner, page, current);
      } catch (error) {
        if (current()) { showError(error); notify('Dataset eliminado. No se pudo actualizar la lista; pulsa Actualizar lista.'); }
      }
    });
  }

  get('dataset-form').addEventListener('submit', event => {
    event.preventDefault();
    datasetTask('Guardando dataset…', async (owner, current) => {
      const payload = {
        name: get('dataset-name').value,
        values: window.Statistics.parseNumbers(get('numbers').value),
        variance_type: get('calculator').elements.variance.value
      };
      await service.save(owner, payload);
      if (!current()) return;
      notify('Dataset guardado.');
      try {
        await loadPage(owner, 0, current);
      } catch (error) {
        if (current()) { showError(error); notify('Dataset guardado. No se pudo actualizar la lista; pulsa Actualizar lista antes de volver a guardar.'); }
      }
    });
  });

  function syncAuthMode() {
    const signup = get('auth-mode').value === 'signup';
    get('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    get('auth-password').minLength = signup ? 8 : 1;
    get('auth-login').hidden = signup;
    get('auth-signup').hidden = !signup;
    get('auth-help').textContent = signup ? 'Usa al menos 8 caracteres. Es posible que debas confirmar tu correo.' : 'Introduce la contraseña de tu cuenta.';
  }
  get('auth-mode').addEventListener('change', () => {
    get('auth-password').value = '';
    clearError();
    syncAuthMode();
  });
  syncAuthMode();

  get('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || authBusy) return;
    const signup = get('auth-mode').value === 'signup';
    const password = get('auth-password').value;
    clearError();
    if (signup && password.length < 8) { showError(new Error('Usa al menos 8 caracteres para crear tu cuenta.')); return; }
    authBusy = true;
    controls();
    notify(signup ? 'Creando cuenta…' : 'Iniciando sesión…');
    try {
      const credentials = { email: get('auth-email').value.trim(), password };
      const { data, error } = signup ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
      if (error) throw error;
      setSession(data.session);
      notify(data.session ? 'Sesión iniciada.' : 'Si el registro requiere confirmación, recibirás un correo. Revisa tu bandeja y luego inicia sesión.');
    } catch (error) { showError(error); notify('No se pudo completar el acceso.'); }
    finally { get('auth-password').value = ''; authBusy = false; controls(); }
  });

  get('auth-logout').addEventListener('click', async () => {
    if (authBusy) return;
    authBusy = true;
    controls();
    clearError();
    notify('Cerrando sesión…');
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setSession(null);
      notify('Sesión cerrada en este dispositivo. Los datos actuales siguen en la calculadora.');
    } catch (error) { showError(error); notify('No se pudo cerrar la sesión. Revisa la conexión y reintenta.'); }
    finally { authBusy = false; controls(); }
  });

  get('datasets-refresh').addEventListener('click', () => refresh());
  get('datasets-prev').addEventListener('click', () => { if (page > 0) return refresh(page - 1); });
  get('datasets-next').addEventListener('click', () => { if (hasNext) return refresh(page + 1); });

  async function initialize() {
    if (initializing) return;
    initializing = true;
    get('cloud-retry').hidden = true;
    clearError();
    notify('Conectando con Clara Cloud…');
    try {
      if (!client) { client = await cloud.loadClient(window.CLARA_SUPABASE_CONFIG); service = cloud.createService(client); }
      subscription?.unsubscribe();
      ready = true;
      subscription = client.auth.onAuthStateChange((_event, next) => setSession(next)).data.subscription;
      const version = epoch;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (epoch === version) setSession(data.session);
      if (!session) notify('Inicia sesión o crea tu cuenta. También puedes continuar sin cuenta.');
      controls();
    } catch (error) {
      ready = false;
      subscription?.unsubscribe();
      setSession(null);
      showError(error);
      notify('Modo local disponible.');
      get('cloud-retry').hidden = false;
    } finally { initializing = false; }
  }
  get('cloud-retry').addEventListener('click', initialize);
  window.addEventListener('offline', () => notify('Sin conexión. Las herramientas locales siguen disponibles; las operaciones Cloud requieren Internet.'));
  window.addEventListener('online', () => notify('Conexión recuperada. Puedes reintentar las operaciones de Clara Cloud.'));
  initialize();
})();
