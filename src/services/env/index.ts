import { EnvService } from "@/services/env/env.service.ts";

const serviceSingleton: EnvService = new EnvService();

export const getEnvService = (): EnvService => {
  return serviceSingleton;
};
