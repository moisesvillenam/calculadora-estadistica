'use strict';

const form = document.getElementById('calculator');
const input = document.getElementById('numbers');
const error = document.getElementById('error');
const status = document.getElementById('status');
const note = document.getElementById('result-note');
const resultKeys = ['mean', 'median', 'variance', 'standardDeviation', 'count', 'min', 'max'];
const formatter = new Intl.NumberFormat('es', { maximumFractionDigits: 6 });
const scientificFormatter = new Intl.NumberFormat('es', { notation: 'scientific', maximumFractionDigits: 6 });

function formatNumber(value) {
  const magnitude = Math.abs(value);
  return (magnitude !== 0 && (magnitude < 0.000001 || magnitude >= 1e12)
    ? scientificFormatter : formatter).format(Object.is(value, -0) ? 0 : value);
}

function syncType() {
  const isSample = form.elements.variance.value === 'sample';
  document.getElementById('mean-symbol').textContent = isSample ? 'x̄' : 'μ';
  document.getElementById('variance-label').textContent = isSample ? 'Varianza muestral' : 'Varianza poblacional';
  document.getElementById('variance-symbol').textContent = isSample ? 's²' : 'σ²';
  document.getElementById('standard-deviation-label').textContent = isSample ? 'Desviación estándar muestral' : 'Desviación estándar poblacional';
  document.getElementById('standard-deviation-symbol').textContent = isSample ? 's' : 'σ';
  document.querySelectorAll('[data-statistics-type]').forEach(formula => {
    formula.hidden = formula.dataset.statisticsType !== form.elements.variance.value;
  });
}

function resetResults() {
  resultKeys.forEach(key => { document.getElementById(key).textContent = '—'; });
  status.textContent = 'En espera';
  note.textContent = 'Introduce tus números para descubrir sus estadísticas.';
  syncType();
}

function clearError() {
  error.hidden = true;
  error.textContent = '';
  input.removeAttribute('aria-invalid');
}

function calculate({ focusOnError = true } = {}) {
  clearError();
  resetResults();
  try {
    const values = Statistics.parseNumbers(input.value);
    const result = Statistics.calculateStatistics(values, form.elements.variance.value);
    resultKeys.forEach(key => { document.getElementById(key).textContent = formatNumber(result[key]); });
    status.textContent = 'Calculado';
    note.textContent = 'Resultados redondeados a un máximo de 6 decimales. Los valores muy pequeños o grandes usan notación científica.';
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    status.textContent = 'Revisa los datos';
    if (focusOnError) input.focus();
  }
}

form.addEventListener('submit', event => { event.preventDefault(); calculate(); });
input.addEventListener('input', () => { clearError(); resetResults(); });
form.querySelectorAll('input[name="variance"]').forEach(radio => {
  radio.addEventListener('change', () => {
    clearError();
    if (input.value.trim()) calculate({ focusOnError: false });
    else resetResults();
  });
});
document.getElementById('example').addEventListener('click', () => {
  input.value = '8; 12; 15; 10; 20; 15; 18';
  calculate();
});
document.getElementById('clear').addEventListener('click', () => {
  form.reset();
  input.focus();
});
form.addEventListener('reset', () => {
  // The reset event fires before the browser restores each control's default.
  queueMicrotask(() => {
    clearError();
    resetResults();
  });
});

// Browsers can restore controls when returning to this page.
window.addEventListener('pageshow', () => {
  clearError();
  resetResults();
});
resetResults();
