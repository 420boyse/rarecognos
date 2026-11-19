---
name: og
description: Prepare, validate and publish the RareCognos social preview assets.
---

## Brand-asset pass: prepare the public card

Use the site identity in src/lib/og/site.json and the artwork that belongs to the page. The home card represents RareCognos. An individual work uses its own artwork for Open Graph and X previews.

During asset preparation in App Builder, keep /workspace/.grok/og-pending current. The marker expires after 10 minutes. The parent task should never wait_tasks or get_task_output for this pass. Remove the marker after publishing and validating the assets.

Follow the [asset handover](references/asset-handover.md) when updating the files. Run `node scripts/brand-check.mjs` from the project root and verify the final HTML for a collection piece as well as the home page.
