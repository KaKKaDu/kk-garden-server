import type { ClientSession } from "mongoose";

export type TransactionalMethod<
  TArgs extends unknown[] = [],
  TResult = void,
> = (...args: [...TArgs, session?: ClientSession]) => Promise<TResult>;
