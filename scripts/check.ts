import { execSync } from "node:child_process";
import chalk from "chalk";
import ora, { type Ora } from "ora";

function run(command: string, label: string) {
  const spinner: Ora = ora(label).start();

  try {
    execSync(command, { stdio: "pipe" });
    spinner.succeed(chalk.green(`${label} passed`));
    return true;
  } catch (error) {
    spinner.fail(chalk.red(`${label} failed`));
    console.log("\n");
    console.log(error instanceof Error ? error.message : error);
    return false;
  }
}

console.log(chalk.blue.bold("Code checks \n"));

const formatOk: boolean = run(
  "npx prettier --write .",
  "Formatting (Prettier)",
);
if (!formatOk) process.exit(1);

const lintOk: boolean = run("npx eslint .", "Linting (ESLint)");
if (!lintOk) process.exit(1);

const typeOk: boolean = run("npx tsc --noEmit", "Type Checking (TypeScript)");
if (!typeOk) process.exit(1);

console.log("\n" + chalk.blue.bold("All checks passed successfully \n"));
