"""Refresh editorial landslide links separately from the occurrence inventory."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import logging
import re
from urllib.parse import urlencode, urljoin

from fastapi import APIRouter

from collect_landslides import MYT, SOURCES, Page, canonical, fetch, gdelt, parse_date, source_for

router = APIRouter()
logger = logging.getLogger(__name__)
REFRESH_SECONDS = 6 * 60 * 60
SEEDS = (
    "https://bernama.com/en/news.php?id=2635614",
    "https://www.bernama.com/en/general/news.php?id=2633121",
    "https://bernama.com/tv/news.php?id=2626252",
    "https://web26.bernama.com/en/general/news.php?id=2637660",
    "https://bernama.com/en/news.php?id=2636736",
    "https://berita.rtm.gov.my/nasional/senarai-berita-nasional/senarai-artikel/hujan-berterusan-tingkat-risiko-tanah-runtuh-penduduk-perlu-peka-tanda-awal/",
)
TOPIC = re.compile(r"landslides?|landslips?|tanah runtuh|cerun|slope (?:failure|safety|monitoring|stabili[sz]ation)|high-risk slopes?", re.I)
stories = []


def discover(source, page_url):
    page = Page(fetch(page_url, source))
    urls = (urljoin(page_url, href) for href, title in page.links if TOPIC.search(title))
    return list(dict.fromkeys(url for url in urls if source_for(url) == source))


def read_article(url, today):
    source = source_for(url)
    if not source:
        return None
    meta = Page(fetch(url, source)).meta
    title = meta.get("og:title") or meta.get("h1")
    published = next((parsed for key in ("article:published_time", "datePublished", "visible_timestamp", "time")
                      if (parsed := parse_date(meta.get(key)))), None)
    if not title or not TOPIC.search(title) or not published or not today - timedelta(days=45) <= published <= today:
        return None
    image = next((candidate for key in ("og:image:secure_url", "og:image", "twitter:image")
                  if meta.get(key) and source_for(candidate := urljoin(url, meta[key])) == source), None)
    if source == "Bernama" and image:
        photo = re.fullmatch(r"https://(?:[\w-]+\.)*bernama\.com/storage/photos/([a-f0-9]{40})(?:-medium)?", image, re.I)
        if photo:
            image = f"https://web14.bernama.com/storage/photos/{photo[1]}"
    return {"title": title, "url": url, "publisher": source, "date": published.isoformat(), "image": image,
            "credit": f"Article image via {source}" if image else None}


def refresh():
    today = datetime.now(MYT).date()
    searches = ("landslide", "tanah runtuh", "slope stabilisation", "landslide early warning")
    bernama_search = "https://www.bernama.com/en/search.php?"
    queries = [(discover, ("Bernama", bernama_search + urlencode({"terms": term, "cat1": "all", "submit": "cari"})))
               for term in searches]
    queries.extend((discover, ("RTM", "https://berita.rtm.gov.my/?" + urlencode({"s": term})))
                   for term in ("tanah runtuh", "cerun"))
    queries.extend((discover, (source, homepage)) for source, (_, homepage) in SOURCES.items())
    queries.append((gdelt, (today - timedelta(days=14), today)))

    def try_fetch(function, *args):
        try:
            return function(*args)
        except (OSError, ValueError, KeyError) as error:
            logger.info("Related news source unavailable: %s", error)
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda query: try_fetch(query[0], *query[1]), queries))
        urls = {canonical(url): url for group in results for url in (group or [])[:5] if source_for(url)}
        urls.update({canonical(url): url for url in SEEDS})
        fresh = list(filter(None, pool.map(lambda url: try_fetch(read_article, url, today), urls.values())))
    retained = {canonical(row["url"]): row for row in stories
                if row["date"] >= (today - timedelta(days=45)).isoformat()}
    retained.update({canonical(row["url"]): row for row in fresh})
    stories[:] = sorted(retained.values(), key=lambda row: row["date"], reverse=True)[:18]


async def refresh_periodically():
    while True:
        try:
            await asyncio.to_thread(refresh)
        except Exception:
            logger.exception("Related news refresh failed")
        await asyncio.sleep(REFRESH_SECONDS)


@router.get("/api/related-news")
def related_news():
    return {"stories": list(stories)}
