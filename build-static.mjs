import fs from 'fs';
import path from 'path';

const root = process.cwd();
const out = path.join(root, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copy = (from, to) => {
  const src = path.join(root, from);
  const dest = path.join(out, to || from);
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
};

copy('index.html');
copy('manifest.webmanifest');
copy('service-worker.js');
copy('icons');

console.log('ADB Administrativo: arquivos estáticos copiados para public/');
