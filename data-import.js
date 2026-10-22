(function (root) {
  'use strict';
  const statistics = typeof module !== 'undefined' && module.exports
    ? require('./statistics.js') : root.Statistics;
  const MAX_FILE_BYTES = 1024 * 1024;

  function validateFile(file) {
    if (!/\.(csv|txt)$/i.test(file.name)) throw new Error('Selecciona un archivo .csv o .txt.');
    if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el máximo de 1 MiB.');
  }

  function parseFile(text, name) {
    validateFile({ name, size: 0 });
    if (/\.txt$/i.test(name)) return statistics.parseNumbers(text);
    // Numeric CSV only: quoted numeric cells are supported, headers and empty
    // cells are rejected. Never silently discard a column or a nonnumeric row.
    const content = text.replace(/^\uFEFF/, '');
    const delimiter = content.includes(';') ? ';' : content.includes('\t') ? '\t' : ',';
    const cells = content.split(/\r\n|\n|\r/).flatMap((line, row) => {
      if (!line.trim()) return [];
      return line.split(delimiter).map((cell, column) => {
        let token = cell.trim();
        if (/^"[^"]*"$/.test(token)) token = token.slice(1, -1).trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) {
          throw new Error(`Revisa la fila ${row + 1}, columna ${column + 1}: usa solo números con punto decimal, sin encabezados ni celdas vacías.`);
        }
        return token;
      });
    });
    return statistics.parseNumbers(cells.join(';'));
  }

  async function readFile(file) {
    validateFile(file);
    let text;
    try { text = await file.text(); }
    catch { throw new Error('No se pudo leer el archivo. Vuelve a seleccionarlo.'); }
    return parseFile(text, file.name);
  }

  const api = { MAX_FILE_BYTES, parseFile, readFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DataImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
