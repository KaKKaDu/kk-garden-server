import type { UserStatus } from "@kk-garden/shared/types";

export type UserStatusSignals = {
  deletedAt: Date | null;
  banned: boolean;
  deactivated: boolean;
};

export const deriveUserStatus = (user: UserStatusSignals): UserStatus => {
  if (user.deletedAt) {
    return "deleted";
  }
  if (user.banned) {
    return "suspended";
  }
  if (user.deactivated) {
    return "inactive";
  }
  return "active";
};
