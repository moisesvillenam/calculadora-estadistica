const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFile, readFile, MAX_FILE_BYTES } = require('../data-import.js');

test('CSV admite BOM, CRLF, comillas, negativos, exponentes y varias columnas', () => {
  assert.deepEqual(parseFile('\uFEFF"1.5",-2,3e2\r\n\r\n4,4,+.5\r\n', 'DATOS.CSV'), [1.5, -2, 300, 4, 4, .5]);
  assert.deepEqual(parseFile('1;2\n3;4', 'datos.csv'), [1, 2, 3, 4]);
  assert.deepEqual(parseFile('1\t2\n3\t4', 'datos.csv'), [1, 2, 3, 4]);
  assert.deepEqual(parseFile('1\n2\n3', 'datos.csv'), [1, 2, 3]);
});

test('TXT usa las reglas del campo manual', () => {
  assert.deepEqual(parseFile('\uFEFF1; -2\t3.5\n4e-2', 'datos.txt'), [1, -2, 3.5, .04]);
  assert.throws(() => parseFile('1,2', 'datos.txt'), /comas/);
});

test('rechaza archivos vacíos, encabezados, celdas vacías y contenido no numérico sin omitir datos', () => {
  for (const text of ['', ' \n', 'valor\n1', '1,,2', '1,2,', '1; ;2', '\t1\t2', '1\t2\t', '"1,5";2', '"1\n2"', '1 2,3', 'NaN', 'Infinity', '0x10', '<script>']) {
    assert.throws(() => parseFile(text, 'datos.csv'), undefined, JSON.stringify(text));
  }
  assert.throws(() => parseFile('1e999', 'datos.csv'), /rango/);
});

test('aplica el límite de valores en ambos formatos', () => {
  for (const extension of ['csv', 'txt']) {
    assert.equal(parseFile(Array(10000).fill('1').join('\n'), `datos.${extension}`).length, 10000);
    assert.throws(() => parseFile(Array(10001).fill('1').join('\n'), `datos.${extension}`), /10 000/);
  }
});

test('valida extensión y tamaño antes de leer y comunica fallos de lectura', async () => {
  const text = () => { throw new Error('No debe leerse'); };
  await assert.rejects(readFile({ name: 'datos.xlsx', size: 2, text }), /\.csv o .txt/);
  await assert.rejects(readFile({ name: 'datos.csv', size: MAX_FILE_BYTES + 1, text }), /1 MiB/);
  await assert.rejects(readFile({ name: 'datos.csv', size: 2, text }), /No se pudo leer/);
  assert.deepEqual(await readFile({ name: 'datos.csv', size: MAX_FILE_BYTES, text: async () => '1,2' }), [1, 2]);
});
