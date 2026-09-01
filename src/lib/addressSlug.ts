// Address searches live in the path as a slug of the geocoder's *normalised*
// address, so a shared link reads like "/1412-northridge-dr-austin-tx-78723"
// rather than a query string. The slug is lossy - punctuation is dropped - but
// the Census geocoder is fuzzy enough to round-trip it, and the app rewrites
// the URL to the canonical slug once the address resolves.

/** "1412 NORTHRIDGE DR, AUSTIN, TX, 78723" -> "1412-northridge-dr-austin-tx-78723" */
export const toAddressSlug = (address: string) =>
  address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** A pathname back to a geocoder-friendly string. Empty for the root path. */
export const fromAddressSlug = (pathname: string) => {
  let slug = pathname.replace(/^\/+|\/+$/g, '')
  try {
    slug = decodeURIComponent(slug)
  } catch {
    /* leave as-is on a malformed escape */
  }
  if (!slug || slug === 'index.html') return ''
  return slug.replace(/-+/g, ' ').trim()
}
