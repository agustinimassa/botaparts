import crypto from "crypto";
export const makeHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
