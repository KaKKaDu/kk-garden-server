import type { Nullable, Profile } from "@kk-garden/shared/types";
import type { ProfileAvatarUploadResult } from "@kk-garden/shared/types";

export type ProfileUpdateFields = {
  displayName?: Profile["displayName"];
  bio?: Nullable<Profile["bio"]>;
  accentHex?: Nullable<Profile["accentHex"]>;
};

export type ProfileLookup = {
  profile: Nullable<Profile>;
};

export type ProfileAvatarReferenceChange = {
  previousProfile: Nullable<Profile>;
  displacedAvatarObjectKey: Nullable<string>;
};

export type ProfileAvatarFinalizeInput = {
  ownerId: string;
  uploadId: string;
  claimToken: string;
  candidateObjectKey: string;
  expectedAvatarObjectKey: Nullable<string>;
  width: number;
  height: number;
};

export type ProfileAvatarFinalizeCommit = {
  result: ProfileAvatarUploadResult;
  displacedAvatarObjectKey: Nullable<string>;
};
