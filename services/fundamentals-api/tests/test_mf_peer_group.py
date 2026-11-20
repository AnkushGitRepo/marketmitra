import pytest

from app.services.mf_peer_group import peer_group

THEMATIC = "Thematic Fund"


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Nippon India Taiwan Equity Fund", "International"),
        ("Nippon India Japan Equity Fund", "International"),
        ("Nippon India US Equity Opportunities Fund", "International"),
        ("HDFC Defence Fund", "Defence"),
        ("Mirae Asset Healthcare Fund", "Healthcare"),
        ("PGIM India Healthcare Fund", "Healthcare"),
        ("Mirae Asset Banking and Financial Services Fund", "Financial services"),
        ("HSBC Financial Services fund", "Financial services"),
        ("Axis Services Opportunities Fund", "Services"),
        ("Invesco India PSU Equity Fund", "PSU"),
        ("DSP India T.I.G.E.R. Fund", "Infrastructure"),
        ("UTI - Transportation and Logistics Fund", "Infrastructure"),
        ("Mahindra Manulife Innovation Opportunities Fund", "Innovation"),
        ("Axis Consumption Fund", "Consumption"),
        ("UTI - India Consumer Fund", "Consumption"),
        ("Axis Quant Fund", "Quant and factor"),
        ("Axis Momentum Fund", "Quant and factor"),
        ("Bandhan Multi-Factor Fund", "Quant and factor"),
        ("Axis Business Cycles Fund", "Business cycle"),
        ("DSP Natural Resources And New Energy Fund", "Energy and resources"),
        ("HDFC Technology Fund", "Technology"),
    ],
)
def test_thematic_funds_group_by_theme(name: str, expected: str):
    assert peer_group(name, THEMATIC) == expected


def test_taiwan_and_defence_are_never_peers():
    assert peer_group("Nippon India Taiwan Equity Fund", THEMATIC) != peer_group("HDFC Defence Fund", THEMATIC)


def test_unmatched_thematic_fund_gets_its_own_bucket_not_a_neighbour_theme():
    assert peer_group("Samco Flexi Cap Fund", THEMATIC) == "Other thematic"


def test_other_sub_categories_keep_their_sebi_group():
    assert peer_group("Axis Bluechip Fund", "Large Cap Fund") == "Large Cap Fund"


def test_no_sub_category_has_no_group():
    assert peer_group("Some Fund", None) is None
