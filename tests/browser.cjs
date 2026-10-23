// Test-only launcher. Keep browser tooling outside the application's dependencies.
const { chromium } = require('playwright');
exports.launch = () => chromium.launch({
  ...(process.env.DOODLE_CHROMIUM_PATH
    ? { executablePath: process.env.DOODLE_CHROMIUM_PATH }
    : { channel: process.env.DOODLE_BROWSER || 'chrome' }),
  args: process.env.DOODLE_BROWSER_ARGS ? JSON.parse(process.env.DOODLE_BROWSER_ARGS) : [],
  headless: true,
});
