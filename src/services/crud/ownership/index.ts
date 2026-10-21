import { getOwnershipCryptoService } from "@/services/crypto/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import { OwnershipRepository } from "@/services/crud/ownership/ownership.repository.ts";
import { OwnershipService } from "@/services/crud/ownership/ownership.service.ts";
import { getSignatureService } from "@/services/crud/signature/index.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import type { CryptoService } from "@/services/crypto/crypto.service.ts";
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
