import crypto from "crypto";

export const makeHash = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

