const waitOn = require('wait-on');
const { spawn } = require('cross-spawn');

(async () => {
  try {
    console.log('Waiting for Django (Docker) to be ready...');
    await waitOn({ resources: ['http://127.0.0.1:8000'], timeout: 30000 });

    console.log('Django is up! Running Playwright tests...');
    const playwright = spawn('npx', ['playwright', 'test'], {
      stdio: 'inherit',
      shell: true,
    });

    playwright.on('close', (code) => process.exit(code));

  } catch (err) {
    console.error('Django server is not reachable in time');
    process.exit(1);
  }
})();
