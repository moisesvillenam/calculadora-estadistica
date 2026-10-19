(function (root) {
  'use strict';
  const MAX_VALUES = 10000;

  function parseNumbers(text) {
    if (typeof text !== 'string') throw new TypeError('Introduce los datos como texto.');
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Introduce al menos un número para calcular.');
    if (trimmed.includes(',')) {
      throw new Error('No uses comas: usa un punto para los decimales (3.5) y separa los valores con espacios, punto y coma o saltos de línea.');
    }
    const tokens = trimmed.split(/[\s;]+/).filter(Boolean);
    if (!tokens.length) throw new Error('Introduce al menos un número para calcular.');
    if (tokens.length > MAX_VALUES) throw new Error('Puedes calcular hasta 10 000 números a la vez.');
    return tokens.map((token, index) => {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) {
        throw new Error(`El dato ${index + 1} no es válido. Usa números y un punto para los decimales.`);
      }
      const number = Number(token);
      if (!Number.isFinite(number)) throw new Error(`El dato ${index + 1} está fuera del rango permitido.`);
      return number;
    });
  }

  function calculateStatistics(values, type = 'population') {
    if (!Array.isArray(values) || !values.length || Array.from(values).some(value => !Number.isFinite(value))) {
      throw new Error('Introduce un conjunto de números finitos.');
    }
    if (values.length > MAX_VALUES) throw new Error('Puedes calcular hasta 10 000 números a la vez.');
    if (!['population', 'sample'].includes(type)) throw new Error('Tipo de varianza no válido.');
    if (type === 'sample' && values.length < 2) {
      throw new Error('La varianza y la desviación estándar muestrales necesitan al menos dos números.');
    }
    // Welford avoids subtracting large, nearly equal squared sums.
    let mean = 0;
    let squaredDeviations = 0;
    values.forEach((value, index) => {
      const delta = value - mean;
      mean += delta / (index + 1);
      squaredDeviations += delta * (value - mean);
    });
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
    const variance = Math.max(0, squaredDeviations / (values.length - (type === 'sample' ? 1 : 0)));
    if (![mean, median, variance].every(Number.isFinite)) {
      throw new Error('Los valores son demasiado grandes para calcular con precisión. Usa números de menor magnitud.');
    }
    const standardDeviation = Math.sqrt(variance);
    return { mean, median, variance, standardDeviation, count: values.length, min: sorted[0], max: sorted[sorted.length - 1] };
  }

  const api = { parseNumbers, calculateStatistics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Statistics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
