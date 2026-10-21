import type { OwnershipService } from "@/services/crud/ownership/ownership.service.ts";
import { getOwnershipService } from "@/services/crud/ownership/index.ts";
import type { SignatureService } from "@/services/crud/signature/signature.service.ts";
import { getSignatureService } from "@/services/crud/signature/index.ts";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.ts";
import { getVisualisationService } from "@/services/crud/visualisation/index.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import type { CryptoService } from "@/services/crypto/crypto.service.ts";
import type { Signature, Ownership } from "@kk-garden/shared/types";
import { getSignatureCryptoService } from "@/services/crypto/containers/signature.container.ts";
import { getOwnershipCryptoService } from "@/services/crypto/containers/ownership.container.ts";
import { OwnershipVerificationService } from "@/services/transactions/ownership-verification/ownership-verification.service.ts";

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
