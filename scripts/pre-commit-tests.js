const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const venvPython = path.join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);
const python = fs.existsSync(venvPython) ? venvPython : "python";
const node = process.execPath;
const startedAt = new Date();
const results = [];
const testEnv = {
  ...process.env,
  DJANGO_DEBUG: "True",
  SECURE_SSL_REDIRECT: "0",
  SESSION_COOKIE_SECURE: "0",
  CSRF_COOKIE_SECURE: "0",
  DJANGO_SETTINGS_MODULE: "openspots.settings_test",
};
delete testEnv.TEST_USE_POSTGRES;

function runStep(name, executable, args, cwd, env) {
  return new Promise((resolve) => {
    const output = [];
    const stepStarted = Date.now();
    console.log(`\n==> ${name}`);

    const child = spawn(executable, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        output.push(chunk);
        (stream === child.stdout ? process.stdout : process.stderr).write(chunk);
      });
    }

    child.on("error", (error) => {
      const message = `Could not start command: ${error.message}\n`;
      output.push(message);
      console.error(message.trimEnd());
      resolve({
        name,
        command: [executable, ...args].join(" "),
        status: "FAIL",
        durationMs: Date.now() - stepStarted,
        output: output.join(""),
      });
    });

    child.on("close", (code) => {
      resolve({
        name,
        command: [executable, ...args].join(" "),
        status: code === 0 ? "PASS" : "FAIL",
        exitCode: code,
        durationMs: Date.now() - stepStarted,
        output: output.join(""),
      });
    });
  });
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const localTime = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetRemainder = pad(Math.abs(offsetMinutes) % 60);

  return `${localTime} (local, UTC${offsetSign}${offsetHours}:${offsetRemainder})`;
}

async function main() {
  const django = [
    "--settings=openspots.settings_test",
  ];

  results.push(
    await runStep(
      "Django system checks",
      python,
      ["manage.py", "check", ...django],
      backend,
      testEnv,
    ),
  );
  results.push(
    await runStep(
      "Backend test suite",
      python,
      [
        "manage.py",
        "test",
        "accounts",
        "venues",
        "emails_manager",
        "tests",
        ...django,
      ],
      backend,
      testEnv,
    ),
  );
  results.push(
    await runStep(
      "Frontend unit tests",
      node,
      ["node_modules/jest/bin/jest.js", "--ci", "--runInBand"],
      frontend,
      process.env,
    ),
  );
  results.push(
    await runStep(
      "Frontend production build",
      node,
      ["node_modules/vite/bin/vite.js", "build"],
      frontend,
      process.env,
    ),
  );

  const finishedAt = new Date();
  const failed = results.some((result) => result.status === "FAIL");
  const lines = [
    "# Pre-commit validation report",
    "",
    `- Started: ${formatTimestamp(startedAt)}`,
    `- Finished: ${formatTimestamp(finishedAt)}`,
    `- Overall: **${failed ? "FAIL" : "PASS"}**`,
    "",
    "| Check | Result | Duration | Command |",
    "|---|---|---:|---|",
    ...results.map(
      (result) =>
        `| ${result.name} | ${result.status} | ${formatDuration(result.durationMs)} | \`${result.command}\` |`,
    ),
    "",
    "Playwright E2E tests were not run by this hook. They require a separately configured backend and test fixtures; run them separately or rely on the CI workflow.",
    "",
  ];

  for (const result of results.filter((item) => item.status === "FAIL")) {
    lines.push(
      `## Failure: ${result.name}`,
      "",
      "```text",
      result.output.trimEnd(),
      "```",
      "",
    );
  }

  const reportDir = path.join(root, "test-reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "pre-commit-latest.md");
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);

  console.log(`\nValidation report: ${path.relative(root, reportPath)}`);
  if (failed) {
    console.error("\nPre-commit checks failed; commit cancelled.");
    process.exitCode = 1;
  } else {
    console.log("\nAll pre-commit checks passed.");
  }
}

main().catch((error) => {
  console.error("Pre-commit validation could not complete:", error);
  process.exitCode = 1;
});
