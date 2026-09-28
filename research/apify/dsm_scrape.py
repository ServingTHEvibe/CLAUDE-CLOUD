#!/usr/bin/env python3
"""Des Moines metro lead scrape (see research/des-moines-business-needs-2026.md, section 6).

Steps:
  1. Google Maps places for each category x suburb   (compass/crawler-google-places)
  2. 1-3 star reviews for places that look weak        (compass/Google-Maps-Reviews-Scraper)
  3. Meta Ads Library check per business              (apify/facebook-ads-scraper)
  4. Score and write research/data/dsm-leads-<date>.csv

Auth: set APIFY_TOKEN, or run where a proxy injects Apify credentials.
Needs outbound access to api.apify.com.

Usage:
  python3 research/apify/dsm_scrape.py --dry-run          # show plan and estimated volume
  python3 research/apify/dsm_scrape.py                    # full run
  python3 research/apify/dsm_scrape.py --skip-reviews --skip-ads --per-search 10   # cheap test
  python3 research/apify/dsm_scrape.py --score-only research/data/raw-places.json
"""
import argparse, csv, datetime, json, os, re, sys, time, urllib.parse, urllib.request

API = "https://api.apify.com/v2"
PLACES_ACTOR = "compass~crawler-google-places"
REVIEWS_ACTOR = "compass~Google-Maps-Reviews-Scraper"
ADS_ACTOR = "apify~facebook-ads-scraper"

SUBURBS = ["Des Moines", "West Des Moines", "Ankeny", "Urbandale",
           "Johnston", "Clive", "Waukee", "Altoona"]
CATEGORIES = {
    "restaurant": ["restaurant", "cafe", "caterer"],
    "home-services": ["HVAC contractor", "plumber", "electrician"],
    "lawn": ["lawn care service", "landscaper", "snow removal service"],
    "salon": ["hair salon", "barber shop", "day spa"],
    "auto": ["auto repair shop", "used car dealer"],
    "fitness": ["gym", "fitness studio"],
}
COMPLAINT_PATTERNS = [
    r"never (called|call) (me )?back", r"never followed? up", r"no answer",
    r"(didn'?t|did not|never) (answer|pick up|respond|return)", r"voicemail",
    r"couldn'?t (book|get (in|an appointment|through))", r"hard to (get in|book|reach)",
    r"website", r"no.?show", r"wait(ed)? (for )?(an )?hour", r"rude",
]
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def api(method, path, body=None, params=None):
    params = dict(params or {})
    token = os.environ.get("APIFY_TOKEN")
    if token:
        params["token"] = token
    url = f"{API}{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read() or b"null")


def run_actor(actor, run_input, label):
    run = api("POST", f"/acts/{actor}/runs", run_input)["data"]
    print(f"[{label}] started run {run['id']}", flush=True)
    while run["status"] in ("READY", "RUNNING"):
        time.sleep(15)
        run = api("GET", f"/actor-runs/{run['id']}")["data"]
    if run["status"] != "SUCCEEDED":
        print(f"[{label}] run {run['id']} ended {run['status']}", file=sys.stderr)
    items, offset = [], 0
    while True:
        page = api("GET", f"/datasets/{run['defaultDatasetId']}/items",
                   params={"clean": 1, "offset": offset, "limit": 1000})
        items += page
        if len(page) < 1000:
            break
        offset += 1000
    usd = (run.get("usageTotalUsd") or 0)
    print(f"[{label}] {len(items)} items, ${usd:.2f}", flush=True)
    return items


def industry_of(query):
    for ind, qs in CATEGORIES.items():
        if query in qs:
            return ind
    return "other"


def scrape_places(per_search):
    places = {}
    for town in SUBURBS:
        queries = [q for qs in CATEGORIES.values() for q in qs]
        items = run_actor(PLACES_ACTOR, {
            "searchStringsArray": queries,
            "locationQuery": f"{town}, Iowa, USA",
            "maxCrawledPlacesPerSearch": per_search,
            "language": "en",
            "skipClosedPlaces": True,
            "maxReviews": 0,
            "maxImages": 0,
        }, f"places {town}")
        for p in items:
            key = p.get("placeId") or p.get("url")
            if key and key not in places:
                p["_industry"] = industry_of(p.get("searchString", ""))
                p["_suburb"] = town
                places[key] = p
    return list(places.values())


def needs_review_check(p):
    return (p.get("totalScore") or 5) < 4.6 or (p.get("reviewsCount") or 0) < 400


def scrape_reviews(places, per_place):
    targets = [p for p in places if p.get("url") and needs_review_check(p)]
    hits = {}
    for i in range(0, len(targets), 50):
        chunk = targets[i:i + 50]
        items = run_actor(REVIEWS_ACTOR, {
            "startUrls": [{"url": p["url"]} for p in chunk],
            "maxReviews": per_place,
            "reviewsSort": "lowestRanking",
            "language": "en",
        }, f"reviews {i // 50 + 1}")
        for r in items:
            if (r.get("stars") or 5) > 3:
                continue
            text = (r.get("text") or "").lower()
            matched = [pat for pat in COMPLAINT_PATTERNS if re.search(pat, text)]
            if matched:
                h = hits.setdefault(r.get("placeId") or r.get("url"), [])
                h.append({"stars": r.get("stars"), "text": r.get("text", "")[:300],
                          "matched": matched})
    return hits


def ads_library_url(name):
    q = urllib.parse.quote(name)
    return ("https://www.facebook.com/ads/library/?active_status=active&ad_type=all"
            f"&country=US&q={q}&search_type=keyword_unordered&media_type=all")


def scrape_ads(places, per_business):
    active = {}
    for i in range(0, len(places), 100):
        chunk = places[i:i + 100]
        items = run_actor(ADS_ACTOR, {
            "startUrls": [{"url": ads_library_url(p.get("title", ""))}
                          for p in chunk],
            "resultsLimit": per_business,
        }, f"ads {i // 100 + 1}")
        for ad in items:
            page = (ad.get("pageName") or ad.get("page_name") or "").lower()
            for p in chunk:
                if p.get("title") and p["title"].lower() in page:
                    active[p.get("placeId")] = True
    return active


def score(p, complaints, running_ads):
    s, why = 0, []
    if not p.get("website"):
        s += 3; why.append("no website")
    rc = p.get("reviewsCount") or 0
    if rc < 25:
        s += 2; why.append(f"only {rc} reviews")
    elif rc < 75:
        s += 1; why.append(f"{rc} reviews")
    if (p.get("totalScore") or 5) < 4.0:
        s += 1; why.append(f"rating {p.get('totalScore')}")
    if complaints:
        s += 2 + min(len(complaints), 3); why.append(f"{len(complaints)} complaint reviews")
    if running_ads is False:
        s += 1; why.append("no active Meta ads")
    elif running_ads:
        why.append("already runs Meta ads (warm buyer)")
    tier = "hot" if s >= 5 else "warm" if s >= 3 else "cold"
    return s, tier, "; ".join(why)


def write_csv(places, hits, ads, ads_checked):
    os.makedirs(DATA_DIR, exist_ok=True)
    out = os.path.join(DATA_DIR, f"dsm-leads-{datetime.date.today()}.csv")
    rows = []
    for p in places:
        pid = p.get("placeId")
        comp = hits.get(pid) or hits.get(p.get("url")) or []
        running = ads.get(pid, False) if ads_checked else None
        s, tier, why = score(p, comp, running)
        rows.append({
            "score": s, "tier": tier, "name": p.get("title"),
            "industry": p["_industry"], "category": p.get("categoryName"),
            "suburb": p["_suburb"], "address": p.get("address"),
            "phone": p.get("phone"), "website": p.get("website"),
            "rating": p.get("totalScore"), "reviews": p.get("reviewsCount"),
            "meta_ads": "" if running is None else ("yes" if running else "no"),
            "why": why,
            "sample_complaint": comp[0]["text"] if comp else "",
            "maps_url": p.get("url"),
        })
    rows.sort(key=lambda r: -r["score"])
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"wrote {len(rows)} leads -> {out}")
    print("tiers:", {t: sum(r["tier"] == t for r in rows) for t in ("hot", "warm", "cold")})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-search", type=int, default=25, help="places per query per suburb")
    ap.add_argument("--reviews-per-place", type=int, default=15)
    ap.add_argument("--ads-per-business", type=int, default=3)
    ap.add_argument("--skip-reviews", action="store_true")
    ap.add_argument("--skip-ads", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--score-only", metavar="RAW_JSON", help="rescore a saved raw-places.json")
    a = ap.parse_args()

    n_queries = sum(len(q) for q in CATEGORIES.values()) * len(SUBURBS)
    if a.dry_run:
        print(f"{len(SUBURBS)} suburbs x {n_queries // len(SUBURBS)} queries = {n_queries} searches")
        print(f"up to {n_queries * a.per_search} raw places before dedupe "
              f"(Google Maps scraper is roughly $4 per 1,000 places)")
        return

    os.makedirs(DATA_DIR, exist_ok=True)
    raw_path = os.path.join(DATA_DIR, "raw-places.json")
    if a.score_only:
        raw = json.load(open(a.score_only))
        places, hits, ads = raw["places"], raw.get("hits", {}), raw.get("ads", {})
        write_csv(places, hits, ads, bool(raw.get("ads_checked")))
        return

    places = scrape_places(a.per_search)
    json.dump({"places": places}, open(raw_path, "w"))
    hits = {} if a.skip_reviews else scrape_reviews(places, a.reviews_per_place)
    ads = {} if a.skip_ads else scrape_ads(places, a.ads_per_business)
    json.dump({"places": places, "hits": hits, "ads": ads, "ads_checked": not a.skip_ads},
              open(raw_path, "w"))
    write_csv(places, hits, ads, not a.skip_ads)


if __name__ == "__main__":
    main()
