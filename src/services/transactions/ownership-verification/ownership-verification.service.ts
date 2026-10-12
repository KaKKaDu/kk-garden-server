import type { ClientSession } from "mongoose";
import type {
  OwnershipVerificationResult,
  OwnershipVerificationPoint,
  UserId,
  Ownership,
  Signature,
  VisualisationDto,
} from "@kk-garden/shared/types";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type { OwnershipService } from "@/services/crud/ownership/ownership.service.js";
import type { SignatureService } from "@/services/crud/signature/signature.service.js";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.js";
import type { UserService } from "@/services/crud/user/user.service.js";
import type { CryptoService } from "@/services/crypto/crypto.service.js";

type VerificationPointKey = keyof OwnershipVerificationResult;

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

  private blockPoints(
    result: OwnershipVerificationResult,
    keys: VerificationPointKey[],
    blockedByKey: VerificationPointKey,
  ): void {
    for (const key of keys) {
      result[key] = {
        status: "blocked",
        error: `Blocked by ${blockedByKey}`,
      };
    }
  }

  public isFullyVerified(result: OwnershipVerificationResult): boolean {
    return Object.values(result).every(
      (point): boolean => point.status === "success",
    );
  }

  public async verifyOwnership(
    userId: UserId,
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
                const successPoint: OwnershipVerificationPoint = {
                  status: "success",
                };
                const verificationResult: OwnershipVerificationResult = {
                  userExists: { ...successPoint },
                  ownershipExists: { ...successPoint },
                  signatureExists: { ...successPoint },
                  visualisationExists: { ...successPoint },
                  ownershipProofVerified: { ...successPoint },
                  signatureProofVerified: { ...successPoint },
                  visualisationVerified: { ...successPoint },
                };

                // Step 1: Verify user exists
                const userResult = await this.userService.getById(
                  userId,
                  session,
                );
                if (!userResult.success || !userResult.data) {
                  verificationResult.userExists = {
                    status: "failed",
                    error: "User not found",
                  };
                  this.blockPoints(
                    verificationResult,
                    [
                      "ownershipExists",
                      "signatureExists",
                      "visualisationExists",
                      "ownershipProofVerified",
                      "signatureProofVerified",
                      "visualisationVerified",
                    ],
                    "userExists",
                  );
                  return { success: true, data: verificationResult };
                }

                // Step 2: Find ownership by user id
                const ownershipResult = await this.ownershipService.getByUserId(
                  userId,
                  session,
                );
                if (!ownershipResult.success || !ownershipResult.data) {
                  verificationResult.ownershipExists = {
                    status: "failed",
                    error: "Ownership for user not found",
                  };
                  this.blockPoints(
                    verificationResult,
                    [
                      "signatureExists",
                      "visualisationExists",
                      "ownershipProofVerified",
                      "signatureProofVerified",
                      "visualisationVerified",
                    ],
                    "ownershipExists",
                  );
                  return { success: true, data: verificationResult };
                }
                const ownership: Ownership = ownershipResult.data;

                // Step 3: Verify signature exists
                let signature: Signature | undefined;
                const signatureResult = await this.signatureService.getById(
                  ownership.signatureId,
                  session,
                );
                if (!signatureResult.success || !signatureResult.data) {
                  verificationResult.signatureExists = {
                    status: "failed",
                    error: "Signature not found",
                  };
                  this.blockPoints(
                    verificationResult,
                    ["visualisationExists", "signatureProofVerified"],
                    "signatureExists",
                  );
                  this.blockPoints(
                    verificationResult,
                    ["visualisationVerified"],
                    "visualisationExists",
                  );
                } else {
                  signature = signatureResult.data;
                }

                // Step 4: Verify visualisation exists
                let visualisation: VisualisationDto | undefined;
                if (signature) {
                  const visualisationResult =
                    await this.visualisationService.getById(
                      signature.visualisationId,
                      true,
                      session,
                    );
                  if (
                    !visualisationResult.success ||
                    !visualisationResult.data
                  ) {
                    verificationResult.visualisationExists = {
                      status: "failed",
                      error: "Visualisation not found",
                    };
                    this.blockPoints(
                      verificationResult,
                      ["visualisationVerified"],
                      "visualisationExists",
                    );
                  } else {
                    visualisation = visualisationResult.data;
                  }
                }

                // Step 5: Verify ownership proof (ownership already resolved)
                const ownershipProofResult =
                  this.ownershipCryptoService.verifyProofSignature(
                    ownership,
                    ownership.ownershipProof,
                  );
                if (!ownershipProofResult.success) {
                  verificationResult.ownershipProofVerified = {
                    status: "failed",
                    error: "Ownership proof verification failed",
                  };
                }

                // Step 6: Verify signature proof (only if signature resolved)
                if (signature) {
                  const signatureProofResult =
                    this.signatureCryptoService.verifyProofSignature(
                      signature,
                      signature.signatureProof,
                    );
                  if (!signatureProofResult.success) {
                    verificationResult.signatureProofVerified = {
                      status: "failed",
                      error: "Signature proof verification failed",
                    };
                  }
                }

                // Step 7: Verify visualisation (only if visualisation resolved)
                if (visualisation) {
                  const visualisationVerifyResult =
                    this.visualisationService.verify(
                      visualisation._id,
                      visualisation.data,
                    );
                  if (!visualisationVerifyResult.success) {
                    verificationResult.visualisationVerified = {
                      status: "failed",
                      error: "Visualisation verification failed",
                    };
                  }
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
