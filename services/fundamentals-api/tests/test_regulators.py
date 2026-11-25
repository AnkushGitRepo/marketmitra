"""Regulator feeds as retrieval material (#365): which items are policy and which are routine noise.

The titles are real ones from the RBI and TRAI feeds on 2026-11-25: the feeds are mostly auction results and consumer-awareness
workshops, so the filter matters more than the fetch.
"""

import httpx
import pytest

from app.ingestion import regulators


@pytest.mark.parametrize(
    "title",
    [
        "Treasury Bills: Full Auction Result",
        "91-Day, 182-Day and 364-Day T-Bill Auction Result: Cut-off",
        "Result of the Second Overnight Variable Rate Repo (VRR) auction held on November 25, 2026",
        "RBI to conduct Second Overnight Variable Rate Repo (VRR) auction under LAF on November 25, 2026",
        "Money Market Operations as on November 24, 2026",
        "RBI Reference Rate for US Dollar and other currencies",
        "Weekly Statistical Supplement",
        "State Government Securities: Auction Results",
    ],
)
def test_routine_rbi_data_releases_are_dropped(title):
    assert regulators.is_policy_item("RBI press release", title) is False


@pytest.mark.parametrize(
    "title",
    [
        "Reserve Bank of India imposes monetary penalty on XYZ Co-operative Bank",
        "RBI cancels Certificate of Registration of ABC Finance Ltd",
        "Governor, Reserve Bank of India meets Managing Directors & Chief Executive Officers of select Banks",
        "Master Direction - Reserve Bank of India (Credit Information Reporting) Directions, 2026",
        "Statement on Developmental and Regulatory Policies",
    ],
)
def test_rbi_policy_items_are_kept(title):
    assert regulators.is_policy_item("RBI press release", title) is True


@pytest.mark.parametrize(
    "title",
    [
        "Consumer Awareness Program at Kaushambi (Uttar Pradesh) by Consumer Guild",
        "Consumer Education Workshop at Sri Ganganagar (Rajasthan) by Vodafone Idea Limited",
        "Consumer Education Workshop at Baksa (Assam) by Bharti Airtel Limited",
        "Invitation of Expression of Interest for Empanelment of Auditors to carry out Audit of Digital Addressable Systems",
        "DTH Nodal Officers Details - Bharti Telemedia Limited",
        "TRAI Assesses Mobile Network Quality in Ghaziabad, Noida, Greater Noida and Nearby Areas.",
    ],
)
def test_trai_routine_notices_are_dropped(title):
    assert regulators.is_policy_item("TRAI", title) is False


@pytest.mark.parametrize(
    "title",
    [
        "TRAI releases consultation paper on tariff framework",
        "TRAI recommendations on spectrum for satellite communication",
        "Telecom Subscription Data as on 31st October 2026",
    ],
)
def test_trai_policy_items_are_kept(title):
    assert regulators.is_policy_item("TRAI", title) is True


def test_sebi_items_are_all_kept():
    assert regulators.is_policy_item("SEBI", "Order in the matter of XYZ Ltd") is True


def test_the_source_list_names_each_regulator_once():
    labels = [label for label, _ in regulators.REGULATOR_FEEDS]
    assert labels == ["RBI press release", "TRAI", "SEBI"]
    assert regulators.REGULATOR_SOURCES == frozenset(labels)
    assert all(url.startswith("https://") for _, url in regulators.REGULATOR_FEEDS)


@pytest.mark.asyncio
async def test_items_are_filtered_neutral_and_tagged_with_the_regulator(monkeypatch):
    class Entry(dict):
        pass

    entries = {
        "RBI press release": [
            Entry(title="Reserve Bank of India imposes monetary penalty on ABC Bank", link="https://rbi.test/1", summary="<p>Penalty of Rs 1 crore.</p>", published="Wed, 25 Nov 2026 10:00:00 +0530"),
            Entry(title="Treasury Bills: Full Auction Result", link="https://rbi.test/2", summary="", published="Wed, 25 Nov 2026 15:50:00 +0530"),
        ],
        "TRAI": [Entry(title="Consumer Education Workshop at Baksa (Assam)", link="https://trai.test/1", summary="", published="Wed, 25 Nov 2026 09:46:59 +0530")],
        "SEBI": [],
    }
    by_url = {url: entries[label] for label, url in regulators.REGULATOR_FEEDS}
    async def get_entries(url):
        return by_url[url]

    monkeypatch.setattr(regulators, "_get_entries", get_entries)

    items = await regulators.fetch_regulator_items()
    assert [i["title"] for i in items] == ["Reserve Bank of India imposes monetary penalty on ABC Bank"]
    item = items[0]
    assert item["source"] == "RBI press release"
    assert item["sentiment"] == "neutral" and item["sentiment_score"] == 0.0  # headline tone means nothing for a notice
    assert item["summary"] == "Penalty of Rs 1 crore."


@pytest.mark.asyncio
async def test_a_failing_feed_is_skipped_not_fatal(monkeypatch):
    async def get_entries(url):
        if "rbi.org.in" in url:
            raise OSError("down")
        return []

    monkeypatch.setattr(regulators, "_get_entries", get_entries)
    assert await regulators.fetch_regulator_items() == []


@pytest.mark.asyncio
async def test_a_feed_is_downloaded_with_an_honest_user_agent_and_parsed_from_the_text(monkeypatch):
    rss = (
        '<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>TRAI recommendations on tariffs</title>'
        "<link>https://trai.test/r</link><pubDate>Wed, 25 Nov 2026 09:52:37 +0530</pubDate></item></channel></rss>"
    )
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["ua"] = request.headers["user-agent"]
        return httpx.Response(200, text=rss)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(regulators.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    entries = await regulators._get_entries("https://trai.test/rss.xml")
    assert [e["title"] for e in entries] == ["TRAI recommendations on tariffs"]
    assert "MarketMitra" in seen["ua"]


@pytest.mark.asyncio
async def test_a_failing_status_is_an_error_the_caller_skips(monkeypatch):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(regulators.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(lambda _r: httpx.Response(403)), **kw))
    with pytest.raises(httpx.HTTPStatusError):
        await regulators._get_entries("https://pib.test/rss")
