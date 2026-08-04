import { getOwnershipCryptoService } from "@/services/crypto/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import { getMongoService } from "@/services/mongo/index.js";
import { OwnershipRepository } from "@/services/ownership/ownership.repository.js";
import { OwnershipService } from "@/services/ownership/ownership.service.js";
import { getSignatureService } from "@/services/signature/index.js";
import { getUserService } from "@/services/user/index.js";
import type { CryptoService } from "@/services/crypto/crypto.service.js";
import type { Ownership } from "@kk-garden/shared/types";

const mongoService: MongoService = getMongoService();
const ownershipCryptoService: CryptoService<Ownership> =
  getOwnershipCryptoService();
const repositorySingleton: OwnershipRepository = new OwnershipRepository(
  mongoService,
);
const serviceSingleton: OwnershipService = new OwnershipService(
  repositorySingleton,
  getUserService(),
  getSignatureService(),
  ownershipCryptoService,
);

export const getOwnershipService = (): OwnershipService => {
  return serviceSingleton;
};
