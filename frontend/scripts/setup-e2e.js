const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const composeArgs = [
  "compose",
  "--project-name",
  "openspots-e2e",
  "--file",
  "compose.yml",
  "--file",
  "compose.e2e.yml",
];

async function waitForApp() {
  const url = "http://127.0.0.1:8001/venues";
  const timeout = Date.now() + 60_000;

  while (Date.now() < timeout) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // The web container may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`E2E web app did not become ready at ${url}`);
}

function runDocker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...composeArgs, ...args], {
      cwd: root,
      env: { ...process.env, OPENSPOTS_WEB_PORT: "8001" },
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker compose exited with code ${code}`));
      }
    });
  });
}

async function main() {
  await runDocker(["up", "--build", "--detach", "db", "redis", "web"]);
  await runDocker(["exec", "--no-TTY", "web", "python", "manage.py", "migrate", "--noinput"]);
  await runDocker(["exec", "--no-TTY", "web", "python", "manage.py", "seed_e2e_user"]);
  await waitForApp();
  console.log("\nE2E stack ready at http://127.0.0.1:8001");
  console.log("Run `npm run test:e2e -- --ui --project=chromium` to open Playwright UI.");
}

main().catch((error) => {
  console.error(`E2E setup failed: ${error.message}`);
  process.exitCode = 1;
});
