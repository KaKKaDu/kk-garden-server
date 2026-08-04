import type { ClientSession } from "mongoose";
import type { Nullable } from "@kk-garden/shared/types";

export type TransactionalCallback<
  TArgs extends unknown[] = [],
  TResult = void,
> = (...args: [...TArgs, session: Nullable<ClientSession>]) => Promise<TResult>;

export type TransactionalMethod<
  TArgs extends unknown[] = [],
  TResult = void,
> = TransactionalCallback<TArgs, TResult> & {
  direct: (...args: [...TArgs]) => Promise<TResult>;
};

export type DocumentLike = {
  toObject: (options?: { flattenMaps?: boolean }) => unknown;
};

export const transactional = <TArgs extends unknown[], TResult>(
  callback: TransactionalCallback<TArgs, TResult>,
): TransactionalMethod<TArgs, TResult> => {
  const method = callback as TransactionalMethod<TArgs, TResult>;

  method.direct = (...args: TArgs) => callback(...args, null);

  return method;
};
