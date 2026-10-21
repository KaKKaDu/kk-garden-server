import type {
  AvatarCleanupTarget,
  ProfileAvatarUploadSession,
  UserId,
} from "@kk-garden/shared/types";

export type AvatarCleanupData = {
  ownerId: UserId;
  target: AvatarCleanupTarget;
};

export type AvatarCleanupContext = {
  referenced: boolean;
  upload: ProfileAvatarUploadSession | null;
};
