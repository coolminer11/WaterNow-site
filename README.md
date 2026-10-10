# WaterNow companion site

Public site of the WaterNow Android app, served by GitHub Pages at
**https://coolminer11.github.io/WaterNow-site/**. The app's code is private; this repo only holds what the app
and the people it shares links with need to reach:

| Path | What |
| --- | --- |
| `version.json` | The update manifest the app reads (at most once a day, and from Settings → Check for updates). |
| `download/WaterNow-<versionCode>.apk` | The APK that manifest points to. |
| the other folders | Share pages and the live location page the app links to. |

`.nojekyll` tells Pages to serve the files as they are.

## Publishing a release

Releases are staged from the app's repo, never by hand:

```sh
# in the app repo, everything committed (the versionCode is the commit count)
scripts/publish-release.sh --notes-en "What changed" --notes-fr "Ce qui change" [--min <versionCode>]
scripts/deploy-site.sh
```

`publish-release.sh` builds the APK, checks it is signed with the release key,
copies it to `download/`, and rewrites `version.json` with its SHA-256 and size. Without `--min` / `--notes-*` it
keeps the previous values. `deploy-site.sh` checks the APK against `version.json`, drops older APKs and replaces
this repo with one fresh commit (force-pushed: the repo keeps no history, so no older APK stays reachable). Pages redeploys in a minute or two; the CDN may serve the old `version.json` for up to 10 minutes.

## version.json

```json
{
  "versionCode": 48,
  "versionName": "1.48",
  "minVersionCode": 40,
  "apkUrl": "https://coolminer11.github.io/WaterNow-site/download/WaterNow-48.apk",
  "sha256": "<64 lowercase hex>",
  "sizeBytes": 29296630,
  "publishedAt": "2026-10-04T15:00:00Z",
  "notes": { "en": "…", "fr": "…" }
}
```

The app ignores a manifest that breaks any of these rules (it then offers nothing and blocks nothing):
https only; `apkUrl` directly inside this site's `download/` folder; `sha256` 64 hex digits; `sizeBytes` above 0 and
under 100 MB; every field present with the right type; `minVersionCode` not above `versionCode`.

Before installing, the app checks the downloaded file's size and SHA-256 against the manifest, then the APK itself:
same package name, exactly this `versionCode` and newer than the installed one, and signed with the same certificate
as the installed app. Only then does it open Android's installer, which asks the user once more.

- **`versionCode` above the installed one**: the app shows "New version available" (once per version; Settings
  keeps offering it).
- **Installed version below `minVersionCode`**: the app shows a full-screen "Update required" page and nothing
  else until it is updated. Raise it only when older versions can no longer talk to the server (for example after
  a database change), and only to a version that is already published.

## The signing key

Every release must be signed with the same key: Android refuses an update signed with another one, and users would
have to uninstall (losing their local data) to get it. The key lives with the app's repo and is never
in git. **Keep a backup of it somewhere safe.** The publish script refuses any other key.
