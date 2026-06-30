import type { VisualisationDto } from "@kk-garden/shared/types";

export type CreateVisualisationPayload = VisualisationDto;

export type DocumentLike = {
  toObject: (options?: { flattenMaps?: boolean }) => unknown;
};
