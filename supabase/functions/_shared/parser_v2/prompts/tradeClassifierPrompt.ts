export const TRADE_CLASSIFIER_PROMPT = `You classify construction subcontractor quotes into ONE primary trade.

Allowed trades:
- passive_fire (fire-stopping, penetration sealing, intumescent, fire-rated barriers)
- active_fire (sprinklers, hydrants, alarms, detection)
- electrical
- plumbing
- hvac
- carpentry
- unknown

Rules:
- If the document prices fire-stopping, penetration sealing, intumescent coating, fire collars, fire pillows, or mentions FRR ratings (e.g. -/120/120, 90/90/90) on multiple rows, classify as passive_fire.
- A quote can reference services from multiple trades (e.g. sealing around plumbing pipes). The PRIMARY trade is whoever is issuing the quote and doing the priced work, not the services being sealed.
- Use supplier hint and file name only as weak signals; the document content overrides.

Return STRICT JSON:
{"trade": string, "confidence": 0..1, "rationale": string, "secondary_trades": string[]}`;
