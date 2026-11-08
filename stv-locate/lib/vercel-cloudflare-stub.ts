/**
 * Used only for the Vercel test copy (STV_TARGET=vercel). Cloudflare D1/R2 bindings
 * do not exist there, so cloud routes report "unavailable" and the app runs in
 * on-device capture mode.
 */
export const env: { DB?: undefined; BUCKET?: undefined } = {};
