// Fixtures only: no valid credentials and no external network calls.
window.CLARA_SUPABASE_CONFIG = { url: 'https://example.invalid', publishableKey: 'sb_publishable_TEST_ONLY' };
window.Mock = { session: null, rows: [], calls: [], fail: null, hold: null, nextId: 1, listeners: [] };
const mock = window.Mock;
mock.emit = session => {
  mock.session = session;
  mock.listeners.forEach(callback => callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
};
mock.user = id => ({ user: { id, email: `${id}@example.invalid` } });
const client = {
  auth: {
    onAuthStateChange(callback) { mock.listeners.push(callback); return { data: { subscription: { unsubscribe() { mock.listeners = mock.listeners.filter(item => item !== callback); } } } }; },
    async getSession() { return { data: { session: mock.session }, error: null }; },
    async signUp(credentials) { mock.calls.push(['signup', credentials]); return { data: { session: null }, error: null }; },
    async signInWithPassword(credentials) {
      mock.calls.push(['login', credentials]);
      if (mock.fail) return { error: mock.fail };
      mock.emit(mock.user('owner'));
      return { data: { session: mock.session }, error: null };
    },
    async signOut(options) {
      mock.calls.push(['logout', options]);
      if (mock.fail) return { error: mock.fail };
      mock.emit(null);
      return { error: null };
    }
  },
  schema(name) { mock.calls.push(['schema', name]); return this; },
  from(table) {
    mock.calls.push(['from', table]);
    let action = 'list', payload, single = false, start = 0, end = 19;
    const filters = {};
    const query = {
      select() { return this; },
      eq(key, value) { filters[key] = value; return this; },
      order() { return this; },
      range(from, to) { start = from; end = to; return this; },
      single() { single = true; return this; },
      insert(value) { action = 'insert'; payload = value; return this; },
      delete() { action = 'delete'; return this; },
      then(resolve, reject) {
        mock.calls.push([action, { ...filters }]);
        if (mock.hold && action === 'list') return mock.hold.then(resolve, reject);
        if (mock.fail) return Promise.resolve({ error: mock.fail }).then(resolve, reject);
        let data;
        const matching = mock.rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        if (action === 'insert') {
          const row = { ...payload, id: String(mock.nextId++), created_at: '2026-10-19T12:00:00Z' };
          mock.rows.unshift(row); data = row;
        } else if (action === 'delete') {
          mock.rows = mock.rows.filter(row => !matching.includes(row)); data = matching;
        } else data = single ? matching[0] : matching.slice(start, end + 1);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return query;
  }
};
window.supabase = { createClient: () => client };
