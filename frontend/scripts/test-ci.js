const { spawn } = require("child_process");
const waitOn = require('wait-on');

(async () => {
  try {
    console.log('Running Jest unit tests...');
    const jest = spawn("node", ["node_modules/jest/bin/jest.js"], { stdio: "inherit" });

    jest.on('close', async (jestCode) => {
      if (jestCode !== 0) {
        console.error(`Jest failed with code ${jestCode}`);
        process.exit(jestCode);
      }

      console.log('Waiting for Django (Docker) to be ready...');
      await waitOn({ resources: ['http://127.0.0.1:8000/venues'], timeout: 60000  });

      console.log('Django is up! Running Playwright E2E tests...');
      const playwright = spawn('npx', ['playwright', 'test'], { stdio: 'inherit', shell: true });

      playwright.on('close', (code) => process.exit(code));
    });

  } catch (err) {
    console.error('Error during CI test workflow:', err);
    process.exit(1);
  }
})();
