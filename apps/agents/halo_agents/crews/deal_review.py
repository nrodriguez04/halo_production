"""Deal review crew: one analyst that reads a deal's context and proposes the
next action. It produces a recommendation only; anything outward-facing (an
SMS, an email) is created as a draft by the api and waits in the approval
queue, exactly as it did under the previous runtime.
"""
from __future__ import annotations

import json
from typing import Any

from crewai import Agent, Crew, Process, Task

from ..governed_llm import HaloGovernedLLM


def build_deal_review_crew(llm: HaloGovernedLLM) -> Crew:
    analyst = Agent(
        role="Wholesale deal analyst",
        goal=(
            "Assess a real-estate wholesale deal from the context provided and "
            "recommend the single most useful next action for the acquisitions team."
        ),
        backstory=(
            "You have underwritten hundreds of off-market residential deals. You are "
            "precise about numbers you were given and explicit about numbers you were "
            "not. You never invent property facts."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )
    review = Task(
        description=(
            "Review this deal context and write a short assessment.\n\n"
            "Deal context (JSON):\n{deal_context}\n\n"
            "Cover: (1) the offer versus ARV and repair estimate, if present; "
            "(2) the seller's situation and timeline, if known; (3) risks you can "
            "see in the data; (4) one recommended next action, chosen from: "
            "'send_offer', 'request_walkthrough', 'follow_up_seller', "
            "'re_underwrite', 'pass'. Say what data is missing rather than guessing."
        ),
        expected_output=(
            "JSON with keys: summary (string), risks (list of strings), "
            "recommended_action (one of the allowed values), rationale (string), "
            "missing_data (list of strings)."
        ),
        agent=analyst,
    )
    return Crew(agents=[analyst], tasks=[review], process=Process.sequential, verbose=False)


def review_deal(llm: HaloGovernedLLM, deal_context: dict[str, Any]) -> dict[str, Any]:
    crew = build_deal_review_crew(llm)
    result = crew.kickoff(inputs={"deal_context": json.dumps(deal_context, indent=2)})
    raw = getattr(result, "raw", str(result))
    try:
        return json.loads(raw)
    except ValueError:
        return {"summary": raw, "risks": [], "recommended_action": None, "rationale": "", "missing_data": []}
