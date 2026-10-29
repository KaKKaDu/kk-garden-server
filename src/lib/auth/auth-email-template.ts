import type { emailOTP } from "better-auth/plugins";
import {
  createProfilePalette,
  DEFAULT_PROFILE_ACCENT_HEX,
} from "@kk-garden/shared/constants";

type SendVerificationOTP = Parameters<
  typeof emailOTP
>[0]["sendVerificationOTP"];

export type AuthOtpEmailInput = {
  otp: string;
  type: Parameters<SendVerificationOTP>[0]["type"];
  expiresInSeconds: number;
  accentHex?: string;
};

export type AuthOtpEmailContent = {
  subject: string;
  text: string;
  html: string;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case String.fromCharCode(34):
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const formatExpiry = (expiresInSeconds: number): string => {
  if (expiresInSeconds % 60 !== 0) {
    return `${expiresInSeconds} seconds`;
  }
  const minutes = expiresInSeconds / 60;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
};

export const renderAuthOtpEmail = ({
  otp,
  type,
  expiresInSeconds,
  accentHex = DEFAULT_PROFILE_ACCENT_HEX,
}: AuthOtpEmailInput): AuthOtpEmailContent => {
  const palette = createProfilePalette(accentHex);
  const subject =
    type === "sign-in"
      ? "Your kk-garden sign-in code"
      : "Your kk-garden verification code";
  const expiry = formatExpiry(expiresInSeconds);
  const escapedOtp = escapeHtml(otp);

  const text = [
    `Your kk-garden code is: ${otp}`,
    "",
    `This code expires in ${expiry} and can only be used once.`,
    "Do not share this code with anyone.",
    "",
    "If you did not request this code, you can ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6f4;color:${palette.onSurface};font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;font-size:1px;color:#f4f6f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      Your one-time kk-garden code is inside.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f4;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:${palette.surface};">
            <tr>
              <td style="padding:32px 28px 28px;">
                <p style="margin:0 0 24px;color:${palette.accentText};font-size:15px;font-weight:700;letter-spacing:0.04em;">kk-garden</p>
                <h1 style="margin:0 0 12px;color:${palette.onSurface};font-size:24px;line-height:1.3;font-weight:700;">${escapeHtml(subject)}</h1>
                <p style="margin:0 0 24px;color:${palette.onSurface};font-size:16px;line-height:1.5;">Use this one-time code to continue:</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${palette.accent}" style="padding:20px 16px;background-color:${palette.accent};color:${palette.onAccent};">
                      <p style="margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.12em;">YOUR CODE</p>
                      <p style="margin:0;font-size:32px;line-height:1.3;font-weight:700;letter-spacing:0.18em;color:${palette.onAccent};">${escapedOtp}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;color:${palette.onSurface};font-size:14px;line-height:1.5;">This code expires in ${escapeHtml(expiry)} and can only be used once.</p>
                <p style="margin:12px 0 0;color:${palette.onSurface};font-size:14px;line-height:1.5;">Do not share this code with anyone.</p>
                <p style="margin:20px 0 0;color:${palette.onSurface};font-size:14px;line-height:1.5;">If you did not request this code, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
};
