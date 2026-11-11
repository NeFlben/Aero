import { createHash } from "node:crypto";

/**
 * eBay "Marketplace Account Deletion" notifications. eBay only activates a production keyset once an
 * app has such an endpoint. Hangar stores no eBay user data (it only reads public listings), so a
 * notification needs no action beyond being acknowledged.
 *
 * EBAY_VERIFICATION_TOKEN and EBAY_DELETION_ENDPOINT must match exactly what is entered on
 * developer.ebay.com → Alerts & Notifications.
 */

/** eBay checks ownership with GET ?challenge_code=… and expects sha256(code + token + endpoint). */
export async function GET(req: Request) {
  const token = process.env.EBAY_VERIFICATION_TOKEN?.trim();
  const code = new URL(req.url).searchParams.get("challenge_code");
  if (!token || !code) return Response.json({ error: "not_configured" }, { status: 400 });
  const endpoint = process.env.EBAY_DELETION_ENDPOINT?.trim() || req.url.split("?")[0];
  const challengeResponse = createHash("sha256").update(code).update(token).update(endpoint).digest("hex");
  return Response.json({ challengeResponse });
}

/** The notification itself: nothing to delete, just acknowledge it. */
export async function POST() {
  return new Response(null, { status: 204 });
}
