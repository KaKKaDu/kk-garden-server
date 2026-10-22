import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";

export const requireData = <T extends object>(
  result: SuccessDataAny<T>,
  fallback: string,
): T => {
  if (!result.success || !result.data) {
    const error = result.success ? undefined : result.errors[0];
    throw new AppError({
      status: error?.status ?? 503,
      message: error?.message ?? fallback,
    });
  }
  return result.data;
};
