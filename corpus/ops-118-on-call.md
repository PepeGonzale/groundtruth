---
id: OPS-118
title: On-call rotation
owner: Operations Reliability
version: 2.1
effective: 2025-01-20
classification: internal
---

## 1. Rotation

1.1 The primary rotation runs for **7 days**, from Monday 10:00 to the following
Monday 10:00 CET. The secondary rotation follows the same schedule offset by one
week.

1.2 A rotation swap requires both engineers to agree in writing in the
#ops-oncall channel and a calendar update at least 24 hours before the swap.
Silent swaps are not recognised by the paging system.

## 2. Responsibilities

2.1 The on-call primary acknowledges a page within **5 minutes**. Acknowledging
is not resolving: the primary must also declare whether an incident exists.

2.2 If the primary does not acknowledge within 5 minutes, the pager escalates to
the secondary automatically. If neither acknowledges within 10 minutes, the
pager calls the Operations Director.

2.3 The on-call engineer must be able to reach a laptop and a phone within 15
minutes while on call. Alcohol and on-call do not mix. If you cannot meet the
response commitment, swap the rotation before it starts.

## 3. Handover

3.1 The handover note is written before Monday 10:00 and contains: open
incidents, scheduled changes in the coming week, known risks, and any pager
configuration changes.

3.2 The outgoing engineer remains available for questions until Monday 12:00.

## 4. Compensation

On-call compensation, time off in lieu and stipend levels are defined in the HR
policy. This document intentionally does not restate them because they vary by
contract and country.

## 5. Tools

5.1 The paging tool is the only source of truth for who is on call. A calendar
entry does not override the paging schedule.

5.2 Test pages are sent every Monday at 09:30. A missed test page is treated as
a process failure and reviewed at the weekly operations review.

## 6. Fatigue

After resolving a SEV1 that ran longer than 4 hours during the night, the
engineer hands the rotation to the secondary for the next 12 hours. This is not
a reward; it is a control against a second bad decision.
