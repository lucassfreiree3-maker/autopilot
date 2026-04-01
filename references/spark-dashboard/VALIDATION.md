# Spark Sync Validation

This file documents the fail-closed payload handling added to the Spark dashboard sync workflows.

It also provides a safe path under `references/spark-dashboard/**` for triggering the official sync workflow during validation without changing the published dashboard HTML.

Validation note: the state collector fix landed after the first fail-closed run, so this file was updated to trigger a second end-to-end sync with the repaired collector.
