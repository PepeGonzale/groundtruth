---
id: OPS-110
title: Cold chain playbook
owner: Quality Assurance
version: 4.0
effective: 2025-03-10
classification: internal
---

## 1. Product range

Halcyon transports chilled product between **2°C and 8°C** unless the customer
provides a written specification with a different range. Frozen product is
transported at −18°C or colder. Ambient product is out of scope for this
playbook.

## 2. Monitoring

2.1 Every reefer carries two calibrated loggers. Readings are recorded every 5
minutes and uploaded automatically at each depot scan.

2.2 Loggers are calibrated annually. An uncalibrated logger invalidates the
temperature record for that trip and the shipment is treated as unverified until
QA reviews it.

2.3 A gap of more than 20 minutes in logger data is treated as an excursion of
unknown duration and escalated to QA.

## 3. Excursion classification

| Class | Condition | Response |
| --- | --- | --- |
| Minor | Outside range for less than 30 minutes, product between 0°C and 15°C | Document and notify QA within 30 minutes |
| Major | Outside range for 30 minutes or more, or product above 15°C | Quarantine and notify QA immediately |
| Critical | Above 15°C for 2 hours or more, or any frozen product above −12°C | Quarantine, notify QA and the customer immediately |

## 4. Response procedure

4.1 Stop the vehicle at the first safe location. Do not open the cargo door for
inspection unless QA explicitly asks for a manual reading.

4.2 Switch to the backup cooling unit if available. Record the switch time.

4.3 Quarantine the load in the nearest validated cold room within **15 minutes**
of confirming a major or critical excursion. Quarantine means physical
segregation and a sealed hold label, not a note in the system.

4.4 Notify QA within 30 minutes for a major excursion and immediately for a
critical one. QA decides release, relabel or destroy. Drivers and dispatchers
never decide disposition.

## 5. Customer notification

Notify the affected customer within **2 hours** of confirming a major or critical
excursion. The notification includes the lane, the affected pallet count, the
logger readings, and the quarantine location. Do not speculate about product
condition; QA provides the disposition.

## 6. Documentation

6.1 The excursion record contains: shipment identifiers, logger files, switch
times, quarantine location, QA disposition and customer notification timestamp.

6.2 Records are attached to the delivery record and retained according to
DAT-305.

## 7. Reefer failure

If the reefer (cooling unit) fails and no backup is available, treat the shipment
as a major excursion and move it to the nearest validated cold room. Do not continue
the route to save time.
