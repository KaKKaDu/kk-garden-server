import { EnvService } from "@/services/env/env.service.js";

const serviceSingleton: EnvService = new EnvService();

export const getEnvService = (): EnvService => {
  return serviceSingleton;
};
