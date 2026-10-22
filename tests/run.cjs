const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suites = ['release-metadata', 'brush-size', 'liquify', 'lasso', 'selection-outline', 'settings-menu', 'clear-contents'];
for (const suite of suites) {
  console.log('\nRunning ' + suite);
  const result = spawnSync(process.execPath, [path.join(__dirname, suite + '.cjs')], { stdio: 'inherit', timeout: 90000 });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nAll 7 regression suites passed.');
