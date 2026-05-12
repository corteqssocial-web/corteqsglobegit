"""Backfill canonical location fields for legacy pins.

Usage:
  cd backend
  python backfill_locations.py
"""

import asyncio

from server import canonicalize_city_name, fetch_google_location_results, sb


async def main():
    response = (
        sb.table("pins")
        .select("id, city, canonical_city, country_code, provider, provider_id, location_label")
        .or_("canonical_city.is.null,canonical_city.eq.")
        .limit(200)
        .execute()
    )
    rows = response.data or []
    print(f"Found {len(rows)} legacy pins to backfill.")

    for row in rows:
        city = (row.get("city") or "").strip()
        if not city:
            continue

        results = await fetch_google_location_results(city)
        top = results[0] if results else None
        payload = {
            "canonical_city": top.get("canonical_name") if top else canonicalize_city_name(city),
            "location_label": top.get("label") if top else city,
            "country_code": top.get("country_code") if top else "",
            "provider": top.get("provider") if top else "",
            "provider_id": top.get("provider_id") if top else "",
        }
        sb.table("pins").update(payload).eq("id", row["id"]).execute()
        print(f"Updated {row['id']} -> {payload['canonical_city']}")


if __name__ == "__main__":
    asyncio.run(main())
