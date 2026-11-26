import unittest

from collect_landslides import Page, candidates, canonical, extract


def article(url, body):
    return extract(url, Page(f"""
        <meta property="og:title" content="Tanah runtuh di Jalan Uji, Kelantan">
        <meta property="article:published_time" content="2026-11-22T10:00:00+08:00">
        <p>{body}</p>
    """))


class CollectorTests(unittest.TestCase):
    def test_shared_official_statement_is_not_independent(self):
        first = article("https://www.bernama.com/en/news.php?id=1",
                        "JKR reported the landslide yesterday.")
        second = article("https://berita.rtm.gov.my/nasional/test",
                         "JKR reported the landslide yesterday.")
        result = candidates({"one": first, "two": second})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["occurrence_date"], "2026-11-21")
        self.assertEqual(result[0]["verification_status"], "PARTIALLY_VERIFIED")
        self.assertIsNone(result[0]["longitude"])

    def test_direct_matching_observations_from_distinct_authorities(self):
        first = article("https://www.jkr.gov.my/incident",
                        "Our team inspected the landslide yesterday.")
        second = article("https://www.bomba.gov.my/incident",
                         "Our officers observed the landslide yesterday.")
        result = candidates({"one": first, "two": second})
        self.assertEqual(result[0]["verification_status"], "VERIFIED")
        self.assertFalse(result[0]["ml_eligible"])

    def test_publication_date_is_not_an_occurrence_date(self):
        result = article("https://www.bernama.com/en/news.php?id=1",
                         "JKR reported a landslide beside the road.")
        self.assertIsNone(result["occurrence_date"])
        self.assertEqual(candidates({"one": result})[0]["verification_status"], "PENDING_REVIEW")

    def test_bernama_mirror_urls_share_article_identity(self):
        self.assertEqual(canonical("https://web26.bernama.com/en/general/news.php?id=1"),
                         canonical("https://www.bernama.com/en/news.php?id=1&utm_source=test"))
