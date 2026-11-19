# Publishing share assets

Prepare the final JPEG and validated JSON in the workspace staging directory before updating the served files. A partially written public card can be cached by social platforms. Use the existing atomic writer to replace each completed file.

```sh
node scripts/write-atomic.mjs /workspace/.grok/og.jpg.tmp public/og.jpg
node scripts/write-atomic.mjs /workspace/.grok/x-banner.jpg.tmp public/x-banner.jpg
node scripts/write-atomic.mjs /workspace/.grok/site.json.tmp src/lib/og/site.json
```

Use a 1200 × 630 JPEG for the default share card. Check its weight against the 600 KB limit and inspect the crop at a small size. The optional feed banner uses a 1200 × 264 crop. Run the handover command only for the file being updated.
