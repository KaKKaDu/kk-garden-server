import type { ServerEnvVariable } from "@/../env/env.schema.js";
import type { Nullable } from "@kk-garden/shared/types";

export type EnvVariableFormatter = (
  value: Nullable<string>,
) => Nullable<string>;

export class EnvService {
  public getRawEnvValue(value: ServerEnvVariable): Nullable<string> {
    return process.env[value] ?? null;
  }

  public getFormattedEnvValue(
    value: ServerEnvVariable,
    formatter: EnvVariableFormatter,
  ): Nullable<string> {
    return formatter(this.getRawEnvValue(value));
  }
}
