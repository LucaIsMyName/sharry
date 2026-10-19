type GeoHit = { countryCode: string | null; region: string | null }

type GeoReader = {
  get(ip: string): { country?: { iso_code?: string }; subdivisions?: { iso_code?: string }[] } | null
}

let readerPromise: Promise<GeoReader | null> | null = null

export async function lookupGeo(ip: string, dbPath: string): Promise<GeoHit> {
  if (!dbPath || !ip || ip === '127.0.0.1' || ip === '::1') return { countryCode: null, region: null }
  const reader = await openReader(dbPath)
  if (!reader) return { countryCode: null, region: null }
  try {
    const hit = reader.get(ip)
    return {
      countryCode: hit?.country?.iso_code ?? null,
      region: hit?.subdivisions?.[0]?.iso_code ?? null,
    }
  } catch {
    return { countryCode: null, region: null }
  }
}

function openReader(dbPath: string): Promise<GeoReader | null> {
  readerPromise ??= import('maxmind')
    .then(async (mod) => {
      const lookup = await mod.open(dbPath)
      return lookup as unknown as GeoReader
    })
    .catch(() => null)
  return readerPromise
}
