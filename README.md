# ADO GHL–Slack Relay Recovery

This is the protected internal relay that restores ADO campaign operations between GoHighLevel and Slack. It is designed to be rebuilt, tested in ABC Dealer, and backed up to company GitHub without ever placing working credentials in source control.

## Start here

Read [`docs/SETUP_AND_RECOVERY.md`](docs/SETUP_AND_RECOVERY.md) for the plain-English setup, testing, rotation, and restore procedure. Use [`docs/WORKFLOW_MAP.md`](docs/WORKFLOW_MAP.md) when rebuilding GHL workflows. The required setting names, with no real values, are in [`.env.example`](.env.example).

## What is included

The service validates GoHighLevel webhook authorization before taking action, creates or refreshes campaign Slack channels and Production Canvases, posts proof-stage notices, syncs dealer and campaign custom values, persists archive state and safe action logs, and exposes a login-protected, secret-free recovery dashboard.

## Backup rule

Before a working change is released, commit the tested source, migration, workflow map, and recovery guide to the company GitHub repository. Keep the actual connection values only in protected project settings and the designated private recovery vault.
