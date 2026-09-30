# CARE Onboarding

A frontend-only CARE plugin for guided first-time clinic setup. It uses CARE's superuser username/password login and the CARE REST API. No separate authentication system or backend plug is installed.

## Try it in CARE Desktop

### Hosted plugin

GitHub Pages publishes the checked build from `main`. In Desktop's frontend
plugin settings, use:

```text
Name / Frontend name: care_onboarding_fe
remoteEntry.js URL: https://ohcnetwork.github.io/care_onboarding_fe/assets/remoteEntry.js
Settings JSON: {"config":{"auto_onboarding":true}}
```

Enable Frontend only, then save/apply and reload CARE. This hosted URL requires
internet access from the browser; it does not require a local preview server.
The entry file is a federation module, not a standalone application page.
Automatic onboarding still requires the matching CARE FE and backend integration.

### Local development

```sh
npm ci
npm run build
npm run preview
```

In Desktop's plugin manager, add a **custom frontend-only plugin**:

| Field | Value |
|---|---|
| Name (technical ID; no spaces) | `care_onboarding_fe` |
| Frontend name | `care_onboarding_fe` |
| remoteEntry.js URL | `http://localhost:4178/assets/remoteEntry.js` |
| Settings JSON | `{"config":{"auto_onboarding":true}}` |

Save and apply, then reload CARE in the browser. With the onboarding-enabled CARE FE and backend builds, opening `/` or `/login` on an instance without a clinic redirects to `/onboarding`. Enter your existing superuser username and password there, then follow the setup wizard. This does not create a new superuser account. The setup login has no email, SMS, patient OTP, password-recovery or MFA controls. Accounts that require MFA are explicitly rejected here, never bypassed; use a password-only superuser account for Desktop setup.

The backend's public `GET /api/v1/plug_config/setup_status/` returns only `{"required":true|false}`, without clinic details. Private clinics also count as existing clinics. After a clinic exists, normal login is restored; an unfinished wizard can still be resumed at `/onboarding` or **Facility Setup** (`/admin/onboarding`) after signing in. Creating the clinic does not interrupt the remaining data-loading steps.

Set `config.auto_onboarding` to `false` (or omit it) to keep manual setup only. This setting is runtime configuration; reload CARE after changing it. The startup integration requires the updated CARE FE and backend, not just a new plugin build. Setup-status failures show an explicit retry screen rather than treating a failed check as an empty instance.

The preview command must stay running. This localhost address is for testing on the same computer only; it is not a deployable URL for other clinic computers. Browser policy may block HTTP remotes from an HTTPS CARE page; in that case serve `dist/` through a trusted HTTPS static host with CORS and register its `assets/remoteEntry.js` URL. An unreachable remote will not appear in CARE's navigation.

For a separate API origin, put the API server's base URL (without `/api/v1`) in the **frontend metadata**:

```json
{
  "config": {
    "auto_onboarding": true,
    "api_url": "https://api.example.org"
  }
}
```

Requests use this explicit setting, then `window.CARE_API_URL` if supplied by the host, then CARE's current origin (the correct default for Desktop). Do not put passwords or tokens in metadata. The backend must allow the CARE frontend's origin when using cross-origin API requests.

## Included in this version

- Prepare the bundled Indian states/districts and standard role organizations.
- Choose a district and create one clinic.
- Optionally add departments with matching locations and staff memberships.
- Staff role selection excludes Administrator and Facility Admin. The separate **Add as Facility Admin in Administration** checkbox adds Facility Admin membership in the clinic's Administration department without changing the selected clinical/staff role.
- Clinic and staff phone fields default to India (+91), offer a scrollable country-code selector, and require exactly 10 national digits. Only digits can be entered; the selected calling code is added to the API payload. This release uses the requested 10-digit rule for every selectable country, not country-specific phone-length validation.
- Optionally configure invoice and patient numbering.
- Load all eight bundled questionnaires in **Clinical questionnaires**, then the report template in a separate **Report templates** step. Each loads all its bundled data without a per-item picker. Existing records are retained and missing questionnaire sharing is repaired.
- Missing or invalid staff and clinic fields are highlighted, with validation messages directly below each input. Numbering confirmations use green success panels.
- Per-step progress and safe rechecks on retry, with technical details kept under an administrator disclosure.

The interface is English in this release. Styling follows CARE's Figtree font, form controls, spacing, colors and admin shell. Scoped CSS includes a scoped portal wrapper for selects and does not install another global reset.

### Explicitly not enabled yet

**Clinical catalogs:** `data_source/master-repo.xlsx` and generated activity definitions are preserved as authoring inputs, but are not imported or exposed as experimental user options. Specimen, observation and charge-item loaders, missing source-reference fixes, and healthcare-service/location mapping must be completed and validated against CARE first. The wizard states this limitation before setup and at completion.

**Offline distribution:** the dataset is bundled, but Desktop does not yet package this plugin's build. The original Desktop loader and its button are untouched. A production Desktop release must host a pinned plugin artifact locally and register that URL before the old loader can be removed.

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

Commit spreadsheet and generated JSON changes together. CI checks the conversion diff. Static validation and mocked API tests do not replace a real import against the intended CARE backend version. The installed Desktop image recorded in the manifest was verified with a live browser import of all eight questionnaires, required organization sharing, and the report template; repeating each import produced no duplicate writes. Updating plugin assets never automatically applies new datasets to a completed clinic.

## Recovery and scope

Progress is stored in localStorage under a versioned, API-origin-scoped key. It contains clinic/organization IDs and names, completed staff IDs, and step status, not passwords or staff contact information. Staff drafts remain in memory. Closing or refreshing mid-step may require entering unfinished staff details again; matching existing usernames are not recreated.

Progress schema 3 splits the old combined content step into questionnaires and templates. Schema 2 checkpoints migrate automatically: unfinished content resumes at questionnaires with safe rechecks, and completed content marks both steps complete. Existing clinic IDs and earlier completed steps are retained.

One browser tab at a time can run setup, using Web Locks on a secure CARE origin. This is not a server-wide lock across computers. Use one administrator/browser for initial setup.

The CARE database is authoritative. Existing facilities block a new wizard except when matching saved progress. If creation succeeded but its response/checkpoint was lost, the recorded creation intent allows the administrator to confirm the matching facility and continue. No facility is adopted silently. Clearing browser storage loses resume context; this version does not provide server-side jobs or cross-browser resume.

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
