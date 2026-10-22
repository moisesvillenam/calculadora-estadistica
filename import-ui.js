(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const picker = get('data-file');
  const numbers = get('numbers');
  const form = get('calculator');
  const status = get('import-status');
  const error = get('import-error');
  let revision = 0;

  function invalidate() {
    revision++;
    status.textContent = '';
    error.textContent = '';
    error.hidden = true;
    picker.removeAttribute('aria-invalid');
    picker.removeAttribute('aria-busy');
  }

  numbers.addEventListener('input', invalidate);
  form.addEventListener('reset', invalidate);
  get('example').addEventListener('click', invalidate);
  form.querySelectorAll('input[name="variance"]').forEach(radio => radio.addEventListener('change', invalidate));

  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    if (!file) return;
    invalidate();
    const current = revision;
    const previous = numbers.value;
    // Allow selecting the same file again, including after a read failure.
    picker.value = '';
    status.textContent = 'Leyendo archivo…';
    picker.setAttribute('aria-busy', 'true');
    try {
      const values = await DataImport.readFile(file);
      if (current !== revision || previous !== numbers.value) return;
      Statistics.calculateStatistics(values, form.elements.variance.value);
      numbers.value = values.join('; ');
      numbers.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = `${file.name}: ${values.length} valores cargados. Se reemplazaron los datos anteriores.`;
    } catch (exception) {
      if (current !== revision || previous !== numbers.value) return;
      status.textContent = '';
      error.textContent = exception.message;
      error.hidden = false;
      picker.setAttribute('aria-invalid', 'true');
    } finally {
      if (current === revision) picker.removeAttribute('aria-busy');
    }
  });
})();
