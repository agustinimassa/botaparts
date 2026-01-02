export type Listing = {
  siteKey: string;
  listingId: string;
  title: string;
  url: string;
  priceUSD?: number;
  location?: string;
  images?: string[];
  beds?: number;
  baths?: number;
  area?: string;
  description?: string;
  badges?: string[]; // Badges o destaques como "Nuevo listado", "Oportunidad", etc.
  rawData?: Record<string, unknown>;
};

export type Filters = {
  maxPriceUSD?: number;
  country?: string;
  city?: string;
  typeProperty?: string[];
  minBeds?: number;
  minBaths?: number;
  textMustInclude?: string[];
  textMustExclude?: string[];
};

export type SourceConfig = {
  id: string;
  siteKey: string;
  url: string;
  active: boolean;
  maxPages?: number;
  paginateParam?: string;
  selectorsProfile?: string;
  scheduleKey?: string;
};

export type NotificationPrefs = {
  emails: string[];
  whatsappNumbers: string[];
  sendHourUTC?: string;
  batchSize?: number;
  subjectTemplate?: string;
  whatsappTemplate?: string;
};

export type ExcelConfig = {
  sources: SourceConfig[];
  filters: Filters;
  notifications: NotificationPrefs;
};

