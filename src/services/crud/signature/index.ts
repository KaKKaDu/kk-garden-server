import type { CryptoService } from "@/services/crypto/crypto.service.js";
import { getSignatureCryptoService } from "@/services/crypto/index.js";
import { getMongoService } from "@/services/mongo/index.js";
import { SignatureRepository } from "@/services/crud/signature/signature.repository.js";
import { SignatureService } from "@/services/crud/signature/signature.service.js";
import { getVisualisationService } from "@/services/crud/visualisation/index.js";
import type { Signature } from "@kk-garden/shared/types";
import type { MongoService } from "@/services/mongo/mongo.service.js";

const mongoService: MongoService = getMongoService();
const signatureCryptoService: CryptoService<Signature> =
  getSignatureCryptoService();
const repositorySingleton: SignatureRepository = new SignatureRepository(
  mongoService,
);
const serviceSingleton: SignatureService = new SignatureService(
  repositorySingleton,
  getVisualisationService(),
  signatureCryptoService,
);

export const getSignatureService = (): SignatureService => {
  return serviceSingleton;
};
