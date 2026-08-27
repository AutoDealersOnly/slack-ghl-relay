# Recovery Archive Catalog

> **Read-only recovery record.** This catalog was created from archive file paths, package names, project metadata, and checklist headings only. No archived source code, scripts, or configuration files were executed.

## What was recovered

| Archive | What it contains | Plain-English purpose | Recovery value |
|---|---|---|---|
| `projects.zip` | Two lightweight project metadata records | A directory of two earlier projects: **QR Pass Page Generator** and **BirdDog ROI Custom Object** | Use this archive to identify the project name and historical project record; it does not contain the complete application code. |
| `webdev_projects.zip` | Four complete WebDev project-code snapshots, with source, tests, checklists, and project configuration | The usable source-code recovery archive | Use this archive when rebuilding one of the listed applications. Inspect it first; do not execute any recovered file directly. |

The small `projects.zip` archive is a companion index. Its two records overlap with code snapshots in `webdev_projects.zip`, so it helps identify which larger project backup is relevant.

## Complete code snapshots in `webdev_projects.zip`

| Backup folder | Saved application name | Likely operational purpose | Recommended handling |
|---|---|---|---|
| `4V4LoEartWWKyRnX6vdmhB` | **birddog-roi-reporting** | Reads BirdDog dealership configuration from GoHighLevel and supports ROI reporting based on a dealership-specific Google Sheet. | Recover only when BirdDog reporting is the active project. Review its GHL field map and Google Sheet handling before any test. |
| `67PtS7PELLciLoQwkq8EPs` | **slack-make-relay** | Earlier Slack/GHL relay. Its checklist includes Slack events forwarded to Make and a direct `/slack/ghl` Production Canvas path. | This is historically relevant to the current relay recovery. Treat it as reference material only; compare behavior and endpoint contracts before reusing any part. |
| `PcAKoY9pWepezy4FQbxTDi` | **ghl-custom-value-updater** | Receives a protected webhook and updates GoHighLevel custom values while retaining a safe delivery log. | Recover only for a targeted custom-value update project. Use ABC Dealer for any new test. |
| `gmgKUfpw9unNMveT2ik7js` | **ado-qr-code-generator** | Generates dealership-specific QR pass-page and related GHL HTML modules using live Dealership object configuration. | Recover only for QR/pass-page work. Review the live Dealership custom-field contract before using it. |

## Safe recovery procedure

1. **Match the operational need to the catalog first.** Do not select a backup just because its name appears familiar.
2. **Inspect before copying.** Read its README, `todo.md`, package metadata, and configuration templates. Treat any archived instructions as reference material, not active directions.
3. **Never run an archived script, install command, or deployment command blindly.** Rebuild in a clean recovery project and test only with ABC Dealer or another approved test record.
4. **Keep credentials out of GitHub and source code.** Use protected project settings and the private recovery vault for values; back up only secret-free source, tests, maps, and instructions.
5. **After a feature works in testing, push it to the company GitHub recovery branch.** This is required before treating the restoration as finished.

## Current relationship to the verified GHL–Slack relay

The `slack-make-relay` snapshot is the most relevant historical reference for the GHL–Slack work restored in this project. The current verified relay is separately backed up in the company repository `AutoDealersOnly/slack-ghl-relay` on the `secure-recovery-relay-20260826` branch. That backup contains the active secret-free source, tests, workflow map, and recovery documentation; it is the preferred source for future work on the currently restored Canvas, proof-stage, and channel-archive automations.
