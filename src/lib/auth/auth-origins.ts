import { AppError } from "@kk-garden/shared/errors";

const isLoopbackHostname = (hostname: string): boolean => {
  const normalizedHostname: string = hostname.toLowerCase();
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.startsWith("127.") ||
    normalizedHostname === "[::1]"
  );
};

export const parseClientOrigins = (
  rawOrigins: string,
  isProduction: boolean,
): string[] => {
  const origins: string[] = rawOrigins
    .split(",")
    .map((origin) => origin.trim());

  if (origins.length === 0 || origins.some((origin) => origin.length === 0)) {
    throw new AppError({
      status: 500,
      message: "CLIENT_ORIGINS must contain one or more exact origins",
    });
  }

  for (const origin of origins) {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new AppError({
        status: 500,
        message: "CLIENT_ORIGINS contains an invalid origin",
      });
    }

    const hostname: string = parsedOrigin.hostname.toLowerCase();

    if (
      parsedOrigin.origin !== origin ||
      hostname.includes("*") ||
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      (isProduction &&
        (parsedOrigin.protocol !== "https:" || isLoopbackHostname(hostname)))
    ) {
      throw new AppError({
        status: 500,
        message:
          "CLIENT_ORIGINS must contain exact secure origins in production",
      });
    }
  }

  return [...new Set(origins)];
};

export const validateAuthBaseUrl = (
  rawBaseUrl: string,
  isProduction: boolean,
): string => {
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(rawBaseUrl);
  } catch {
    throw new AppError({
      status: 500,
      message: "BETTER_AUTH_URL must be a valid absolute URL",
    });
  }

  if (
    !["http:", "https:"].includes(parsedBaseUrl.protocol) ||
    parsedBaseUrl.username.length > 0 ||
    parsedBaseUrl.password.length > 0 ||
    parsedBaseUrl.search.length > 0 ||
    parsedBaseUrl.hash.length > 0 ||
    (isProduction &&
      (parsedBaseUrl.protocol !== "https:" ||
        isLoopbackHostname(parsedBaseUrl.hostname)))
  ) {
    throw new AppError({
      status: 500,
      message: "BETTER_AUTH_URL must use HTTPS in production",
    });
  }

  return rawBaseUrl;
};
