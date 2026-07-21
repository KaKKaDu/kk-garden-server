import { CryptoRepository } from "@/services/crypto/crypto.repository.js";
import { getEnvService } from "@/services/env/index.js";

export const cryptoRepositorySingleton = new CryptoRepository(getEnvService());
