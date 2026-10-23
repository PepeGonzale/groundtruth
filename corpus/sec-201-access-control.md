---
id: SEC-201
title: Access control
owner: Security
version: 3.0
effective: 2025-06-01
classification: internal
---

## 1. Identity

1.1 All workforce accounts use the corporate identity provider. Local accounts
are permitted only for break-glass access and are reviewed monthly.

1.2 Multi-factor authentication is mandatory for every account, including
service accounts with interactive login. SMS is not an accepted second factor;
use a hardware key or an authenticator app.

## 2. Authorisation

2.1 Access follows least privilege. A role grants the minimum permissions needed
for the task, not the department's historical permissions.

2.2 Production access is granted per service, not per environment. There is no
standing "production admin" group.

2.3 Break-glass credentials are stored in the sealed vault, require two approvers,
and trigger an alert when used. Every use is reviewed within one business day.

## 3. Reviews

3.1 Managers review their team's access **quarterly**. The review covers all
systems, not only the ones with a recent change.

3.2 Privileged access is recertified every **90 days**. An unreviewed privileged
grant is revoked automatically at day 91.

3.3 Service accounts are reviewed every 6 months. An owner who has left the
company is not a valid owner.

## 4. Joiners and leavers

4.1 Access is provisioned only after the joiner has completed security training.

4.2 On the last working day, all access is revoked within **24 hours**. The
manager confirms revocation; the security team audits a sample every month.

4.3 A leaver's credentials are never reused or reassigned.

## 5. Security incidents

Report a suspected security incident to the security team within **1 hour** of
discovery. Do not investigate alone, do not delete evidence, and do not discuss
the incident in public channels.

## 6. Vendors and contractors

Vendor access is time-bound, sponsored by a named employee, and limited to the
systems in the contract. Vendor accounts expire automatically at the end of the
engagement. A vendor requesting broader access goes through the same review as
an employee.
