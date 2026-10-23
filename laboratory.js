(function (root) {
  'use strict';
  // Pure helpers shared by the browser and dependency-free Node tests.
  function validate(values) {
    if (!Array.isArray(values) || !values.length || values.length > 10000 ||
        Array.from(values).some(value => !Number.isFinite(value))) {
      throw new Error('Se requieren entre 1 y 10 000 números finitos.');
    }
  }

  function histogram(values, count = 8, domain) {
    validate(values);
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('Intervalos no válidos.');
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    if (domain !== undefined && (!Array.isArray(domain) || domain.length !== 2 ||
        !domain.every(Number.isFinite) || domain[0] > dataMin || domain[1] < dataMax)) {
      throw new Error('El dominio debe contener todos los datos.');
    }
    const [min, max] = domain || [dataMin, dataMax];
    if (min === max) return [{ from: min, to: max, count: values.length }];
    // Scale before subtracting so even finite opposite extremes have safe bins.
    const scale = Number.isFinite(max - min) ? 1 : Math.max(Math.abs(min), Math.abs(max));
    const low = min / scale;
    const span = max / scale - low;
    const edge = i => i === 0 ? min : i === count ? max : (low + span * (i / count)) * scale;
    const bins = Array.from({ length: count }, (_, i) => ({ from: edge(i), to: edge(i + 1), count: 0 }));
    for (const value of values) {
      const index = Math.min(count - 1, Math.max(0, Math.floor((value / scale - low) / span * count)));
      bins[index].count++;
    }
    return bins;
  }

  function seededRandom(seed = 2026) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function validateSampling(values, size, method) {
    validate(values);
    if (!['replacement', 'simple', 'systematic'].includes(method)) throw new Error('Tipo de muestreo no válido.');
    if (!Number.isInteger(size) || size < 1 || size > 10000) throw new Error('El tamaño debe ser un entero entre 1 y 10 000.');
    if (method !== 'replacement' && size > values.length) throw new Error('Sin reemplazo, la muestra no puede superar la población.');
  }

  function drawRandom(random) {
    const value = random();
    if (!(value >= 0 && value < 1) || !Number.isFinite(value)) throw new Error('Generador aleatorio no válido.');
    return value;
  }

  // Select positions, so equal values remain distinct observations.
  function drawSample(values, size, method, random) {
    if (method === 'replacement') {
      return Array.from({ length: size }, () => values[Math.floor(drawRandom(random) * values.length)]);
    }
    if (method === 'systematic') {
      const step = values.length / size;
      const start = drawRandom(random) * step;
      return Array.from({ length: size }, (_, i) => values[Math.min(values.length - 1, Math.floor(start + i * step))]);
    }
    // Partial Fisher–Yates with a sparse map avoids copying a large population.
    const positions = new Map();
    return Array.from({ length: size }, (_, i) => {
      const chosen = i + Math.floor(drawRandom(random) * (values.length - i));
      const index = positions.get(chosen) ?? chosen;
      positions.set(chosen, positions.get(i) ?? i);
      return values[index];
    });
  }

  function sample(values, size, method = 'replacement', random = Math.random) {
    validateSampling(values, size, method);
    return drawSample(values, size, method, random);
  }

  function randomValues(count, random = Math.random) {
    if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Elige una cantidad entera entre 1 y 10 000.');
    return Array.from({ length: count }, () => Math.floor(drawRandom(random) * 101));
  }

  function sampleMeans(values, size, repetitions, random = Math.random, method = 'replacement') {
    validateSampling(values, size, method);
    if (size > 50 || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 1000) {
      throw new Error('Tamaño o número de muestras fuera de rango.');
    }
    return Array.from({ length: repetitions }, () => {
      let mean = 0;
      const drawn = drawSample(values, size, method, random);
      for (let i = 0; i < size; i++) {
        const value = drawn[i];
        mean += (value - mean) / (i + 1);
      }
      if (!Number.isFinite(mean)) throw new Error('Valores demasiado grandes para simular.');
      return mean;
    });
  }

  const api = { histogram, seededRandom, sample, sampleMeans, randomValues };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Laboratory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
