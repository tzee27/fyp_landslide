import unittest
from datetime import date
from unittest.mock import patch

from environmental_analytics import backfill
from environmental_ranges import summarize


class EnvironmentalRangeTests(unittest.TestCase):
    def test_accumulation_and_moisture_mean(self):
        rows=[{"date":"2024-02-29","value":0,"coverage":1},
              {"date":"2024-03-01","value":.4,"coverage":.95}]
        for factor in ["rainfall","runoff"]:
            self.assertEqual(summarize(rows,2,factor)["value"],.4)
        self.assertEqual(summarize(rows,2,"moisture")["value"],.2)
        self.assertEqual(summarize(rows,2,"moisture")["peakDate"],"2024-03-01")
        self.assertIsNone(summarize(rows,3,"rainfall")["value"])
        rows[1]["coverage"]=.949
        self.assertIsNone(summarize(rows,2,"moisture")["value"])
        self.assertEqual(summarize(rows,2,"moisture")["count"],1)

    @patch("environmental_analytics.prepare")
    def test_batch_boundaries(self,prepare):
        start,end=date(2020,12,30),date(2021,3,8)
        backfill("project",start,end,["runoff"],batch_days=31)
        windows=[call.args[1:3] for call in prepare.call_args_list]
        self.assertEqual(windows[0][0],start)
        self.assertEqual(windows[-1][1],end)
        self.assertTrue(all(0<(b-a).days<=31 for a,b in windows))
        self.assertTrue(all(a[1]==b[0] for a,b in zip(windows,windows[1:])))

if __name__=="__main__":
    unittest.main()
