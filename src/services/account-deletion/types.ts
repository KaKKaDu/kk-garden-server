import type {
  Nullable,
  Profile,
  ProfileAvatarUploadSession,
} from "@kk-garden/shared/types";
import type { ObjectId } from "mongodb";

export type AccountDeletionUserDocument = {
  _id: ObjectId | string;
  email: string;
  updatedAt?: Date;
};

export type AccountDeletionSnapshot = {
  user: Nullable<AccountDeletionUserDocument>;
  profile: Nullable<Profile>;
  uploads: ProfileAvatarUploadSession[];
};

export type AccountDeletionUserLookup = {
  user: Nullable<AccountDeletionUserDocument>;
};

export type AccountDeletionCascadeRecords = {
  signatureIds: string[];
  visualisationIds: string[];
};

export type AccountDeletionUserDeleteResult = {
  deletedCount: number;
};
