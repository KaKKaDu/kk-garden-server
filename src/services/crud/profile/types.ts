import type { Nullable, Profile } from "@kk-garden/shared/types";

export type ProfileUpdateFields = {
  displayName?: Profile["displayName"];
  bio?: Nullable<Profile["bio"]>;
  accentHex?: Nullable<Profile["accentHex"]>;
};

export type ProfileUpdateRateLimit = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type ProfileLookup = {
  profile: Nullable<Profile>;
};

export type ProfileAvatarReferenceChange = {
  previousProfile: Nullable<Profile>;
  displacedAvatarObjectKey: Nullable<string>;
};
