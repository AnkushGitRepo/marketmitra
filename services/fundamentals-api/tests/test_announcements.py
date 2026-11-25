"""Categorising exchange announcements (#365). Pure: titles and summaries in, a category out."""

import pytest

from app.ingestion.announcements import ANNOUNCEMENT_CATEGORIES, categorise_announcement


@pytest.mark.parametrize(
    ("title", "summary", "expected"),
    [
        ("Announcement under Regulation 30 (LODR)-Credit Rating", "CRISIL reaffirmed A1", "credit_rating"),
        ("Intimation of rating action by ICRA", None, "credit_rating"),
        ("Disclosure of material litigation", "Order passed by NCLT", "litigation"),
        ("Update on Supreme Court order", "AGR dues", "litigation"),
        ("Receipt of show cause notice from SEBI", None, "litigation"),
        ("Penalty imposed by stock exchange", "Fine of Rs 5 lakh", "litigation"),
        ("Tax demand notice received", "Income tax demand of Rs 120 crore", "litigation"),
        ("Resignation of Statutory Auditor", None, "auditor"),
        ("Change in auditors", "Appointment of new auditors", "auditor"),
        ("Pledge of shares by promoter", "Creation of encumbrance", "pledge"),
        ("Invocation of pledge", None, "pledge"),
        ("Resignation of Chief Financial Officer", None, "management"),
        ("Appointment of Independent Director", None, "management"),
        ("Cessation of Company Secretary", None, "management"),
        ("Clarification Sought On Increase In Volume Of Security", None, "clarification"),
        ("Outcome of Board Meeting", "Approved unaudited financial results for Q2", "results"),
        ("Financial Results for the quarter ended September 30, 2026", None, "results"),
        ("Analyst / Investor Meet - Intimation", None, "investor_meet"),
        ("Earnings call transcript", None, "investor_meet"),
        ("Fund raising by issue of NCDs", "Preferential allotment", "fundraise"),
        ("Scheme of arrangement and amalgamation", None, "restructuring"),
        ("Acquisition of stake in subsidiary", None, "restructuring"),
        ("Related party transactions for half year", None, "related_party"),
        ("Updates on dividend", "Interim dividend of Rs 5", "corporate_action"),
        ("Newspaper publication", None, "other"),
        ("", None, "other"),
    ],
)
def test_categorise_announcement(title, summary, expected):
    assert categorise_announcement(title, summary) == expected


def test_a_credit_rating_that_mentions_a_court_is_still_a_rating():
    # Rating filings often quote legal wording; the more specific, higher-priority rule wins.
    assert categorise_announcement("Credit Rating", "reaffirmed; no litigation pending") == "credit_rating"


def test_litigation_beats_management_when_both_appear():
    assert categorise_announcement("Order from tribunal", "against the director") == "litigation"


def test_matching_ignores_case_and_surrounding_text():
    assert categorise_announcement("RESIGNATION OF AUDITOR", None) == "auditor"


def test_every_category_the_function_returns_is_listed():
    for title in ("Credit Rating", "Court order", "Resignation of auditor", "Pledge", "CFO resignation", "Clarification", "Results", "Investor meet", "NCD issue", "Merger", "Related party", "Dividend", "x"):
        assert categorise_announcement(title, None) in ANNOUNCEMENT_CATEGORIES
