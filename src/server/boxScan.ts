import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { AIRCRAFT_TYPES, AIRLINES, MODEL_MANUFACTURERS, SCALES } from "@/data/reference";
import { BOX_READING_JSON_SCHEMA, boxReading, type BoxReading } from "@/lib/boxScan";
import { HttpError } from "./http";

/**
 * Reads the packaging of a model aircraft with Claude's vision. Turned on by ANTHROPIC_API_KEY;
 * without it the photo button is hidden and nothing leaves the server.
 */
export const boxScanEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const MODEL = "claude-opus-5-5";

/** Long edge the vision model works best with; larger photos only cost upload time. */
const VISION_EDGE = 1568;

export async function prepareBoxPhoto(input: Buffer): Promise<string> {
  const img = sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
  const meta = await img.metadata();
  if (!meta.format || !["jpeg", "png", "webp", "avif", "heif", "tiff"].includes(meta.format)) throw new Error("unsupported");
  // Re-encoding drops EXIF (GPS) before anything is sent on.
  const out = await img.resize({ width: VISION_EDGE, height: VISION_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return out.toString("base64");
}

/* The reference lists are fixed per release, so this prompt is byte-stable and cacheable. */
const SYSTEM = `You read the packaging of collectible airliner models (die-cast and plastic, 1:200, 1:400, 1:500 and other scales) from photos and extract what the box says, for a collector's database.

How these boxes are laid out:
- The model brand (NG Models, JC Wings, GeminiJets, Herpa, Phoenix, Aviation400, Inflight200, Panda Models, Hogan, Dragon Wings, Aeroclassics, Big Bird, Sky500 …) is the "manufacturer". Airbus or Boeing are the aircraft maker, never the manufacturer.
- The item number is the brand's catalog number. It is usually printed big near the brand logo or on an end flap or sticker (e.g. NG "58012", JC Wings "XX40123" or "LH4SWR123", GeminiJets "GJ2134", Herpa "534567-001", Phoenix "11845", Aviation400 "AV4123"). Do not confuse it with the barcode digits, a registration, a production date or the scale.
- The registration is the aircraft's tail number (HB-JNA, D-AIXA, N12345, B-18901, JA873A). It is often on a side label or sticker next to the airline and type.
- Scale is printed as 1:400, 1/400 or "1:400 scale".
- Special liveries have a name (Star Alliance, oneworld, "Retro", "Fan Hansa", "100 Years", a sports team, a promotional film). A standard airline livery has no livery name.
- Several photos may show different sides of the same box. Combine them.

Rules:
- Report only what is visible. certainty "printed" = clearly legible on the box. "unclear" = partly legible, blurred or cut off: give your best reading. "inferred" = not printed but clear from what you see (an airline identified by its logo, a type identified from the model illustration).
- itemNumber, registration and barcode must be read from the box: "printed" or "unclear", never "inferred". If they are not legible, return null.
- Do not guess a scale from the brand. A scale counts as inferred only if the box shows it indirectly (e.g. "400 series").
- Use the exact spelling from the lists below when the box clearly means that entry (e.g. "SWISS" → "Swiss Int. Airlines", "B777-300ER" → "Boeing 777-300ER", "Gemini Jets" → "GeminiJets"). Otherwise copy the text from the box.
- extras: further facts printed on the box, short (e.g. "Limited edition 1 of 600", "Flaps down", "With stand", "Interchangeable gear", "Release 2024").
- warnings: problems the user can fix with another photo (blurry, glare, label cut off, several different models, not a model box). Write them in the language given in the request. Empty if the photo is fine.
- If the photo shows no model box at all, set isModelBox to false and every value to null.

Known model brands: ${MODEL_MANUFACTURERS.map((m) => m[0]).join(", ")}
Common scales: ${SCALES.join(", ")}
Known aircraft types (manufacturer variant / ICAO code): ${AIRCRAFT_TYPES.map((t) => `${t[0]} ${t[2]}${t[3] ? ` / ${t[3]}` : ""}`).join("; ")}
Known airlines (name / IATA / ICAO): ${AIRLINES.map((a) => [a[0], a[1], a[2]].filter(Boolean).join(" / ")).join("; ")}`;

let client: Anthropic | null = null;

export async function readBox(photos: string[], opts: { language: "de" | "en"; ownMakers: string[] }): Promise<BoxReading> {
  if (!boxScanEnabled()) throw new HttpError(503, "box_scan_off");
  client ??= new Anthropic({ maxRetries: 1, timeout: 55_000 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = photos.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }));
  content.push({
    type: "text",
    text: [
      photos.length > 1 ? `These ${photos.length} photos show the same box from different sides.` : "This photo shows a model box.",
      opts.ownMakers.length ? `The user also collects these brands: ${opts.ownMakers.join(", ")}.` : "",
      `Language for warnings: ${opts.language === "de" ? "German" : "English"}.`,
    ].filter(Boolean).join("\n"),
  });

  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: BOX_READING_JSON_SCHEMA as unknown as Record<string, unknown> } },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "rate_limited");
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error("Box scan: the Anthropic key was rejected", e.message);
      throw new HttpError(503, "box_scan_off");
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Box scan failed", e.status, e.message);
      throw new HttpError(502, "box_scan_failed");
    }
    throw e;
  }

  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new HttpError(422, "unreadable");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return boxReading.parse(JSON.parse(text));
  } catch {
    console.error("Box scan: unexpected answer", text.slice(0, 500));
    throw new HttpError(502, "box_scan_failed");
  }
}
