"""Outscraper backend for dsm_scrape.py.

Mirrors the app.outscraper.cloud Google Maps settings the run was set up with:
limit=500, drop duplicates, region US, language en.
Auth: OUTSCRAPER_API_KEY. Needs outbound access to api.app.outscraper.com.

Results are mapped onto the Apify field names (title, website, totalScore, ...)
so dsm_scrape.score() and write_csv() work unchanged.
"""
import json, os, sys, time, urllib.parse, urllib.request

API = "https://api.app.outscraper.com"


def _get(path, params):
    key = os.environ.get("OUTSCRAPER_API_KEY")
    if not key:
        sys.exit("OUTSCRAPER_API_KEY is not set")
    url = f"{API}{path}?{urllib.parse.urlencode(params, doseq=True)}"
    req = urllib.request.Request(url, headers={"X-API-KEY": key})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def _run(path, params, label):
    """Submit an async request and poll until it finishes. Returns the data list."""
    job = _get(path, {**params, "async": "true"})
    print(f"[{label}] request {job['id']}", flush=True)
    while True:
        time.sleep(20)
        res = _get(f"/requests/{job['id']}", {})
        if res.get("status") != "Pending":
            break
    if res.get("status") != "Success":
        print(f"[{label}] request {job['id']} ended {res.get('status')}", file=sys.stderr)
    return res.get("data") or []


def _normalize(p, query, industry, town):
    return {
        "placeId": p.get("place_id"), "title": p.get("name"),
        "categoryName": p.get("category") or p.get("type"),
        "address": p.get("full_address"), "phone": p.get("phone"),
        "website": p.get("site"), "totalScore": p.get("rating"),
        "reviewsCount": p.get("reviews"), "url": p.get("location_link"),
        "searchString": query, "_industry": industry, "_suburb": town,
    }


def scrape_places(suburbs, categories, limit):
    places = {}
    for town in suburbs:
        queries = [(f"{q}, {town}, IA, USA", q, ind)
                   for ind, qs in categories.items() for q in qs]
        # One request per suburb; Outscraper returns one result list per query.
        data = _run("/maps/search-v3", {
            "query": [full for full, _, _ in queries], "limit": limit,
            "language": "en", "region": "US", "dropDuplicates": "true",
        }, f"places {town}")
        for (_, q, ind), results in zip(queries, data):
            for p in results or []:
                n = _normalize(p, q, ind, town)
                key = n["placeId"] or n["url"]
                if key and key not in places:
                    places[key] = n
    return list(places.values())


def scrape_reviews(targets, per_place, match):
    """match(text) -> list of matched complaint patterns."""
    hits = {}
    for i in range(0, len(targets), 25):
        chunk = targets[i:i + 25]
        data = _run("/maps/reviews-v3", {
            "query": [p["placeId"] for p in chunk], "reviewsLimit": per_place,
            "sort": "lowest_rating", "language": "en",
        }, f"reviews {i // 25 + 1}")
        for place in data:
            for r in place.get("reviews_data") or []:
                if (r.get("review_rating") or 5) > 3:
                    continue
                text = r.get("review_text") or ""
                matched = match(text)
                if matched:
                    hits.setdefault(place.get("place_id"), []).append(
                        {"stars": r.get("review_rating"), "text": text[:300],
                         "matched": matched})
    return hits
