---
id: DAT-305
title: Data retention
owner: Data Governance
version: 5.1
effective: 2025-05-15
classification: internal
---

## 1. Principles

Keep data only as long as there is a documented operational, contractual or
legal reason. When in doubt, keep less and ask Data Governance. Retention is a
default, not a permission to keep everything.

## 2. Retention schedule

| Data class | Retention | Starts |
| --- | --- | --- |
| Vehicle telemetry | 18 months | end of trip |
| Delivery records and POD | 7 years | delivery date |
| Temperature logs | 7 years | delivery date |
| CCTV in depots | 30 days | recording date |
| Support tickets | 3 years | ticket closure |
| Audit logs | 2 years | event date |
| Backup copies | 35 days | backup date |
| Marketing consent records | duration of consent plus 3 years | withdrawal |

## 3. Deletion requests

3.1 A verified deletion request is executed within **30 days**. The requester
receives confirmation when deletion is complete.

3.2 Deletion covers primary storage, derived indexes and caches. A record left in
a search index is not deleted.

3.3 Backups are not rewritten. Data in a backup expires with the backup cycle,
which is 35 days. If a restore happens after a deletion, the deletion is
reapplied within 2 business days.

## 4. Legal hold

4.1 A legal hold suspends deletion for the named records, custodians or date
range. It is issued by Legal in writing and takes precedence over this schedule.

4.2 The hold is reviewed every 90 days. It is released only by Legal. Operations
does not release a hold because a customer asked.

## 5. Anonymisation

Where the operational need ends before the retention period, records are
anonymised instead of deleted. Anonymisation must be irreversible: removing a
name from a row while keeping the driver identifier is pseudonymisation, not
anonymisation.

## 6. Ownership

Each data class has a named owner in the data catalogue. Owners confirm the
retention rule annually. A class without an owner is escalated to the Data
Governance committee.
