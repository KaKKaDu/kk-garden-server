import dotenv from "dotenv";
import chalk from "chalk";
import ora from "ora";
import { serverEnvSchema } from "../env-vars/env.schema.js";

/* eslint-disable no-console */

dotenv.config({ quiet: true });

function validateEnvironment() {
  const spinner = ora("Validating environment variables...").start();

  try {
    const env = serverEnvSchema.safeParse(process.env);

    if (env.success) {
      spinner.succeed(chalk.green("Environment variables are valid"));
      return true;
    } else {
      throw new Error(env.error.message);
    }
  } catch (error) {
    spinner.fail(chalk.red("Environment validation failed"));
    console.log("\n");

    if (error instanceof Error) {
      console.log(error.message);
    } else {
      console.log(error);
    }

    return false;
  }
}

console.log(chalk.blue.bold("Environment Validation \n"));

const isValid = validateEnvironment();

if (!isValid) {
  console.log("\n" + chalk.red.bold("Please fix the environment variables\n"));
  process.exit(1);
}

console.log("\n" + chalk.blue.bold("Environment is properly configured\n"));
