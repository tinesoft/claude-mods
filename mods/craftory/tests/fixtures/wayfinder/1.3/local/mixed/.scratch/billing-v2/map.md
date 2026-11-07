<!-- hand-made: shaped like the craftory-mvp wayfinder tree (mattpocock-skills 1.3.1), with a claimed and a blocked ticket added -->
# Billing v2

## Destination

A spec for usage-based billing, ready to hand to /to-spec.

## Notes

- Domain: the billing glossary.
- Plan, don't do: tickets produce decisions, not code.

## Decisions so far

- [Billing model](issues/01-billing-model.md): charge per seat plus metered usage.
- [Gateway limits](issues/02-gateway-limits.md): the gateway caps a batch at 500 charges.

## Not yet specified

- How invoices are archived once a customer is closed.

## Out of scope

- Tax filing.
