import fs from "fs";
import path from "path";
import { Listing } from "../models/types.js";
import { makeHash } from "../utils/hash.js";

const sentPath = path.resolve("storage", "sent.json");

type SentRecord = { siteKey: string; listingId: string; hash: string; notifiedAt: string };

const ensureFile = () => {
  if (!fs.existsSync(sentPath)) {
    fs.mkdirSync(path.dirname(sentPath), { recursive: true });
    fs.writeFileSync(sentPath, "[]", "utf-8");
  }
};

export const loadSent = (): SentRecord[] => {
  ensureFile();
  return JSON.parse(fs.readFileSync(sentPath, "utf-8"));
};

export const saveSent = (records: SentRecord[]) => {
  ensureFile();
  fs.writeFileSync(sentPath, JSON.stringify(records, null, 2));
};

export const filterNewListings = (listings: Listing[]): Listing[] => {
  const records = loadSent();
  const existing = new Set(records.map((r) => `${r.siteKey}:${r.listingId}`));
  return listings.filter((l) => !existing.has(`${l.siteKey}:${l.listingId}`));
};

export const appendSent = (listings: Listing[]) => {
  const records = loadSent();
  const now = new Date().toISOString();
  const next = listings.map((l) => ({
    siteKey: l.siteKey,
    listingId: l.listingId,
    hash: makeHash(`${l.siteKey}-${l.listingId}`),
    notifiedAt: now,
  }));
  saveSent([...records, ...next]);
};

