import type {
  Nullable,
  ProfileAvatarUploadSession,
} from "@kk-garden/shared/types";

export type AvatarUploadLookup = {
  upload: Nullable<ProfileAvatarUploadSession>;
};

export type AvatarUploadClaim = Extract<
  ProfileAvatarUploadSession,
  { state: "processing" }
>;

export type AvatarUploadFailure = NonNullable<
  Extract<ProfileAvatarUploadSession, { state: "pending" }>["lastFailure"]
>;

export type AvatarUploadClaimLookup = {
  upload: Nullable<AvatarUploadClaim>;
};

export type AvatarUploadTransition = {
  updated: boolean;
};

export type AvatarUploadStateChange =
  | {
      state: "pending";
      retryAt: Date;
      failure: AvatarUploadFailure;
    }
  | { state: "expired" }
  | {
      state: "rejected";
      reason: "invalid-image" | "metadata-mismatch" | "attempts-exhausted";
    };
