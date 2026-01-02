import { Filters, Listing, SourceConfig } from "../models/types.js";

export type Scraper = (config: SourceConfig, filters: Filters) => Promise<Listing[]>;

export type ScraperRegistry = Record<string, Scraper>;

