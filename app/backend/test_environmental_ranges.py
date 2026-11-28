import unittest
import tempfile
from pathlib import Path
import environmental_ranges as ranges
from datetime import date
from unittest.mock import MagicMock, patch

from environmental_analytics import backfill
from environmental_ranges import summarize


class EnvironmentalRangeTests(unittest.TestCase):
    def test_hourly_missing_and_duplicate_slots(self):
        from datetime import datetime, UTC
        from environmental_analytics import period_image
        midnight=int(datetime(2026,11,22,tzinfo=UTC).timestamp())*1000
        for factor,shift in [("moisture_hourly",0),("runoff_hourly",1)]:
            slots=[midnight+(i+shift)*3600000 for i in range(24)]
            for stamps in [slots[:-1],slots[:-1]+[slots[0]]]:
                engine=MagicMock()
                collection=engine.ImageCollection.return_value.filterDate.return_value
                collection.aggregate_array.return_value.getInfo.return_value=stamps
                self.assertIsNone(period_image(engine,factor,date(2026,11,22)))
                collection.select.assert_not_called()
            collection.aggregate_array.return_value.getInfo.return_value=slots
            self.assertEqual(period_image(engine,factor,date(2026,11,22))[2],24)
            images=collection.select.return_value
            (images.mean if shift==0 else images.sum).assert_called_once()

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

    def test_failed_request_preserves_cursor_for_retry(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(ranges.env,"OUTPUT",Path(folder)/"observations.json"):
            key=("rainfall","2007-01-01","2007-01-02")
            with ranges.queue() as db:
                ranges.update(db,("refresh","",""),"","complete")
                ranges.update(db,key,key[1],"queued")
            with patch.object(ranges.env,"backfill",side_effect=RuntimeError("test source unavailable")), self.assertLogs(level="ERROR"):
                ranges.worker_step()
            with ranges.queue() as db:
                saved=db.execute("SELECT state,cursor FROM jobs WHERE factor='rainfall'").fetchone()
            self.assertEqual(tuple(saved),("error","2007-01-01"))

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
