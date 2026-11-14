// Checks Payhip licence keys. Each pack is a Payhip product with licence keys switched on;
// its product secret key (kept as an Amplify secret, never in the browser) is how we ask Payhip
// whether a key belongs to that product. https://help.payhip.com/article/317-software-license-keys-new
//
// A key is checked against each pack's product in turn. Payhip answers with the key's details
// for the right product and with nothing for the others. A refunded key comes back disabled.

import { createHash } from 'node:crypto'
import { RequestError } from './generate.js'

const API = 'https://payhip.com/api/v2/license'

export const PAYHIP_DOWN = "We couldn't check your key with Payhip just now. Please try again in a minute."

// The key as stored in our Codes table: a hash, so the database never holds usable keys.
export const purchaseId = (key) => `PAYHIP#${createHash('sha256').update(String(key).trim()).digest('hex')}`

// products: [{ id, name, questions, secret }] with secret set to the product secret key itself.
// Returns { product, enabled, uses } or null if no pack recognises the key.
export async function verifyPayhipKey(key, { products, fetchImpl = fetch }) {
  const licence = String(key ?? '').trim()
  if (!licence || licence.length > 100) return null
  for (const product of products) {
    if (!product.secret) continue
    let response
    try {
      response = await fetchImpl(`${API}/verify?license_key=${encodeURIComponent(licence)}`, {
        headers: { 'product-secret-key': product.secret },
      })
    } catch {
      throw new RequestError(503, PAYHIP_DOWN)
    }
    if (response.status >= 500) throw new RequestError(503, PAYHIP_DOWN)
    if (!response.ok) continue
    const text = await response.text()
    if (!text.trim()) continue
    let data
    try {
      data = JSON.parse(text)?.data
    } catch {
      continue
    }
    if (!data) continue
    return { product, enabled: data.enabled !== false, uses: Number(data.uses) || 0 }
  }
  return null
}

// Tells Payhip the key has been used, so it shows as used in Payhip too. Best effort: our own
// database is what stops a key being redeemed twice.
export async function markPayhipKeyUsed(key, product, { fetchImpl = fetch } = {}) {
  try {
    await fetchImpl(`${API}/usage`, {
      method: 'PUT',
      headers: { 'product-secret-key': product.secret, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ license_key: String(key).trim() }).toString(),
    })
  } catch (error) {
    console.error('Payhip usage update failed', error)
  }
}
