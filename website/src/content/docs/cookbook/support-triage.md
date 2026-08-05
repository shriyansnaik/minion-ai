---
title: Support triage
description: A team of specialists that classifies inbound tickets, drafts a reply, and leaves a queryable audit trail behind.
---

Inbound support tickets need three different judgements — what kind of problem
is this, how urgent is it, and what should we say — and they're genuinely
different jobs. This is the case for [named
specialists](/guides/sub-agents/#named-specialists) rather than one agent with a
long prompt.

The other half of the recipe is the metadata. Every ticket run is tagged with
its id, category and priority, so a month later "show me every P1 billing
ticket" is a filter in the dashboard rather than a data export.

## The program

```python
# support_triage.py
import json
import os
import minions

TICKETS_FILE = "tickets.json"
KB_DIR = "kb"


def load_ticket(ticket_id: str) -> str:
    """Load one support ticket by id.

    Args:
        ticket_id: The ticket identifier, e.g. "T-4471".

    Returns:
        The ticket as JSON, or an error message.
    """
    try:
        with open(TICKETS_FILE, "r", encoding="utf-8") as f:
            tickets = json.load(f)
    except FileNotFoundError:
        return f"No {TICKETS_FILE} found in {os.getcwd()}"
    except json.JSONDecodeError as e:
        return f"{TICKETS_FILE} is not valid JSON: {e}"

    for t in tickets:
        if t.get("id") == ticket_id:
            return json.dumps(t, indent=2)
    return f"No ticket with id {ticket_id}. Known ids: {', '.join(t.get('id', '?') for t in tickets)}"


def search_kb(query: str) -> str:
    """Search the knowledge base for articles matching a query.

    Args:
        query: Words to look for, e.g. "refund policy".

    Returns:
        Matching article names with a short excerpt each, or a message saying
        nothing matched.
    """
    if not os.path.isdir(KB_DIR):
        return f"No knowledge base directory ({KB_DIR}/) found"

    terms = [w.lower() for w in query.split() if len(w) > 2]
    hits = []
    for name in sorted(os.listdir(KB_DIR)):
        path = os.path.join(KB_DIR, name)
        if not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
        low = text.lower()
        if any(t in low for t in terms):
            hits.append(f"### {name}\n{text[:800]}")

    return "\n\n".join(hits) if hits else f"No knowledge-base article matched: {query}"


classifier = minions.Minion(
    name="classifier",
    description="Assigns a ticket a category and a priority, with a reason.",
    model="openai/gpt-4o-mini",
    system_prompt=(
        "Classify the support ticket you are given.\n"
        "category: one of billing, bug, feature-request, account, other.\n"
        "priority: P1 (blocked, paying, or data loss), P2 (degraded), "
        "P3 (question or request).\n"
        "Answer as exactly three lines: 'category: X', 'priority: Y', "
        "'reason: <one sentence>'. Nothing else."
    ),
)

responder = minions.Minion(
    name="responder",
    description="Drafts a reply to a customer, grounded in the knowledge base.",
    model="openai/gpt-4o",
    tools=[search_kb],
    system_prompt=(
        "Draft a reply to the customer. Search the knowledge base first and "
        "base the answer on what you find.\n"
        "If the knowledge base doesn't cover it, say what you can confirm and "
        "state plainly that the rest needs a human — never invent policy, "
        "prices, or timelines.\n"
        "Be brief and warm. No corporate filler. Sign off as 'Support'."
    ),
)

triage = minions.Minion(
    model="openai/gpt-4o",
    tools=[load_ticket],
    sub_minions=[classifier, responder],
    max_turns=10,
    system_prompt=(
        "You triage one support ticket.\n"
        "1. Load the ticket.\n"
        "2. Send its full text to the classifier.\n"
        "3. Send the full text plus the classification to the responder.\n"
        "Specialists cannot see this conversation, so restate everything they "
        "need in the input you give them.\n"
        "Finish with exactly this shape:\n"
        "CATEGORY: ...\nPRIORITY: ...\nREASON: ...\n---\n<the draft reply>"
    ),
)


def triage_ticket(ticket_id: str) -> str:
    result = triage(
        f"Triage ticket {ticket_id}.",
        tags=["triage"],
        metadata={"ticket_id": ticket_id, "prompt_version": "v1"},
    )
    return result.output or "(triage did not complete)"


if __name__ == "__main__":
    minions.init(tracing=True, project="support")
    print(triage_ticket("T-4471"))
```

You'll need two fixtures next to the script:

```json title="tickets.json"
[
  {
    "id": "T-4471",
    "subject": "Charged twice this month",
    "body": "Hi — I see two charges of $49 on the 3rd. We're on the Pro plan and only have one workspace. Can you refund the duplicate? This is the second month it's happened.",
    "customer_plan": "pro"
  },
  {
    "id": "T-4472",
    "subject": "How do I export my data?",
    "body": "Is there a way to get a CSV of everything in my account?",
    "customer_plan": "free"
  }
]
```

```markdown title="kb/billing.md"
# Billing

Duplicate charges are refunded in full within 5 business days once confirmed.
Plan changes are prorated. Refunds return to the original payment method.
Annual plans can be cancelled within 30 days for a full refund.
```

```bash
python support_triage.py
```

## What to notice

**Each specialist is a different size.** The classifier does a bounded
labelling job and runs on `gpt-4o-mini`. The responder writes something a
customer reads and gets the larger model plus the knowledge-base tool. One agent
with one model couldn't make that trade.

**The manager holds three lines, not three prompts.** Its prompt contains only
each specialist's name and description — never their system prompts or tools.
That's why a team is cheap. See [Why specialists are
cheap](/guides/sub-agents/#why-specialists-are-cheap).

**"Specialists cannot see this conversation."** Saying so in the manager's
prompt is the single most effective fix for the most common team bug: a manager
that delegates with `input="handle this"` and gets a confused answer back.

**The responder is told what to do when it doesn't know.** "Never invent policy,
prices, or timelines" is the difference between a useful draft and a liability.
Grounding it in `search_kb` and giving it an explicit escape hatch is what makes
the output safe to put in front of a human reviewer.

**`parallel_tools` is off.** The steps here are strictly sequential — the
responder needs the classification. Parallelism would buy nothing.

**No tool sends anything.** Triage produces a *draft*. Adding a
`send_reply(...)` tool would make an agent's mistake externally visible with no
human in between; keep the human as the last step until you have traces telling
you it's safe.

## The payoff: the trace

```bash
minion serve
```

Open the `support` project. Each run is one ticket, showing the manager's turns
with `classifier` and `responder` hand-offs, each linking into that specialist's
own run.

Because every run carries `ticket_id` and `prompt_version`, the dashboard
becomes the audit trail:

- A customer disputes a reply → filter `ticket_id=T-4471`, read exactly what the
  agent saw and why it said what it said.
- You change the responder's prompt → run the next batch under
  `prompt_version=v2` and compare cost and turn count against `v1` side by side.
- Someone asks what triage costs → the analytics view, per model.

## Variations

- **Batch it.** Loop `triage_ticket` over every id. Because a `Minion` is
  immutable and thread-safe, a `ThreadPoolExecutor` over the same `triage`
  instance works — each call gets its own run and its own trace. Watch your
  provider's rate limits.
- **Add an escalation specialist** with `sub_minions=[classifier, responder,
  escalator]` that drafts an internal summary for P1s.
- **Real knowledge base.** Replace `search_kb`'s substring scan with a call to
  your vector store. Keep the signature — `query: str` in, text out — and
  nothing else changes. Build the client *inside* the function if you ever turn
  on `parallel_tools`.
