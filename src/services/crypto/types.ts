import type { SuccessDataAny } from "@kk-garden/shared/errors";

export type PayloadNormaliser<Payload> = (
  payload: Payload,
) => SuccessDataAny<string>;
