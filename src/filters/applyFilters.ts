import { Filters, Listing } from "../models/types.js";

export const applyFilters = (listings: Listing[], filters: Filters): Listing[] => {
  return listings.filter((l) => {
    if (filters.maxPriceUSD && l.priceUSD && l.priceUSD > filters.maxPriceUSD) return false;
    if (filters.city && l.location && !l.location.toLowerCase().includes(filters.city.toLowerCase()))
      return false;
    if (filters.textMustInclude?.length) {
      const text = `${l.title} ${l.description ?? ""}`.toLowerCase();
      if (!filters.textMustInclude.every((t) => text.includes(t.toLowerCase()))) return false;
    }
    if (filters.textMustExclude?.length) {
      const text = `${l.title} ${l.description ?? ""}`.toLowerCase();
      if (filters.textMustExclude.some((t) => text.includes(t.toLowerCase()))) return false;
    }
    return true;
  });
};

