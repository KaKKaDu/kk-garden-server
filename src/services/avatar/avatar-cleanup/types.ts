import type {
  AvatarCleanupTarget,
  Nullable,
  ProfileAvatarUploadSession,
  UserId,
} from "@kk-garden/shared/types";

export type AvatarCleanupData = {
  ownerId: UserId;
  target: AvatarCleanupTarget;
};

export type AvatarCleanupJobData = AvatarCleanupData & {
  queuedAt: Date;
};

export type AvatarCleanupContext = {
  referenced: boolean;
  upload: Nullable<ProfileAvatarUploadSession>;
};
