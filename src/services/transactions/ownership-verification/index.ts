import type { OwnershipService } from "@/services/crud/ownership/ownership.service.js";
import { getOwnershipService } from "@/services/crud/ownership/index.js";
import type { SignatureService } from "@/services/crud/signature/signature.service.js";
import { getSignatureService } from "@/services/crud/signature/index.js";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.js";
import { getVisualisationService } from "@/services/crud/visualisation/index.js";
import type { UserService } from "@/services/crud/user/user.service.js";
import { getUserService } from "@/services/crud/user/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import { getMongoService } from "@/services/mongo/index.js";
import type { CryptoService } from "@/services/crypto/crypto.service.js";
import type { Signature, Ownership } from "@kk-garden/shared/types";
import { getSignatureCryptoService } from "@/services/crypto/containers/signature.container.js";
import { getOwnershipCryptoService } from "@/services/crypto/containers/ownership.container.js";
import { OwnershipVerificationService } from "@/services/transactions/ownership-verification/ownership-verification.service.js";

const mongoService: MongoService = getMongoService();
const ownershipService: OwnershipService = getOwnershipService();
const signatureService: SignatureService = getSignatureService();
const visualisationService: VisualisationService = getVisualisationService();
const userService: UserService = getUserService();
const ownershipCryptoService: CryptoService<Ownership> =
  getOwnershipCryptoService();
const signatureCryptoService: CryptoService<Signature> =
  getSignatureCryptoService();

const ownershipVerificationServiceSingleton: OwnershipVerificationService =
  new OwnershipVerificationService(
    mongoService,
    ownershipService,
    signatureService,
    visualisationService,
    userService,
    ownershipCryptoService,
    signatureCryptoService,
  );

export const getOwnershipVerificationService =
  (): OwnershipVerificationService => {
    return ownershipVerificationServiceSingleton;
  };
