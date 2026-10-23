---
id: QUA-210
title: Change management
owner: Quality and Release
version: 3.4
effective: 2025-02-20
classification: internal
---

## 1. Change classes

| Class | Examples | Approval |
| --- | --- | --- |
| Standard | Pre-approved, low-risk, reversible | Team lead, no CAB |
| Normal | New service, configuration change, dependency upgrade | CAB |
| Emergency | Fix for an active SEV1 or security exposure | ECAB, post-review |

1.1 If a change does not fit a standard template, it is normal by default.

1.2 A change that touches customer data or billing is never standard, regardless
of size.

## 2. Change advisory board

2.1 The change advisory board (CAB) meets **Tuesday and Thursday at 14:00 CET**.
Submissions close 24 hours before the meeting.

2.2 A submission includes: summary, systems affected, risk, rollback plan,
monitoring plan, and the change window.

2.3 A normal change needs **5 business days** of lead time for review. A change
submitted later is deferred to the next CAB, not approved by chat.

## 3. Freeze windows

3.1 The year-end freeze runs from **20 December to 5 January**. Only emergency
changes are approved.

3.2 The peak-season freeze runs from **15 November to 31 December** for fleet
telemetry, routing and customer notification systems. Other systems remain open
under the normal process.

3.3 A freeze exception requires the Operations Director and the Quality lead.
There is no unilateral exception.

## 4. Execution

4.1 Standard change windows are 22:00–04:00 CET. A change that needs daytime
execution states why in the submission.

4.2 Every normal change has a rollback plan. "Revert the commit" is not a
rollback plan unless the change is a single stateless deploy.

4.3 Canary releases go to 5% of traffic for at least 30 minutes before full
rollout. A canary without a defined success metric is just a slow deploy.

## 5. Emergency changes

5.1 An emergency change is approved by the incident commander and one Quality
representative. It does not wait for the next CAB.

5.2 The change is documented within 24 hours and reviewed at the next CAB. An
emergency change without a post-review is treated as an unapproved change.

## 6. Post-implementation review

A failed change is reviewed within 5 business days. The review covers detection,
rollback time and whether the change should have been classified differently.
