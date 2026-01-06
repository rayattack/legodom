#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function init() {
  const targetDir = process.argv[2] || 'my-lego-app';
  const templateDir = path.resolve(__dirname, 'template');

  console.log(`Building your Lego app in ${targetDir}...`);

  await fs.copy(templateDir, targetDir);
  
  // Customizing package.json name
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = await fs.readJson(pkgPath);
  pkg.name = targetDir;
  await fs.writeJson(pkgPath, pkg, { spaces: 2 });

  console.log('\nDone! Now run:\n');
  console.log(`  cd ${targetDir}\n  npm install\n  npm run dev`);
}

init();