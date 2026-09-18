"""Run the deal-review crew once against a saved deal context.

    python -m halo_agents.main --account <accountId> --deal-context deal.json

The context file is whatever the api's GET /agent/deals/:id/context returns
(deal, property, lead, recent timeline). Fetching it is the caller's job for
now; a worker-side trigger that pulls it and runs the crew on a schedule or
on a lifecycle event is the next step.
"""
from __future__ import annotations

import argparse
import json
import sys

from .governed_llm import HaloGovernedLLM
from .halo_client import CostBlocked, HaloInternalClient
from .crews.deal_review import review_deal


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Halo deal-review agent")
    parser.add_argument("--account", required=True, help="tenant accountId the spend belongs to")
    parser.add_argument("--deal-context", required=True, help="path to a JSON file with the deal context")
    parser.add_argument("--model", default="gpt-4o")
    args = parser.parse_args(argv)

    with open(args.deal_context, encoding="utf-8") as fh:
        deal_context = json.load(fh)

    client = HaloInternalClient(account_id=args.account)
    llm = HaloGovernedLLM(
        client,
        model=args.model,
        deal_id=deal_context.get("deal", {}).get("id") if isinstance(deal_context, dict) else None,
    )
    try:
        out = review_deal(llm, deal_context)
    except CostBlocked as blocked:
        print(f"blocked by cost control: {blocked.reason} ({blocked.provider})", file=sys.stderr)
        return 2
    print(json.dumps(out, indent=2))
    print(
        f"tokens in={llm.total_tokens_in} out={llm.total_tokens_out} (recorded in the api ledger)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
