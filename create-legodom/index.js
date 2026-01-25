#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import { red, green, bold } from 'kolorist';

const cwd = process.cwd();

async function init() {
  let targetDir = process.argv[2];

  const result = await prompts(
    [
      {
        type: targetDir ? null : 'text',
        name: 'projectName',
        message: 'Project name:',
        initial: 'lego-app',
        onState: (state) => (targetDir = state.value.trim() || 'lego-app')
      },
      {
        type: 'select',
        name: 'language',
        message: 'Select language:',
        choices: [
          { title: 'JavaScript', value: 'js' },
          { title: 'TypeScript', value: 'ts' }
        ],
        initial: 0
      }
    ],
    {
      onCancel: () => {
        throw new Error(red('✖') + ' Operation cancelled');
      }
    }
  );

  const { language } = result;
  const isTS = language === 'ts';

  const root = path.join(cwd, targetDir);
  const renameFiles = {
    _gitignore: '.gitignore'
  };

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  } else {
    const existing = fs.readdirSync(root);
    if (existing.length) {
      const { yes } = await prompts({
        type: 'confirm',
        name: 'yes',
        initial: 'yes',
        message:
          (targetDir === '.'
            ? 'Current directory'
            : `Target directory "${targetDir}"`) +
          ' is not empty. Remove existing files and continue?'
      });
      if (!yes) {
        return;
      }
      emptyDir(root);
    }
  }

  console.log(`\nScaffolding project in ${root}...`);

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '../template'
  );

  const write = (file, content) => {
    // Handling renaming for TS
    let targetFileName = renameFiles[file] || file;

    // Rename main.js and vite.config.js to .ts if TS mode
    if (isTS) {
      if (file === 'src/app.js') targetFileName = 'src/app.ts';
      if (file === 'vite.config.js') targetFileName = 'vite.config.ts';
    }

    const targetPath = path.join(root, targetFileName);

    if (content) {
      fs.writeFileSync(targetPath, content);
    } else {
      copy(path.join(templateDir, file), targetPath);
    }
  };

  const files = fs.readdirSync(templateDir);
  for (const file of files) {
    if (file === 'package.json') continue; // Handle separately
    if (file === 'tsconfig.json' && !isTS) continue; // Skip tsconfig for JS projects
    write(file);
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8')
  );

  pkg.name = path.basename(root);

  // Remove typescript dependency if JS project
  if (!isTS) {
    delete pkg.devDependencies.typescript;
  }

  write('package.json', JSON.stringify(pkg, null, 2));

  console.log(`\nDone. Now run:\n`);
  if (root !== cwd) {
    console.log(`  cd ${path.relative(cwd, root)}`);
  }
  console.log(`  npm install`);
  console.log(`  npm run dev`);
  console.log();
}

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    const abs = path.resolve(dir, file);
    if (fs.lstatSync(abs).isDirectory()) {
      emptyDir(abs);
      fs.rmdirSync(abs);
    } else {
      fs.unlinkSync(abs);
    }
  }
}

init().catch((e) => {
  console.error(e);
});
