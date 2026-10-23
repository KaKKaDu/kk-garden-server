import {
  handleError,
  type DataObject,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";

export const captureSuccessData = async <T extends DataObject>(
  context: string,
  operation: () => Promise<T>,
): Promise<SuccessDataAny<T>> => {
  let result: SuccessDataAny<T>;
  try {
    result = { success: true, data: await operation() };
  } catch (error: unknown) {
    result = handleError<T>(error);
  }
  Logger.report(context, result);
  return result;
};
