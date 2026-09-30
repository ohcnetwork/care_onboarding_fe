# CARE Onboarding

A frontend-only CARE plugin for guided first-time clinic setup. It uses the signed-in CARE administrator's session and the existing CARE REST API. No separate login or backend plug is installed.

## Try it in CARE Desktop

```sh
npm ci
npm run build
npm run preview
```

In Desktop's plugin manager, add a **custom frontend-only plugin**:

| Field | Value |
|---|---|
| ID | `care_onboarding_fe` |
| Label | `CARE Onboarding` |
| Frontend slug | `care_onboarding_fe` |
| Frontend URL | `http://localhost:4178/assets/remoteEntry.js` |
| Frontend metadata | `{}` |

Save and apply, then reload CARE in the browser. Sign in as a superuser and open **Facility Setup** in the admin navigation, or visit `/admin/onboarding`.

The preview command must stay running. This localhost address is for testing on the same computer only; it is not a deployable URL for other clinic computers. Browser policy may block HTTP remotes from an HTTPS CARE page; in that case serve `dist/` through a trusted HTTPS static host with CORS and register its `assets/remoteEntry.js` URL. An unreachable remote will not appear in CARE's navigation.

For a separate API origin, put the API server's base URL (without `/api/v1`) in the **frontend metadata**:

```json
{
  "config": {
    "api_url": "https://api.example.org"
  }
}
```

Requests use this explicit setting, then `window.CARE_API_URL` if supplied by the host, then CARE's current origin (the correct default for Desktop). Do not put passwords or tokens in metadata. The backend must allow the CARE frontend's origin when using cross-origin API requests.

## Included in this version

- Prepare the bundled Indian states/districts and standard role organizations.
- Choose a district and create one clinic.
- Optionally add departments with matching locations and staff memberships.
- Optionally configure invoice and patient numbering.
- Load all eight bundled questionnaires and one report template automatically. Existing records are retained and missing questionnaire sharing is repaired.
- Per-step progress and safe rechecks on retry, with technical details kept under an administrator disclosure.

The interface is English in this release. Styling follows CARE's Figtree font, form controls, spacing, colors and admin shell. Scoped CSS includes a scoped portal wrapper for selects and does not install another global reset.

### Explicitly not enabled yet

**Clinical catalogs:** `data_source/master-repo.xlsx` and generated activity definitions are preserved as authoring inputs, but are not imported or exposed as experimental user options. Specimen, observation and charge-item loaders, missing source-reference fixes, and healthcare-service/location mapping must be completed and validated against CARE first. The wizard states this limitation before setup and at completion.

**Automatic redirection:** the plugin registers `/admin/onboarding`; it does not intercept login or other pages. A runtime `config.auto_onboarding` setting is reserved, but has no effect until CARE FE implements an authenticated startup extension. Registering this plugin alone does not add that missing host capability.

**Offline distribution:** the dataset is bundled, but Desktop does not yet package this plugin's build. The original Desktop loader and its button are untouched. A production Desktop release must host a pinned plugin artifact locally and register that URL before the old loader can be removed.

## Data ownership and updating

All reusable source data is in `data_source/`. Clinic details and staff are entered in the wizard; records are saved only through CARE APIs into the clinic's database. No patient data, credentials or clinic exports belong in this repository.

`data_source/manifest.json` records provenance, data version and the API revisions inspected during extraction. The original Desktop backend ref `ENG-737` is no longer resolvable on GitHub, so compatibility with that installed image must be established against a disposable instance before real onboarding. Current questionnaire APIs require `organizations` on creation; the plugin also repairs sharing through the standard organization endpoints.

```sh
npm run convert        # spreadsheet -> data_source/activity-definitions/
npm run validate:data  # fixture shape, counts and duplicate checks
npm test
npm run build
npm run test:browser    # federation host harness, mocked CARE API
```

Commit spreadsheet and generated JSON changes together. CI checks the conversion diff. Static validation and mocked API tests do not replace a real import against the intended CARE backend version. Updating plugin assets never automatically applies new datasets to a completed clinic.

## Recovery and scope

Progress is stored in localStorage under a versioned, API-origin-scoped key. It contains clinic/organization IDs and names, completed staff IDs, and step status, not passwords or staff contact information. Staff drafts remain in memory. Closing or refreshing mid-step may require entering unfinished staff details again; matching existing usernames are not recreated.

One browser tab at a time can run setup, using Web Locks on a secure CARE origin. This is not a server-wide lock across computers. Use one administrator/browser for initial setup.

The CARE database is authoritative. Existing facilities block a new wizard except when matching saved progress. If creation succeeded but its response/checkpoint was lost, the recorded creation intent allows the administrator to confirm the matching facility and continue. No facility is adopted silently. Clearing browser storage loses resume context; this version does not provide server-side jobs or cross-browser resume.

Imports are not transactional. Successful records remain after failure; retries inspect existing data before new writes. Session/connection failures stop scheduling additional batch items. Leaving the plugin cancels outstanding browser requests and stops subsequent batch items; it cannot roll back a request already accepted by CARE. Existing staff roles are never silently changed. Browser storage failures block further setup rather than falsely promising resumability.

## Build and deployment

The federation name and registration slug are both `care_onboarding_fe`. Vite exposes `./manifest` at `dist/assets/remoteEntry.js`. Deploy the **whole `dist/` directory**, not just the entry file: lazy-loaded forms, templates and UI code live in adjacent chunks. Static hosts must serve JavaScript with an appropriate MIME type and allow cross-origin module requests where necessary.

Use Node >=22.9 and the locked dependencies. The remote uses Vite 6 for compatibility with `@originjs/vite-plugin-federation`, and shares React/ReactDOM with CARE rather than mounting a second application.

For HMR with a compatible CARE FE checkout, its local plugin discovery accepts a real `apps/care_onboarding_fe/src/manifest.tsx` directory (not a symlink). For this sibling repository, use `npm run dev` (build/watch) alongside `npm run preview`, then reload CARE after a rebuild.

Default branch: `main`. No publish or deployment runs automatically.
