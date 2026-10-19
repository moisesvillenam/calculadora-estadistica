'use strict';

// Copy only the official, self-contained UMD bundle; no CDN or build transforms.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').dependencies['@supabase/supabase-js'];
const source = path.join(root, 'node_modules/@supabase/supabase-js');
try {
  const installed = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (installed.version !== version) throw new Error(`Se requiere @supabase/supabase-js ${version}; se encontró ${installed.version}.`);
  const bytes = fs.readFileSync(path.join(source, 'dist/umd/supabase.js'));
  const license = fs.readFileSync(path.join(source, 'LICENSE'));
  const target = path.join(root, 'vendor');
  fs.mkdirSync(target, { recursive: true });
  const filename = `supabase-js-${version}.js`;
  fs.writeFileSync(path.join(target, filename), bytes);
  fs.writeFileSync(path.join(target, 'SUPABASE-LICENSE'), license);
  const manifest = { package: installed.name, version, file: filename,
    sha256: createHash('sha256').update(bytes).digest('hex') };
  fs.writeFileSync(path.join(target, 'supabase-sdk.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`SDK local preparado: vendor/${filename}; SHA-256 ${manifest.sha256}`);
} catch (error) {
  console.error(`No se pudo preparar el SDK local. Ejecuta npm install y vuelve a intentar. ${error.message}`);
  process.exitCode = 1;
}
