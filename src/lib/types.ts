import { z } from "zod";

export const CURRENCIES = ["EUR", "CHF", "USD", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LIVERY_CATEGORIES = ["standard", "retro", "anniversary", "special", "alliance", "promotional", "hybrid", "other"] as const;
export type LiveryCategory = (typeof LIVERY_CATEGORIES)[number];

export const STATUSES = ["collection", "wishlist", "ordered", "preordered", "sold"] as const;
export type ItemStatus = (typeof STATUSES)[number];

export const CONDITIONS = ["mint", "very_good", "good", "fair", "damaged"] as const;
export const BOX_STATUSES = ["with_box", "damaged_box", "no_box"] as const;

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const cents = z.number().int().min(0).max(1_000_000_00).nullable().optional();

/** Validated on the server for every create and update. Only type + manufacturer are required. */
export const itemInput = z.object({
  releaseId: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  airlineId: z.string().nullable().optional(),
  airlineName: optText(120),
  aircraftTypeId: z.string().nullable().optional(),
  aircraftName: z.string().trim().min(1).max(120),
  modelManufacturerName: z.string().trim().min(1).max(120),
  scale: optText(16),
  registration: optText(24),
  itemNumber: optText(60),
  barcode: optText(32),
  liveryCategory: z.enum(LIVERY_CATEGORIES).nullable().optional(),
  liveryName: optText(120),
  countryCode: z.string().length(2).nullable().optional().or(z.literal("").transform(() => null)),
  registrationCountry: z.string().length(2).nullable().optional().or(z.literal("").transform(() => null)),
  purchasePriceCents: cents,
  purchaseCurrency: z.enum(CURRENCIES).nullable().optional(),
  purchaseDate: isoDate,
  valueCents: cents,
  valueCurrency: z.enum(CURRENCIES).nullable().optional(),
  valueDate: isoDate,
  valueSource: optText(200),
  condition: z.enum(CONDITIONS).nullable().optional(),
  boxStatus: z.enum(BOX_STATUSES).nullable().optional(),
  limitedEdition: z.boolean().nullable().optional(),
  certificate: z.boolean().nullable().optional(),
  storageLocation: optText(200),
  purchaseSource: optText(200),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: optText(5000),
  priority: z.number().int().min(1).max(3).nullable().optional(),
  desiredPriceCents: cents,
  desiredCurrency: z.enum(CURRENCIES).nullable().optional(),
  expectedRelease: isoDate,
  dealer: optText(200),
});
export type ItemInput = z.infer<typeof itemInput>;
export const itemPatch = itemInput.partial();

export interface Item {
  id: string;
  releaseId: string | null;
  status: ItemStatus;
  airlineId: string | null;
  airlineName: string | null;
  aircraftTypeId: string | null;
  aircraftName: string;
  modelManufacturerName: string;
  scale: string | null;
  registration: string | null;
  itemNumber: string | null;
  barcode: string | null;
  liveryCategory: LiveryCategory | null;
  liveryName: string | null;
  countryCode: string | null;
  registrationCountry: string | null;
  purchasePriceCents: number | null;
  purchaseCurrency: Currency | null;
  purchaseDate: string | null;
  valueCents: number | null;
  valueCurrency: Currency | null;
  valueDate: string | null;
  valueSource: string | null;
  condition: (typeof CONDITIONS)[number] | null;
  boxStatus: (typeof BOX_STATUSES)[number] | null;
  limitedEdition: boolean | null;
  certificate: boolean | null;
  storageLocation: string | null;
  purchaseSource: string | null;
  rating: number | null;
  notes: string | null;
  priority: number | null;
  desiredPriceCents: number | null;
  desiredCurrency: Currency | null;
  expectedRelease: string | null;
  dealer: string | null;
  createdAt: string;
  updatedAt: string;
  imageId: string | null;
}

export interface AirlineRef {
  id: string;
  name: string;
  iata: string | null;
  icao: string | null;
  country: string | null;
  aliases: string[];
  defunct: boolean;
}
export interface AircraftRef {
  id: string;
  manufacturer: string;
  family: string;
  variant: string;
  icaoCode: string | null;
  shape: string;
  aliases: string[];
}
export interface MakerRef {
  id: string;
  name: string;
  own: boolean;
}
export interface Reference {
  airlines: AirlineRef[];
  aircraft: AircraftRef[];
  makers: MakerRef[];
}

export interface ReleaseRef {
  id: string;
  airlineId: string | null;
  airlineName: string | null;
  aircraftTypeId: string | null;
  aircraftName: string;
  modelManufacturerName: string;
  scale: string | null;
  registration: string | null;
  itemNumber: string | null;
  barcode: string | null;
  liveryCategory: LiveryCategory | null;
  liveryName: string | null;
  releaseYear: number | null;
  status: "unverified" | "verified" | "rejected" | "merged";
  sourceUrl: string | null;
  imageId: string | null;
}

export const aircraftLabel = (a: Pick<AircraftRef, "manufacturer" | "variant">) => `${a.manufacturer} ${a.variant}`;
