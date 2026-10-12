import type { ErrorResponse } from "@kk-garden/shared/types";
import {
  type AppError,
  type DataObject,
  handleError,
  type SuccessData,
} from "@kk-garden/shared/errors";

export class HandleRouteError {
  private static handle(data: SuccessData<false>): ErrorResponse {
    const contexts: string[] = data.errors
      .filter((err: AppError): boolean => err.context !== undefined)
      .map((err: AppError): string =>
        typeof err.context === "string"
          ? err.context
          : JSON.stringify(err.context),
      );
    return {
      statusCode: data.errors.length > 0 ? data.errors[0].status || 500 : 500,
      message: data.errors
        .map((err: AppError): string => err.message)
        .join(",\n"),
      ...(contexts.length > 0 ? { context: contexts.join(",\n") } : {}),
    };
  }

  public static raw = <T extends DataObject = DataObject>(
    err: unknown,
  ): ErrorResponse => {
    const handled: SuccessData<false, T> = handleError(err);
    return this.handle(handled);
  };

  public static success = <T extends DataObject = DataObject>(
    data: SuccessData<false, T>,
  ): ErrorResponse => {
    return this.handle(data);
  };
}
