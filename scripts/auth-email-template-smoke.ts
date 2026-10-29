import assert from "node:assert/strict";
import {
  createProfilePalette,
  DEFAULT_PROFILE_ACCENT_HEX,
} from "@kk-garden/shared/constants";
import {
  renderAuthOtpEmail,
  type AuthOtpEmailInput,
} from "../src/lib/auth/auth-email-template.ts";

/* eslint-disable no-console */

const otpTypes: AuthOtpEmailInput["type"][] = [
  "sign-in",
  "email-verification",
  "forget-password",
  "change-email",
];
const expiresInSeconds = 300;

const run = (): void => {
  for (const type of otpTypes) {
    const email = renderAuthOtpEmail({
      otp: "123456",
      type,
      expiresInSeconds,
      accentHex: "#bada55",
    });
    assert.equal(
      email.subject,
      type === "sign-in"
        ? "Your kk-garden sign-in code"
        : "Your kk-garden verification code",
    );
    assert.equal(
      email.text,
      [
        "Your kk-garden code is: 123456",
        "",
        "This code expires in 5 minutes and can only be used once.",
        "Do not share this code with anyone.",
        "",
        "If you did not request this code, you can ignore this email.",
      ].join("\n"),
    );
    assert.ok(email.html.includes("<html lang="));
    assert.ok(email.html.includes("role="));
    assert.ok(email.html.includes("123456"));
    assert.ok(email.html.includes("This code expires in 5 minutes"));

    const palette = createProfilePalette("#bada55");
    assert.ok(email.html.includes(`background-color:${palette.accent};`));
    assert.ok(email.html.includes(`color:${palette.onAccent};`));
  }

  const defaultEmail = renderAuthOtpEmail({
    otp: "654321",
    type: "sign-in",
    expiresInSeconds: 60,
  });
  const defaultPalette = createProfilePalette(DEFAULT_PROFILE_ACCENT_HEX);
  assert.ok(
    defaultEmail.html.includes(`background-color:${defaultPalette.accent};`),
  );
  assert.ok(defaultEmail.text.includes("expires in 1 minute"));

  for (const accentHex of ["#ffffff", "#000000", "#808080", "#ff00ff"]) {
    const email = renderAuthOtpEmail({
      otp: "012345",
      type: "forget-password",
      expiresInSeconds: 90,
      accentHex,
    });
    const palette = createProfilePalette(accentHex);
    assert.ok(email.html.includes(`background-color:${palette.accent};`));
    assert.ok(email.html.includes(`color:${palette.onAccent};`));
    assert.ok(email.text.includes("expires in 90 seconds"));
  }

  const escapedEmail = renderAuthOtpEmail({
    otp: "<img src=x onerror=alert(1)>",
    type: "sign-in",
    expiresInSeconds,
  });
  assert.ok(escapedEmail.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!escapedEmail.html.includes("<img src=x onerror=alert(1)>"));
  assert.throws(() =>
    renderAuthOtpEmail({
      otp: "123456",
      type: "sign-in",
      expiresInSeconds,
      accentHex: "red",
    }),
  );
};

run();
console.log("Auth email template smoke checks passed.");
