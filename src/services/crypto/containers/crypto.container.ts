import { CryptoRepository } from "@/services/crypto/crypto.repository.ts";
import { getEnvService } from "@/services/env/index.ts";

export const cryptoRepositorySingleton = new CryptoRepository(getEnvService());
