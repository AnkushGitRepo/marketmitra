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


@pytest.mark.parametrize("sub_category", ["Thematic Fund", "Sectoral Fund", "Sectoral/ Thematic", "Sectoral/Thematic"])
def test_every_sectoral_and_thematic_sub_category_is_refined_by_theme(sub_category: str):
    assert peer_group("HDFC Defence Fund", sub_category) == "Defence"
    assert peer_group("quant Healthcare Fund", sub_category) == "Healthcare"


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("quant Teck Fund", "Technology"),
        ("quant Quantamental Fund", "Quant and factor"),
        ("quant PSU Fund", "PSU"),
        ("WhiteOak Capital Digital Bharat Fund", "Technology"),
        ("Nippon India Power & Infra Fund", "Infrastructure"),
        ("Nippon India Pharma Fund", "Healthcare"),
    ],
)
def test_sector_fund_names_map_to_their_theme(name: str, expected: str):
    assert peer_group(name, "Sectoral/ Thematic") == expected


def test_unrelated_sub_categories_that_merely_mention_sector_are_untouched():
    assert peer_group("Some Fund", "Large Cap Fund") == "Large Cap Fund"


def test_taiwan_and_defence_are_never_peers():
    assert peer_group("Nippon India Taiwan Equity Fund", THEMATIC) != peer_group("HDFC Defence Fund", THEMATIC)


def test_unmatched_thematic_fund_gets_its_own_bucket_not_a_neighbour_theme():
    assert peer_group("Samco Flexi Cap Fund", THEMATIC) == "Other thematic"


def test_other_sub_categories_keep_their_sebi_group():
    assert peer_group("Axis Bluechip Fund", "Large Cap Fund") == "Large Cap Fund"


def test_no_sub_category_has_no_group():
    assert peer_group("Some Fund", None) is None


def test_is_thematic_sub_category_matches_every_spelling_only():
    from app.services.mf_peer_group import is_thematic_sub_category

    assert all(is_thematic_sub_category(s) for s in ("Thematic Fund", "Sectoral Fund", "Sectoral/ Thematic"))
    assert not any(is_thematic_sub_category(s) for s in ("Large Cap Fund", "Flexi Cap Fund", "Index Funds", ""))


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("ICICI Prudential FMCG Fund", "Consumption"),
        ("Baroda BNP Paribas Health and Wellness Fund", "Healthcare"),
        ("TATA HOUSING OPPORTUNITIES FUND", "Housing"),
        ("ICICI Prudential Commodities Fund", "Energy and resources"),
        ("SBI COMMA FUND", "Energy and resources"),
        ("Tata Ethical Fund", "ESG"),
        ("SBI Automotive Opportunities Fund", "Manufacturing"),
        ("Kotak Manufacture in India Fund", "Manufacturing"),
        ("SBI Innovative Opportunities Fund", "Innovation"),
        ("ICICI Prudential US Bluechip Equity Fund", "International"),
        ("Franklin Asian Equity Fund", "International"),
        ("Aditya Birla Sun Life Conglomerate Fund", "Conglomerate"),
        ("Kotak Rural Opportunities Fund", "Rural"),
    ],
)
def test_more_real_theme_names(name: str, expected: str):
    assert peer_group(name, "Sectoral/ Thematic") == expected
