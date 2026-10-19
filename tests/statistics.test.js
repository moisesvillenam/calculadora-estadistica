const test = require('node:test');
const assert = require('node:assert/strict');
const statistics = require('../statistics.js');
const lab = require('../laboratory.js');

test('estadísticas poblacionales y muestrales conservan resultados', () => {
  const values = statistics.parseNumbers('1; 2\n3 4');
  const result = statistics.calculateStatistics(values);
  assert.deepEqual(result, { mean: 2.5, median: 2.5, variance: 1.25, standardDeviation: Math.sqrt(1.25), count: 4, min: 1, max: 4 });
  assert.equal(statistics.calculateStatistics(values, 'sample').variance, 5 / 3);
  assert.deepEqual(values, [1, 2, 3, 4]);
});

test('parser conserva decimales, exponentes y validación', () => {
  assert.deepEqual(statistics.parseNumbers('-1.5; +2e2 .25'), [-1.5, 200, .25]);
  for (const text of ['', '1,2', '1x', 'Infinity', '1e309', Array(10001).fill(1).join(' ')]) {
    assert.throws(() => statistics.parseNumbers(text));
  }
  assert.throws(() => statistics.calculateStatistics([1], 'sample'));
  assert.equal(statistics.calculateStatistics([4, 4]).variance, 0);
});

test('histograma incluye ambos extremos y conserva todas las frecuencias', () => {
  const bins = lab.histogram([0, 1, 2, 3, 4], 2);
  assert.deepEqual(bins.map(bin => bin.count), [2, 3]);
  assert.equal(lab.histogram([-1e308, 1e308], 8).reduce((n, bin) => n + bin.count, 0), 2);
  assert.deepEqual(lab.histogram([7, 7]), [{ from: 7, to: 7, count: 2 }]);
});

test('muestreo reproducible, límites y población constante', () => {
  assert.deepEqual(lab.sampleMeans([1, 2, 3], 10, 500, lab.seededRandom()), lab.sampleMeans([1, 2, 3], 10, 500, lab.seededRandom()));
  assert.deepEqual(lab.sampleMeans([7, 7], 10, 3), [7, 7, 7]);
  assert.throws(() => lab.sampleMeans([1], 0, 10));
  assert.throws(() => lab.sampleMeans([1], 10, 1001));
  assert.throws(() => lab.sampleMeans([1], 1, 1, () => 1));
});
