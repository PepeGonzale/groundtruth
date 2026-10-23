---
id: OPS-104
title: Incident response
owner: Operations Reliability
version: 3.2
effective: 2025-02-01
classification: internal
---

## 1. Severity matrix

| Severity | Definition | Examples |
| --- | --- | --- |
| SEV1 | Safety risk, regulatory breach, or fleet-wide outage | Cold chain breach above 2 hours, telemetry loss for more than 25% of the fleet, customer data exposure |
| SEV2 | Major degradation affecting one customer or region | One lane stopped, reefer failure with product at risk, payment or POD pipeline down |
| SEV3 | Limited degradation with a workaround | Single vehicle offline, delayed notifications, dashboard stale data |
| SEV4 | Question or cosmetic issue | Copy error, access request, report formatting |

When in doubt, declare one severity higher. Downgrading after assessment is
cheap; a late SEV1 is not.

## 2. Acknowledgement and mitigation

2.1 A SEV1 or SEV2 page must be acknowledged within **15 minutes**. A SEV3 page
must be acknowledged within 1 hour.

2.2 The mitigation target for a SEV1 is **4 hours** from acknowledgement. This is
a target, not a guarantee. If mitigation will take longer, the incident
commander updates the customer every 30 minutes.

2.3 A SEV1 incident commander is assigned by the on-call primary. The commander
does not debug; the commander coordinates, communicates and decides.

## 3. Escalation

3.1 Page the primary first. If there is no acknowledgement after 5 minutes, page
the secondary. After 10 minutes without acknowledgement, call the Operations
Director directly.

3.2 For any SEV1 involving product temperature, page Quality Assurance at the
same time as the on-call engineer. QA owns disposition; operations does not
release product without QA sign-off.

3.3 Customer-facing communication for a SEV1 starts within 60 minutes. The
account director is added to the incident channel, not to the paging rotation.

## 4. Communication cadence

- SEV1: internal update every 30 minutes, customer update every 30 minutes.
- SEV2: internal update every 2 hours, customer update every 4 hours.
- SEV3: update at start and at resolution.
- SEV4: no incident channel required.

Status page updates use plain language. Never include customer names, driver
names, or precise locations in a public status update.

## 5. Resolution and postmortem

5.1 An incident is resolved when the customer impact has stopped, not when the
root cause is known.

5.2 A blameless postmortem is required for every SEV1 and for any SEV2 that
exceeded its mitigation target. It is due within **5 business days** of
resolution.

5.3 Every postmortem produces owned actions with a due date. Actions are
reviewed after 30 days. An action without an owner is not an action.

## 6. Out of hours

Outside business hours, follow OPS-118. Do not wait for a manager to declare a
SEV1 if the definition in section 1 is met. Declaring is reversible; waiting is
not.
