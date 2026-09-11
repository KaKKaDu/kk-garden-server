import type { ClientSession } from "mongoose";
import type {
  OwnershipVerificationResult,
  OwnershipId,
  Ownership,
} from "@kk-garden/shared/types";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type { OwnershipService } from "@/services/crud/ownership/ownership.service.js";
import type { SignatureService } from "@/services/crud/signature/signature.service.js";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.js";
import type { UserService } from "@/services/crud/user/user.service.js";
import type { CryptoService } from "@/services/crypto/crypto.service.js";
import type { Signature } from "@kk-garden/shared/types";

export class OwnershipVerificationService {
  constructor(
    private readonly mongoService: MongoService,
    private readonly ownershipService: OwnershipService,
    private readonly signatureService: SignatureService,
    private readonly visualisationService: VisualisationService,
    private readonly userService: UserService,
    private readonly ownershipCryptoService: CryptoService<Ownership>,
    private readonly signatureCryptoService: CryptoService<Signature>,
  ) {}

  public async verifyOwnership(
    ownershipId: OwnershipId,
  ): Promise<SuccessDataAny<OwnershipVerificationResult>> {
    return this.mongoService.execute(
      async (db): Promise<OwnershipVerificationResult> => {
        const session: ClientSession = await db.startSession();
        try {
          const transactionResult: SuccessDataAny<OwnershipVerificationResult> =
            await session.withTransaction(
              async (): Promise<
                SuccessDataAny<OwnershipVerificationResult>
              > => {
                const verificationResult: OwnershipVerificationResult = {
                  ownershipExists: { success: true },
                  signatureExists: { success: true },
                  visualisationExists: { success: true },
                  userExists: { success: true },
                  ownershipProofVerified: { success: true },
                  signatureProofVerified: { success: true },
                  visualisationVerified: { success: true },
                };

                // Step 1: Verify ownership exists
                const ownershipResult = await this.ownershipService.getById(
                  ownershipId,
                  session,
                );
                if (!ownershipResult.success || !ownershipResult.data) {
                  throw new Error("Ownership not found");
                }
                const ownership = ownershipResult.data;

                // Step 2: Verify signature exists
                const signatureResult = await this.signatureService.getById(
                  ownership.signatureId,
                  session,
                );
                if (!signatureResult.success || !signatureResult.data) {
                  throw new Error("Signature not found");
                }
                const signature = signatureResult.data;

                // Step 3: Verify visualisation exists
                const visualisationResult =
                  await this.visualisationService.getById(
                    signature.visualisationId,
                    true,
                    session,
                  );
                if (!visualisationResult.success || !visualisationResult.data) {
                  throw new Error("Visualisation not found");
                }
                const visualisation = visualisationResult.data;

                // Step 4: Verify user exists
                const userResult = await this.userService.getById(
                  ownership.userId,
                  session,
                );
                if (!userResult.success || !userResult.data) {
                  throw new Error("User not found");
                }

                // Step 5: Verify ownership proof
                const ownershipProofResult =
                  this.ownershipCryptoService.verifyProofSignature(
                    ownership,
                    ownership.ownershipProof,
                  );
                if (!ownershipProofResult.success) {
                  verificationResult.ownershipProofVerified = {
                    success: false,
                    error: "Ownership proof verification failed",
                  };
                }

                // Step 6: Verify signature proof
                const signatureProofResult =
                  this.signatureCryptoService.verifyProofSignature(
                    signature,
                    signature.signatureProof,
                  );
                if (!signatureProofResult.success) {
                  verificationResult.signatureProofVerified = {
                    success: false,
                    error: "Signature proof verification failed",
                  };
                }

                // Step 7: Verify visualisation using built-in verify method
                const visualisationVerifyResult =
                  this.visualisationService.verify(
                    visualisation._id,
                    visualisation.data,
                  );
                if (!visualisationVerifyResult.success) {
                  verificationResult.visualisationVerified = {
                    success: false,
                    error: "Visualisation verification failed",
                  };
                }

                return {
                  success: true,
                  data: verificationResult,
                };
              },
            );

          if (!transactionResult.success || !transactionResult.data) {
            throw new Error("Transaction failed");
          }

          return transactionResult.data;
        } finally {
          await session.endSession();
        }
      },
      "OwnershipVerificationService.verifyOwnership",
    );
  }
}
