"""Seed Music Radar discovery jobs from the free Overture Places dataset."""

import json
import math
import os
import re
import sys
import urllib.request

import duckdb


API_BASE = os.environ.get("MUSIC_RADAR_API_BASE", "https://music-radar-one.vercel.app").rstrip("/")
SECRET = os.environ.get("MUSIC_RADAR_INGEST_SECRET", "")
STAC_URL = "https://stac.overturemaps.org/"
CATEGORY_PATTERN = (
    "live_music|music_venue|concert|jazz|performing_arts|cultural_center|"
    "art_gallery|art_center|arts_center|nightclub|event_venue|auditorium|opera_house|"
    "food_hall|food_court|public_market|marketplace|shopping_center|shopping_mall|"
    "community_center|community_centre|visitor_center|visitor_centre|tourist_information|"
    "tourism|arts_district|mixed_use"
)
ARTS_NAME_PATTERN = r"\b(?:music|arts?|jazz|theatre|theater|cultural|performing|creative|sound|gallery|concert|opera)\b"
COMMUNITY_NAME_PATTERN = r"\b(?:food hall|public market|arts district|community cent(?:er|re)|visitor cent(?:er|re)|visitors bureau|convention and visitors|tourism|mixed.use|downtown association)\b"


def json_request(url, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"User-Agent": "MusicRadarOvertureWorker/1.0", "Accept": "application/json"}
    if payload is not None:
        headers.update({"Authorization": f"Bearer {SECRET}", "Content-Type": "application/json"})
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def latest_release():
    release = str(json_request(STAC_URL).get("latest", ""))
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", release):
        raise RuntimeError("Overture STAC did not return a valid latest release.")
    return release


def query_places(connection, release, job):
    latitude = float(job["latitude"])
    longitude = float(job["longitude"])
    radius = min(max(float(job.get("radiusMiles", 15)), 5), 31)
    lat_delta = radius / 69.0
    lon_delta = radius / max(69.0 * math.cos(math.radians(latitude)), 10.0)
    path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    query = f"""
        SELECT
          names.primary AS name,
          websites[1] AS url,
          taxonomy.primary AS category,
          confidence,
          bbox.ymin AS latitude,
          bbox.xmin AS longitude
        FROM read_parquet('{path}')
        WHERE bbox.ymin BETWEEN {latitude - lat_delta} AND {latitude + lat_delta}
          AND bbox.xmin BETWEEN {longitude - lon_delta} AND {longitude + lon_delta}
          AND websites IS NOT NULL
          AND len(websites) > 0
          AND confidence >= 0.55
          AND (
            regexp_matches(lower(CAST(taxonomy AS VARCHAR)), '{CATEGORY_PATTERN}')
            OR regexp_matches(lower(names.primary), '{ARTS_NAME_PATTERN}')
            OR regexp_matches(lower(names.primary), '{COMMUNITY_NAME_PATTERN}')
          )
        ORDER BY confidence DESC
        LIMIT 100
    """
    rows = connection.execute(query).fetchall()
    return [
        {
            "name": row[0],
            "url": row[1],
            "placeCategory": row[2],
            "latitude": row[4],
            "longitude": row[5],
            "priority": (
                6
                if re.search(r"live_music|music_venue|concert|jazz", str(row[2] or ""), re.I)
                else 5 if re.search(ARTS_NAME_PATTERN, str(row[0]), re.I) else 4
            ),
        }
        for row in rows
        if row[0] and row[1]
    ]


def main():
    if not SECRET:
        raise RuntimeError("MUSIC_RADAR_INGEST_SECRET is required.")
    jobs = json_request(f"{API_BASE}/api/discover", {"action": "seed-locations", "limit": 3}).get("jobs", [])
    if not jobs:
        print("No pending discovery locations need Overture seeds.")
        return

    release = latest_release()
    connection = duckdb.connect()
    connection.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    failures = 0
    for job in jobs:
        try:
            organizations = query_places(connection, release, job)
            result = json_request(
                f"{API_BASE}/api/discover",
                {"action": "organization-seeds", "jobId": job["id"], "organizations": organizations},
            )
            print(f"{job['id']}: submitted {result.get('accepted', 0)} Overture organizations")
        except Exception as error:  # Keep other geographic cells moving.
            failures += 1
            print(f"{job.get('id', 'unknown')}: Overture query failed: {error}", file=sys.stderr)
    if failures == len(jobs):
        raise RuntimeError("Every Overture place query failed.")


if __name__ == "__main__":
    main()
