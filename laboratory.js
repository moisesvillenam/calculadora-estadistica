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

  function sampleMeans(values, size, repetitions, random = Math.random) {
    validate(values);
    if (!Number.isInteger(size) || size < 1 || size > 50 ||
        !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 1000) {
      throw new Error('Tamaño o número de muestras fuera de rango.');
    }
    return Array.from({ length: repetitions }, () => {
      let mean = 0;
      for (let i = 0; i < size; i++) {
        const draw = random();
        if (!(draw >= 0 && draw < 1)) throw new Error('Generador aleatorio no válido.');
        const value = values[Math.floor(draw * values.length)];
        mean += (value - mean) / (i + 1);
      }
      if (!Number.isFinite(mean)) throw new Error('Valores demasiado grandes para simular.');
      return mean;
    });
  }

  const api = { histogram, seededRandom, sampleMeans };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Laboratory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
