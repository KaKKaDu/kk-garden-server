import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

const toEnv = (pem: string) => `"${pem.replace(/\n/g, "\\n")}"`;

console.log(
  `SIGNATURE_PRIVATE_KEY=${toEnv(
    privateKey
      .export({
        type: "pkcs8",
        format: "pem",
      })
      .toString(),
  )}`,
);

console.log(
  `SIGNATURE_PUBLIC_KEY=${toEnv(
    publicKey
      .export({
        type: "spki",
        format: "pem",
      })
      .toString(),
  )}`,
);
