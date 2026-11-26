"""Collect public landslide news and export reviewable evidence. Run as a separate job."""

import argparse
import csv
import hashlib
import json
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from incident_updates import COLLECTION, article_identity

SOURCES = {
    "Bernama": ("bernama.com", "https://www.bernama.com/en/general/"),
    "RTM": ("berita.rtm.gov.my", "https://berita.rtm.gov.my/nasional/"),
    "NADMA": ("mydims.nadma.gov.my", "https://mydims.nadma.gov.my/awam/laporan-situasi-semasa"),
    "JMG": ("jmg.gov.my", "https://www.jmg.gov.my/"),
    "JBPM": ("bomba.gov.my", "https://www.bomba.gov.my/"),
    "JKR": ("jkr.gov.my", "https://www.jkr.gov.my/"),
}
OFFICIAL = {"NADMA", "JMG", "JBPM", "JKR"}
TERMS = re.compile(r"\b(landslides?|landslips?|tanah runtuh|gelongsoran tanah|slope collapse)\b", re.I)
ALERT = re.compile(r"\b(denies|denied|risk|risiko|amaran|menafikan|waspada|drill|simulasi)\b", re.I)
STATES = ("Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
          "Penang", "Pulau Pinang", "Perak", "Perlis", "Sabah", "Sarawak",
          "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan")
MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split()
MONTH_ALIASES = {"mac": "mar", "mei": "may", "ogo": "aug", "okt": "oct", "dis": "dec"}
MYT = timezone(timedelta(hours=8))


def source_for(url):
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return None
    return next((name for name, (domain, _) in SOURCES.items()
                 if host == domain or host.endswith("." + domain)), None)


def canonical(url):
    parsed = urlsplit(url)
    query = urlencode(sorted((key, value) for key, value in parse_qsl(parsed.query)
                             if not key.startswith("utm_") and key not in {"fbclid", "gclid"}))
    return article_identity(urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip("/"), query, "")))


class PublisherRedirect(HTTPRedirectHandler):
    def __init__(self, source):
        self.source = source

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        allowed = (source_for(newurl) == self.source if self.source
                   else urlsplit(newurl).scheme == "https" and urlsplit(newurl).hostname == "api.gdeltproject.org")
        if not allowed:
            raise ValueError("Unexpected publisher redirect")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fetch(url, allowed_source=None):
    opener = build_opener(PublisherRedirect(allowed_source))
    for attempt in range(2):
        try:
            request = Request(url, headers={"User-Agent": "MalaysiaLandslideFYP/1.0"})
            with opener.open(request, timeout=8) as response:
                destination = response.geturl()
                if allowed_source and source_for(destination) != allowed_source:
                    raise ValueError("Unexpected publisher redirect")
                encoding = response.headers.get_content_charset() or "utf-8"
                content = response.read(2_000_001)
                if len(content) > 2_000_000:
                    raise ValueError("Response exceeds supported size")
                return content.decode(encoding, errors="replace")
        except OSError:
            if attempt:
                raise
            time.sleep(5)


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.meta, self.links, self.paragraphs = {}, [], []
        self.tag, self.text, self.href = "", [], ""
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "time" and attrs.get("datetime"):
            self.meta.setdefault("time", attrs["datetime"])
        if tag == "meta":
            key = attrs.get("property") or attrs.get("name") or attrs.get("itemprop")
            if key:
                self.meta[key] = attrs.get("content") or ""
        if tag in {"a", "p", "h1", "title"}:
            self.tag, self.text, self.href = tag, [], attrs.get("href") or ""

    def handle_data(self, data):
        if self.tag:
            self.text.append(data)
        if re.fullmatch(r"\s*\d{2}/\d{2}/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M\s*", data, re.I):
            self.meta.setdefault("visible_timestamp", data)

    def handle_endtag(self, tag):
        if tag != self.tag:
            return
        value = " ".join(" ".join(self.text).split())
        if tag == "a" and self.href:
            self.links.append((self.href, value))
        elif tag == "p" and value:
            self.paragraphs.append(value)
        elif tag in {"h1", "title"}:
            self.meta.setdefault(tag, value)
        self.tag = ""


def parse_date(value):
    match = re.search(r"\b(\d{4}-\d{2}-\d{2})(?!\d)", value or "")
    if match:
        try:
            return date.fromisoformat(match[1])
        except ValueError:
            return None
    match = re.search(r"\b(\d{1,2})[ /-]([a-z]{3,9}|\d{1,2})[ /,-]+(\d{4})\b", value or "", re.I)
    if match:
        day, month, year = match.groups()
        month_name = month[:3].lower()
        try:
            number = int(month) if month.isnumeric() else MONTHS.index(MONTH_ALIASES.get(month_name, month_name)) + 1
            return date(int(year), number, int(day))
        except ValueError:
            return None
    return None


def extract(url, page):
    source = source_for(url)
    title = page.meta.get("og:title") or page.meta.get("h1") or page.meta.get("title", "")
    paragraphs = [p for p in page.paragraphs if TERMS.search(p)]
    description = page.meta.get("og:description") or page.meta.get("description", "")
    lead = paragraphs[0] if paragraphs else description
    if not TERMS.search(title) or ALERT.search(title) or not lead:
        return None
    published = next((value for key in ("article:published_time", "datePublished", "pubdate", "date", "time", "visible_timestamp")
                      if (value := parse_date(page.meta.get(key)))), None)
    text = title + " " + lead
    state = next((item for item in STATES if re.search(r"\b" + re.escape(item) + r"\b", text, re.I)), None)
    dateline = re.match(r"^([A-Z][A-Z ]{2,30}),\s*(?:\d{1,2}|[A-Za-z]{3,9}\s+\d)", lead)
    locality = re.search(r"\b(?:FT\s*\d+\s+)?(?:Jalan|Taman|Kampung|Persiaran)\s+[\w–-]+(?:[ -][\w–-]+){0,3}", title, re.I)
    if locality:
        locality = re.split(r"\s+(?:closed|ditutup|susulan|blocked|closure)\b", locality[0], maxsplit=1, flags=re.I)[0]
    else:
        named_place = re.search(r"\b(?:landslide\s+in|tanah runtuh\s+di)\s+([\w -]+),", title, re.I)
        locality = named_place[1].strip() if named_place else None
    district_match = re.search(r"\b(?:district of|daerah) ([\w-]+(?: [\w-]+)?)(?=[,.'’])", text, re.I)
    district = district_match[1] if district_match else None
    if not (state or district or locality or dateline):
        return None
    occurrence = None
    if published:
        if re.search(r"\b(yesterday|semalam)\b", lead, re.I):
            occurrence = published - timedelta(days=1)
        elif re.search(r"\b(today|this morning|hari ini|pagi tadi)\b", lead, re.I):
            occurrence = published
    authorities = sorted({authority for authority in OFFICIAL if re.search(r"\b" + authority + r"\b", text, re.I)}
                         | ({source} if source in OFFICIAL else set()))
    image = urljoin(url, page.meta.get("og:image", ""))
    return {
        "url": url, "publisher": source, "title": title,
        "image": ({"url": image, "credit": f"Article preview · {source}"}
                  if page.meta.get("og:image") and source_for(image) == source else None),
        "publication_date": published.isoformat() if published else None,
        "occurrence_date": occurrence.isoformat() if occurrence else None,
        "state": state, "district": district, "locality": locality,
        "description": lead[:450], "authorities": authorities,
        "latitude": None, "longitude": None, "coordinate_precision": None,
        "occurrence_time": None, "landslide_type": None, "trigger": None,
        "rainfall_description": None, "casualties": None, "damage": None,
        "road_closure": bool(re.search(r"\b(closed|closure|ditutup|penutupan)\b", text, re.I)) or None,
        "direct_observation": bool(source in OFFICIAL and re.search(
            r"\b(our (?:team|officers) (?:inspected|confirmed|observed)|(?:pasukan|anggota) kami (?:mengesahkan|meninjau))\b",
            lead, re.I)),
        "missing_information": ["event coordinates", "independent source confirmation"],
    }


def discover(source, homepage):
    page = Page(fetch(homepage, source))
    urls = [urljoin(homepage, href) for href, title in page.links if TERMS.search(title)]
    return [url for url in urls if source_for(url) == source]


def search_bernama(term):
    links = []
    for page in range(1, 4):
        query = urlencode({"cat1": "all", "submit": "cari", "terms": term, "page": page})
        try:
            links.extend(discover("Bernama", "https://www.bernama.com/en/search.php?" + query))
        except (OSError, ValueError):
            if not links:
                raise
            break
    return list(dict.fromkeys(links))


def gdelt(start, end):
    domains = " OR ".join(f"domain:{domain}" for domain, _ in SOURCES.values())
    params = {
        "query": f'("landslide" OR "landslides" OR "tanah runtuh") ({domains})',
        "mode": "artlist", "format": "json", "maxrecords": 75, "sort": "datedesc",
        "startdatetime": start.strftime("%Y%m%d") + "000000",
        "enddatetime": end.strftime("%Y%m%d") + "235959",
    }
    result = json.loads(fetch("https://api.gdeltproject.org/api/v2/doc/doc?" + urlencode(params)))
    return [row["url"] for row in result.get("articles", []) if source_for(row.get("url", ""))]


def match_key(row):
    location = row.get("locality")
    if not (location and row.get("occurrence_date") and row.get("state")):
        return None
    return (row["occurrence_date"], row["state"].casefold(), " ".join(re.findall(r"\w+", location.casefold())))


def candidates(articles):
    groups = {}
    for key, article in articles.items():
        groups.setdefault(match_key(article) or key, []).append((key, article))
    events = []
    for evidence in groups.values():
        key, first = evidence[0]
        reports = [article for _, article in evidence]
        authorities = set().union(*(row["authorities"] for row in reports))
        # News syndication and shared authority statements never establish independence.
        direct = [row for row in reports if row["publisher"] in OFFICIAL
                  and row["authorities"] == [row["publisher"]] and row.get("direct_observation")]
        independent = len({row["publisher"] for row in direct}) >= 2
        status = ("VERIFIED" if independent else "PARTIALLY_VERIFIED"
                  if first["occurrence_date"] and first["state"] else "PENDING_REVIEW")
        events.append({
            **first, "id": "collected-" + hashlib.sha256(key.encode()).hexdigest()[:20],
            "verification_status": status, "authorities": sorted(authorities),
            "evidence": reports, "ml_eligible": False,
        })
    return events


def inventory_duplicates(events):
    inventory = Path(__file__).resolve().parents[2] / "data/processed/inventory/event_candidates.csv"
    with inventory.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    matches = []
    for event in events:
        if not event["occurrence_date"]:
            continue
        for row in rows:
            same_date = event["occurrence_date"] == row["event_date"]
            same_state = event["state"] and event["state"].casefold() == row["state_raw"].casefold()
            locality = event["locality"]
            same_place = locality and locality.casefold() in row["location_raw"].casefold()
            if same_date and (same_state or same_place):
                matches.append({"id": event["id"], "inventory_id": row["event_candidate_id"],
                                "source": row["source"], "reason": "Same date and state or locality"})
    return matches


def write_atomic(path, write, encoding="utf-8"):
    with tempfile.NamedTemporaryFile(mode="w", encoding=encoding, newline="", dir=path.parent,
                                     delete=False) as stream:
        temporary = Path(stream.name)
        try:
            write(stream)
            stream.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def write_csv(path, rows, fields):
    def cell(value):
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
            return "'" + value
        return value

    def write(stream):
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: cell(value) for key, value in row.items()})
    write_atomic(path, write, "utf-8-sig")


def collect(start, end, directory, seeds=()):
    directory.mkdir(parents=True, exist_ok=True)
    snapshot = directory / COLLECTION.name
    articles = json.loads(snapshot.read_text(encoding="utf-8"))["articles"] if snapshot.exists() else {}
    explicit = {canonical(url): url for url in seeds}
    audits, urls = [], dict(explicit)
    jobs = [("Bernama search (English)", search_bernama, ("landslide",)),
            ("Bernama search (Malay)", search_bernama, ("tanah runtuh",))]
    jobs.extend((source, discover, (source, homepage)) for source, (_, homepage) in SOURCES.items())
    jobs.append(("GDELT", gdelt, (start, end)))
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [(source, executor.submit(function, *args)) for source, function, args in jobs]
        for source, future in futures:
            try:
                links = future.result()
                for url in links:
                    urls.setdefault(canonical(url), url)
                audits.append({"source": source, "status": "discovery_ok", "count": len(links)})
            except (OSError, ValueError, KeyError) as error:
                audits.append({"source": source, "status": "discovery_failed", "error": str(error)[:180]})
    for key, url in list(urls.items())[:40]:
        if key in articles and key not in explicit:
            continue
        source = source_for(url)
        try:
            article = extract(url, Page(fetch(url, source)))
            if article and article["publication_date"] and start.isoformat() <= article["publication_date"] <= end.isoformat():
                articles[key] = article
                status = "stored"
            else:
                status = "skipped_date_or_relevance"
            audits.append({"source": source, "status": status, "url": url})
        except (OSError, ValueError) as error:
            audits.append({"source": source, "status": "article_failed", "url": url, "error": str(error)[:180]})
    events = candidates(articles)
    duplicates = inventory_duplicates(events)
    verified = [event for event in events if event["verification_status"] == "VERIFIED"]
    pending = [event for event in events if event["verification_status"] != "VERIFIED"]
    article_fields = ["url", "publisher", "title", "publication_date", "occurrence_date", "state", "district",
                      "locality", "description", "authorities", "latitude", "longitude", "coordinate_precision",
                      "occurrence_time", "landslide_type", "trigger", "rainfall_description", "casualties",
                      "damage", "road_closure", "missing_information"]
    event_fields = ["id", "verification_status", "ml_eligible", *article_fields, "evidence"]
    exports = [
        ("raw_articles", list(articles.values()), article_fields),
        ("event_candidates", events, event_fields),
        ("verified_events", verified, event_fields),
        ("pending_review", pending, event_fields),
        ("source_audit", audits, ["source", "status", "count", "url", "error"]),
        ("duplicate_review", duplicates, ["id", "inventory_id", "source", "reason"]),
    ]
    for name, rows, fields in exports:
        write_csv(directory / ("landslide_" + name + ".csv"), rows, fields)
    write_atomic(snapshot, lambda stream: json.dump(
        {"articles": articles, "events": events, "duplicate_review": duplicates,
         "updated_at": datetime.now(MYT).isoformat()}, stream, ensure_ascii=False))
    print(f"Saved {len(articles)} articles, {len(events)} candidates, {len(verified)} two-source matches.")
    for row in audits:
        if row["status"].startswith("discovery"):
            print(row["source"], row["status"], row.get("count", ""), row.get("error", ""))


if __name__ == "__main__":
    today = datetime.now(MYT).date()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="start", type=date.fromisoformat, default=today - timedelta(days=7))
    parser.add_argument("--to", dest="end", type=date.fromisoformat, default=today)
    parser.add_argument("--output", type=Path, default=COLLECTION.parent)
    parser.add_argument("--article", action="append", default=[], help="Known public publisher URL to check alongside feeds.")
    parser.add_argument("--interval-minutes", type=int, help="Repeat with a rolling seven-day window while this process is running.")
    args = parser.parse_args()
    if args.start > args.end or args.end > today:
        parser.error("Specify an ordered collection window ending today or earlier.")
    if any(not source_for(url) for url in args.article):
        parser.error("Article URLs must use HTTPS on a configured publisher domain.")
    if args.interval_minutes is not None and args.interval_minutes < 15:
        parser.error("The collection interval must be at least 15 minutes.")
    collect(args.start, args.end, args.output, args.article)
    while args.interval_minutes is not None:
        time.sleep(args.interval_minutes * 60)
        today = datetime.now(MYT).date()
        collect(today - timedelta(days=7), today, args.output)
