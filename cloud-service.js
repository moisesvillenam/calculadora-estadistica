(function (root) {
  'use strict';
  const statistics = typeof module !== 'undefined' && module.exports ? require('./statistics.js') : root.Statistics;
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.10/dist/umd/supabase.js';

  function validateConfig(config) {
    if (!config || !config.url || !config.publishableKey ||
        /REEMPLAZAR/.test(config.url + config.publishableKey)) {
      throw new Error('Clara Cloud no está configurado. Completa los marcadores de supabase-config.js. Puedes seguir usando todas las herramientas locales.');
    }
    let url;
    try { url = new URL(config.url); } catch { throw new Error('La URL de Supabase no es válida.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Usa la URL HTTPS del proyecto Supabase, sin rutas ni credenciales.');
    }
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) {
      throw new Error('Usa únicamente una clave publicable sb_publishable_. No se admiten claves secretas ni claves JWT.');
    }
    return { url: url.origin, publishableKey: config.publishableKey };
  }

  // Bound network waits, including Supabase Auth; preserve caller cancellation.
  async function timedFetch(url, options = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 15000);
    try { return await root.fetch(url, { ...options, signal: controller.signal }); }
    finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async function loadClient(config) {
    const valid = validateConfig(config);
    if (!root.supabase?.createClient) {
      await new Promise((resolve, reject) => {
        const script = root.document.createElement('script');
        const finish = error => {
          clearTimeout(timer);
          script.onload = script.onerror = null;
          if (error) { script.remove(); reject(error); } else resolve();
        };
        const timer = setTimeout(() => finish(new Error('La carga de Clara Cloud tardó demasiado. Revisa tu conexión y reintenta.')), 10000);
        script.src = SDK_URL;
        script.async = true;
        script.onload = () => finish();
        script.onerror = () => finish(new Error('No se pudo cargar Clara Cloud. Revisa tu conexión y reintenta.'));
        root.document.head.append(script);
      });
    }
    return root.supabase.createClient(valid.url, valid.publishableKey, {
      db: { schema: 'public' },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: timedFetch }
    });
  }

  function validateDataset(dataset) {
    if (typeof dataset?.name !== 'string' || !dataset.name.trim() || dataset.name.trim().length > 100) {
      throw new Error('Escribe un nombre de entre 1 y 100 caracteres.');
    }
    const values = dataset.values;
    statistics.calculateStatistics(values, dataset.variance_type);
    if (!['population', 'sample'].includes(dataset.variance_type)) throw new Error('Tipo de varianza no válido.');
    return { name: dataset.name.trim(), values: [...values], variance_type: dataset.variance_type };
  }

  function errorMessage(error) {
    if (error?.code === 'invalid_credentials') return 'Correo o contraseña incorrectos.';
    if (error?.code === 'email_not_confirmed') return 'Confirma tu correo antes de iniciar sesión.';
    if (error?.code === 'weak_password') return 'La contraseña no cumple los requisitos del proyecto.';
    if (error?.status === 429 || /rate_limit/.test(error?.code || '')) return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
    if (['42P01', 'PGRST205', '42703', 'PGRST204', '42501'].includes(error?.code)) {
      return 'No se pudo acceder a Mis datasets. Revisa el esquema public.datasets y sus políticas de acceso según la documentación del proyecto.';
    }
    if (error?.status === 401 || error?.code === 'PGRST301') return 'La sesión no es válida. Cierra sesión y vuelve a entrar.';
    if (/fetch|network|abort|timeout/i.test(error?.message || '') || error?.name === 'AbortError') {
      return 'No se pudo completar la conexión. Reintenta cuando tengas acceso a Internet. Si estabas guardando, actualiza la lista antes de repetir para evitar duplicados.';
    }
    // Only locally constructed Errors may provide user-facing text; never echo server details.
    return error instanceof Error && !error.code && !error.status ? error.message : 'No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.';
  }

  function createService(client) {
    const table = userId => {
      if (typeof userId !== 'string' || !userId) throw new Error('Inicia sesión para acceder a tus datasets.');
      return client.schema('public').from('datasets');
    };
    const unwrap = response => {
      if (response.error) throw response.error;
      return response.data;
    };
    return {
      async list(userId, page = 0) {
        return unwrap(await table(userId).select('id,name,variance_type,created_at')
          .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(page * 20, page * 20 + 19));
      },
      async save(userId, dataset) {
        const payload = validateDataset(dataset);
        return unwrap(await table(userId).insert({ ...payload, user_id: userId }).select('id').single());
      },
      async get(userId, id) {
        const row = unwrap(await table(userId).select('id,name,values,variance_type')
          .eq('user_id', userId).eq('id', id).single());
        if (!row) throw new Error('Este dataset ya no está disponible. Actualiza la lista.');
        return { id: row.id, ...validateDataset(row) };
      },
      async remove(userId, id) {
        const rows = unwrap(await table(userId).delete().eq('user_id', userId).eq('id', id).select('id'));
        if (!rows?.length) throw new Error('No se eliminó el dataset. Puede que ya no exista o que no tengas acceso. Actualiza la lista.');
      }
    };
  }

  const api = { validateConfig, validateDataset, createService, loadClient, errorMessage, timedFetch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClaraCloud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
