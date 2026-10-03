# CARE Onboarding

A frontend-only CARE plugin for guided first-time clinic setup after normal CARE login. It uses the existing CARE session and authenticated REST APIs. No separate authentication system, backend plug, or CARE source patches are required.

## Try it in CARE Desktop

### Hosted plugin

GitHub Pages publishes the checked build from `main`. In Desktop's frontend
plugin settings, use:

```text
Plugin ID / Frontend name: care_onboarding_fe
Display name: CARE Onboarding
remoteEntry.js URL: https://ohcnetwork.github.io/care_onboarding_fe/assets/remoteEntry.js
Settings JSON: {"config":{"redirect_after_login":true}}
```

Enable Frontend only, then save/apply and reload CARE. This hosted URL requires
internet access from the browser; it does not require a local preview server.
The entry file is a federation module, not a standalone application page.
Automatic redirect requires the existing CARE frontend override configuration
described below. Without it, open **Facility Setup** manually after login.

### Automatic setup after login

Enable the dashboard override in the CARE frontend's build environment:

```dotenv
REACT_MFE_REGISTERED_COMPONENTS=UserDashboard
```

If other components are already listed, append `UserDashboard` rather than
replacing them. `*` already includes it. Rebuild the CARE frontend after changing
this setting; updating the plugin URL alone cannot change a built host bundle.
This uses CARE's existing component-override feature and does not require editing
CARE frontend or backend source. The selected CARE version must support manifest
`overrides`, registering `UserDashboard`, and passing the original component as
`__base`.

The flow is:

1. Open CARE and sign in normally using the initial superuser created during installation.
2. On the home dashboard, the plugin confirms the account is a superuser.
3. It checks `GET /api/v1/facility/?limit=1&offset=0` using that session. The
   superuser's unfiltered facility list includes private clinics; the plugin does
   not infer instance state from the user's assigned facilities.
4. No facility means redirect to `/admin/onboarding`. Any existing facility means
   render the original CARE dashboard. Ordinary users keep their dashboard without
   an instance-facility check.

Failed or malformed checks show an explicit error with **Try again**; they never
count as an empty installation. The check runs when the dashboard mounts, not on
every page or continuously during setup. Login, MFA and patient authentication
remain CARE's responsibility; this plugin neither replaces nor bypasses them.

Automatic redirect is enabled unless `config.redirect_after_login` is explicitly
`false`. With that opt-out, **Facility Setup** remains available manually.
After creating the clinic, return to **Facility Setup** in the same browser to
resume unfinished setup; existing facilities do not trigger automatic redirect.
`/onboarding` remains an authenticated route alias for existing bookmarks.

The previous experimental `onboarding.path`/`auto_onboarding` pre-login integration
is no longer used. Replace old `auto_onboarding` metadata with
`redirect_after_login`; the plugin never calls `plug_config/setup_status/`.
Use an unmodified compatible CARE host instead of the experimental pre-login gate.

### Local development

```sh
npm ci
npm run build
npm run preview
```

In Desktop's plugin manager, add a **custom frontend-only plugin**:

| Field | Value |
|---|---|
| Plugin ID (no spaces) | `care_onboarding_fe` |
| Display name (if supported by the plugin manager) | `CARE Onboarding` |
| Frontend name | `care_onboarding_fe` |
| remoteEntry.js URL | `http://localhost:4178/assets/remoteEntry.js` |
| Settings JSON | `{"config":{"redirect_after_login":true}}` |

Save and apply, then reload CARE in the browser. Sign in through normal CARE login.
With `UserDashboard` registered, the plugin redirects an empty instance from the
home dashboard to setup. Otherwise open **Facility Setup** (`/admin/onboarding`).
Creating the clinic does not interrupt the remaining setup steps.

The preview command must stay running. This localhost address is for testing on the same computer only; it is not a deployable URL for other clinic computers. Browser policy may block HTTP remotes from an HTTPS CARE page; in that case serve `dist/` through a trusted HTTPS static host with CORS and register its `assets/remoteEntry.js` URL. An unreachable remote will not appear in CARE's navigation.

For a separate API origin, put the API server's base URL (without `/api/v1`) in the **frontend metadata**:

```json
{
  "config": {
    "redirect_after_login": true,
    "api_url": "https://api.example.org"
  }
}
```

Requests use this explicit setting, then `window.CARE_API_URL` if supplied by the host, then CARE's current origin (the correct default for Desktop). Do not put passwords or tokens in metadata. The backend must allow the CARE frontend's origin when using cross-origin API requests.

## Included in this version

- Prepare the bundled Indian states/districts and standard role organizations.
- Choose a district and create one clinic.
- Optionally add departments with matching locations and staff memberships.
- Each staff member must have at least one explicitly selected department before any staff accounts or memberships are saved. Facility Admin access does not replace this selection. If departments were skipped, use **Go back to departments**; staff drafts stay in memory while adding departments, not in browser storage. The entire staff step can still be skipped.
- Staff role selection excludes Administrator, Facility Admin, and Volunteer. Volunteer remains available for role organization setup and questionnaire sharing. The separate **Add as Facility Admin in Administration** checkbox adds Facility Admin membership in the clinic's Administration department without changing the selected clinical/staff role.
- Clinic and staff phone fields default to India (+91), offer a scrollable country-code selector, and require exactly 10 national digits. Only digits can be entered; the selected calling code is added to the API payload. This release uses the requested 10-digit rule for every selectable country, not country-specific phone-length validation.
- Optionally configure invoice and patient numbering.
- Load all eight bundled questionnaires in **Clinical questionnaires**, then the report template in a separate **Report templates** step. Each loads all its bundled data without a per-item picker. Existing records are retained and missing questionnaire sharing is repaired.
- Missing or invalid staff and clinic fields are highlighted, with validation messages directly below each input. Numbering confirmations use green success panels.
- Per-step progress and safe rechecks on retry, with technical details kept under an administrator disclosure.

The interface is English in this release. Styling follows CARE's Figtree font, form controls, spacing, colors and admin shell. Scoped CSS includes a scoped portal wrapper for selects and does not install another global reset.

### Explicitly not enabled yet

**Clinical catalogs:** `data_source/master-repo.xlsx` and generated activity definitions are preserved as authoring inputs, but are not imported or exposed as experimental user options. Specimen, observation and charge-item loaders, missing source-reference fixes, and healthcare-service/location mapping must be completed and validated against CARE first. The wizard states this limitation before setup and at completion.

**Offline distribution:** the dataset is bundled with the plugin, but the GitHub Pages remote requires internet access. An offline deployment must host the complete plugin build locally and register that URL. No standalone Desktop loader is required by this plugin.

## Data ownership and updating

All reusable source data is in `data_source/`. Clinic details and staff are entered in the wizard; records are saved only through CARE APIs into the clinic's database. No patient data, credentials or clinic exports belong in this repository.

`data_source/manifest.json` records provenance, data version and inspected API contracts. The installed Desktop backend uses UUID questionnaire detail/sharing routes and supports slug-filtered list lookup. The importer explicitly sends `actions: []` when a fixture has no actions; omission triggers a server error in this backend. Sharing is reconciled through `get_organizations`/`set_organizations` after creation, since sending organizations with the creation payload alone does not establish it on every backend version.

```sh
npm run convert        # spreadsheet -> data_source/activity-definitions/
npm run validate:data  # fixture shape, counts and duplicate checks
npm test
npm run build
npm run test:browser    # federation host harness, mocked CARE API
```

Optional real-host integration coverage uses an independently built CARE frontend
with `UserDashboard` registered and a same-origin API URL. Serve that host and the
plugin preview, then run:

```sh
ONBOARDING_CARE_HOST_URL=http://localhost:4184 npm run test:browser -- tests/care-host.spec.ts
```

These tests use the real CARE login/router/override implementation with mocked API
responses; they never restore or write a clinic database. The post-login flow was
verified against unmodified `ohcnetwork/care_fe` commit
`90d9a412e179584d5534d354bd4c7c61f42452da` from `bodhi/questionnaire-actions`, with
only build-environment configuration. The tests register the plugin specified by
`ONBOARDING_REMOTE_URL` (defaults to the local preview URL).

Commit spreadsheet and generated JSON changes together. CI checks the conversion diff. Static validation and mocked API tests do not replace a real import against the intended CARE backend version. The installed Desktop image recorded in the manifest was verified with a live browser import of all eight questionnaires, required organization sharing, and the report template; repeating each import produced no duplicate writes. Updating plugin assets never automatically applies new datasets to a completed clinic.

## Recovery and scope

Progress is stored in localStorage under a versioned, API-origin-scoped key. It contains clinic/organization IDs and names, completed staff IDs, and step status, not passwords or staff contact information. Staff drafts remain in memory. Closing or refreshing mid-step may require entering unfinished staff details again; matching existing usernames are not recreated.

Progress schema 3 splits the old combined content step into questionnaires and templates. Schema 2 checkpoints migrate automatically: unfinished content resumes at questionnaires with safe rechecks, and completed content marks both steps complete. Existing clinic IDs and earlier completed steps are retained.

One browser tab at a time can run setup, using Web Locks on a secure CARE origin. This is not a server-wide lock across computers. Use one administrator/browser for initial setup.

The CARE database is authoritative. Existing facilities block a new wizard except when matching saved progress. If creation succeeded but its response/checkpoint was lost, the recorded creation intent allows the administrator to confirm the matching facility and continue. No facility is adopted silently. Clearing browser storage loses resume context; this version does not provide server-side jobs or cross-browser resume.

If this browser remembers a clinic but CARE successfully reports no facilities, setup offers **Start setup again** with confirmation. Check that you are connected to the intended deployment first, especially after a database reset or deployment change at the same URL. Resetting replaces only this plugin's checkpoint for the current CARE connection; it preserves your login, other browser storage, and all CARE database records, then rechecks CARE before restarting. This action is not offered for failed checks or when facilities exist. A hard refresh alone does not clear the saved checkpoint.

Imports are not transactional. Successful records remain after failure; retries inspect existing data before new writes. Session/connection failures stop scheduling additional batch items. Leaving the plugin cancels outstanding browser requests and stops subsequent batch items; it cannot roll back a request already accepted by CARE. Existing staff roles are never silently changed. Browser storage failures block further setup rather than falsely promising resumability.

## Build and deployment

The federation name and registration slug are both `care_onboarding_fe`. Vite exposes `./manifest` at `dist/assets/remoteEntry.js`. Deploy the **whole `dist/` directory**, not just the entry file: lazy-loaded forms, templates and UI code live in adjacent chunks. Static hosts must serve JavaScript with an appropriate MIME type and allow cross-origin module requests where necessary.

Use Node >=22.9 and the locked dependencies. The remote uses Vite 6 for compatibility with `@originjs/vite-plugin-federation`, and shares React/ReactDOM with CARE rather than mounting a second application.

For HMR with a compatible CARE FE checkout, its local plugin discovery accepts a real `apps/care_onboarding_fe/src/manifest.tsx` directory (not a symlink). For this sibling repository, use `npm run dev` (build/watch) alongside `npm run preview`, then reload CARE after a rebuild.

Default branch: `main`. Pushes to `main` run the checks and deploy the complete
`dist/` artifact to GitHub Pages only after they pass. Pull requests run checks
without deploying. The workflow can also be dispatched manually on `main`.
CI sets `ONBOARDING_BASE_PATH=/care_onboarding_fe/` and runs browser checks using
that same subdirectory before deployment. Local builds default to `/`.
For another hosting subdirectory, set `ONBOARDING_BASE_PATH` when building and
previewing. Avoid Vite's relative `./` base: the federation plugin generates
incorrect nested `assets/assets/` imports with that setting.
