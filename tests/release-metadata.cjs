const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const { version } = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1], version);
  assert.equal(read('src-tauri/Cargo.lock').match(/name = "doodle"\r?\nversion = "([^"]+)"/)[1], version);
  const workflow = read('.github/workflows/release.yml');
  const source = workflow.match(/script: \|\r?\n([\s\S]*?)\r?\n  build:/)[1].replace(/^ {12}/gm, '');
  const run = new (Object.getPrototypeOf(async function () {}).constructor)('require', 'context', 'github', 'core', source);
  const context = { repo: { owner: 'VasahTS', repo: 'Doodle' }, sha: 'test-commit' };
  const core = { info() {} };
  const localRequire = () => ({ readFileSync(file) { return read(file); } });
  let created, updated;
  const repos = {
    async getReleaseByTag() { throw Object.assign(new Error('Not found'), { status: 404 }); },
    async createRelease(args) { created = args; return { data: { id: 1 } }; },
    async updateRelease(args) { updated = args; },
  };
  assert.equal(await run(localRequire, context, { rest: { repos } }, core), 1);
  assert.equal(created.tag_name, 'v' + version);
  assert(created.body.includes('Codex (OpenAI)'));
  const entry = read('CHANGELOG.md').split(`## [${version}]`)[1].split(/\r?\n## /)[0].split(/\r?\n/).slice(1).join('\n').trim();
  assert.ok(entry.length > 50); assert(created.body.startsWith(entry));
  assert(!created.body.includes('Existing release, preceding'));
  console.log('PASS Version consistency and English changelog-backed release notes');
  repos.getReleaseByTag = async () => ({ data: { id: 2 } });
  assert.equal(await run(localRequire, context, { rest: { repos } }, core), 2);
  assert.equal(updated.release_id, 2); assert.equal(updated.body, created.body);
  console.log('PASS Existing release notes update without duplicating a release');
  created = null;
  repos.getReleaseByTag = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
  await assert.rejects(run(localRequire, context, { rest: { repos } }, core), /Forbidden/);
  assert.equal(created, null);
  const missingChangelog = () => ({ readFileSync(file) { return file === 'CHANGELOG.md' ? '# Empty' : read(file); } });
  await assert.rejects(run(missingChangelog, context, { rest: { repos } }, core), /Missing changelog entry/);
  assert.equal(created, null);
  console.log('PASS Missing changelog and permission failures stop release creation');
})().catch(e => { console.error(e); process.exitCode = 1; });
