const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suites = ['release-metadata', 'brush-size', 'liquify', 'liquify-async', 'lasso', 'selection-outline', 'settings-menu', 'clear-contents', 'psd-export', 'close-save', 'recovery', 'performance', 'performance-recovery', 'performance-integration'];
for (const suite of suites) {
  console.log('\nRunning ' + suite);
  const result = spawnSync(process.execPath, [path.join(__dirname, suite + '.cjs')], { stdio: 'inherit', timeout: 90000 });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nAll ' + suites.length + ' regression suites passed.');
