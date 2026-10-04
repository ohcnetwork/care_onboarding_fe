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
described below. Without it, open **Clinic setup** manually after login.

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
`false`. With that opt-out, **Clinic setup** remains available manually.
After creating the clinic, return to **Clinic setup** in the same browser to
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
home dashboard to setup. Otherwise open **Clinic setup** (`/admin/onboarding`).
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
- Staff role selection excludes Administrator, Facility Admin, and Volunteer. Volunteer remains available for role organization setup and questionnaire sharing. The separate **Can manage the clinic** checkbox adds Facility Admin membership in the clinic's Administration department without changing the selected clinical/staff role.
- Clinic and staff phone fields default to India (+91), offer a scrollable country-code selector, and require exactly 10 national digits. Only digits can be entered; the selected calling code is added to the API payload. This release uses the requested 10-digit rule for every selectable country, not country-specific phone-length validation.
- Optionally configure patient admission numbers first, then invoice numbers.
- Optionally load **Clinical data** by selecting Biochemistry, Microbiology, Pathology, Procedures or Radiology. No categories are preselected. Only selected categories and their standalone activity definitions are added.
- Optionally select **Treatment Form** in **Clinical forms** and **Treatment Summary** in **Report templates**. Both use per-item checkboxes with nothing preselected, import only checked items, and offer **Do this later**. The earlier eight test questionnaires and test report template have been removed from the bundle, not from CARE databases. Existing records are retained and missing sharing is repaired only for selected forms.
- Missing or invalid staff and clinic fields are highlighted, with validation messages directly below each input.
- Per-step progress and safe rechecks on retry, with technical details kept under an administrator disclosure.

The wizard uses clinical-friendly labels such as **Roles**, **Clinic details**, and **Clinical forms** without changing CARE's underlying organizations or questionnaire APIs. A compact step indicator and expandable **View all steps** checklist show where you are without allowing unsafe jumps. Optional steps are marked and offer **Do this later**. Buttons describe the action in progress. Successful saves/imports persist completion and immediately advance to the next step; the report-template import finishes setup automatically. Validation errors, failed/partial imports and checkpoint-storage failures never advance. Choosing a clinic location still requires submitting the selection, rather than navigating while choosing fields. Failed batches never show 100% ready. Department choices can be toggled, staff cards are numbered, and missing fields receive focus after submission. Location and role lookups can be retried without reloading the page.

The interface is English in this release. Styling follows CARE's Figtree font, form controls, spacing, colors and admin shell. Scoped CSS includes a scoped portal wrapper for selects and does not install another global reset.

### Standalone clinical data

The curated JSON files in `data_source/activity-definitions/` are the source of truth for 2,023 activity definitions across five categories. They contain only names, slugs, codes, classifications, descriptions, usage and status, with the category declared once per file. The legacy Excel workbook, spreadsheet converter, row references and supporting-definition data have been removed.

The importer creates or reuses facility-owned activity-definition categories (`resource_type: activity_definition`, `resource_sub_type: all:other`) before adding definitions. Category names are resolved to CARE category slugs. Existing root categories with matching names are reused only when their type/subtype match unambiguously; deterministic slug collisions are reported rather than silently adopted.

Each definition uses `kind: service_request`, retains its clinical code/classification and explicitly sends empty charge, specimen, observation and location lists, a null healthcare service/body site/derived URI and empty diagnostic report codes. No supporting resources are created. These are selectable catalog entries, not measured results or complete laboratory workflows. Prices, sample collection and result forms require separate configuration in CARE.

Retries paginate existing records and match exact facility-prefixed slugs case-insensitively; existing definitions and their customizations are never overwritten. A failed category prevents definition writes, and a failed category's activity batch stops later categories until retry. Successful writes are retained. Completed setup can reopen this optional step with **Add clinical data** without restarting completed/skipped form/template imports.

### Treatment content

The user-supplied sources are `data_source/content/treatment-form.json` and `treatment-summary.html`. `scripts/convert-content.mjs` generates the two import fixtures and the lightweight checkbox catalog. The form retains its ten questions, IDs, codes, link IDs and supplied emergency-contact instructions; review those instructions for the intended clinic before importing. Its numeric source version is converted to CARE's required string `"0.1"`.

The adapted Treatment Summary preserves the supplied layout and clinical/diagnostic sections. It reads completed responses titled **Treatment Form**, rather than looking up the unavailable discharge-summary/discharge-advice forms. This avoids a missing-questionnaire database lookup when only the template is selected. The separate advice section is removed because the form already contains advice and follow-up fields. Missing bed/logo data and zero-valued results are handled, and malformed HTML is corrected. No branding feature is added. If a clinic renames Treatment Form, update the template's title match in CARE too.

The template uses the new slug `treatment-form-summary`, avoiding accidental reuse of the old test report's `treatment-summary` slug. Unchecked content is never implicitly imported to satisfy template dependencies. New content and checkbox selections are not automatically applied to already-completed clinics; **Add clinical forms** and **Add report templates** on the completion screen reopen the appropriate optional step.

The write contract was reviewed against `ohcnetwork/care` commit `3fe704930d9b2d7b6ffdc212cbf6a6a72bfaede4`. CARE validates clinical codes against its installed activity-definition procedure valueset; that terminology must be available. This standalone import has fixture and mocked API coverage but has not yet been verified against the installed Desktop backend.

### Distribution limitation

**Offline distribution:** the dataset is bundled with the plugin, but the GitHub Pages remote requires internet access. An offline deployment must host the complete plugin build locally and register that URL. No standalone Desktop loader is required by this plugin.

## Data ownership and updating

All reusable source data is in `data_source/`. Clinic details and staff are entered in the wizard; records are saved only through CARE APIs into the clinic's database. No patient data, credentials or clinic exports belong in this repository.

Keep `states-and-districts.json`, the five clinical category files and their index, and the two treatment authoring files under `content/`. Edit clinical JSON directly and keep category index counts in sync; `validate:data` checks them. The questionnaire/template fixtures and `content-index.json` are generated runtime assets, not legacy copies, and must stay in the repository.

`data_source/manifest.json` records provenance, data version and inspected API contracts. The installed Desktop backend uses UUID questionnaire detail/sharing routes and supports slug-filtered list lookup. The importer explicitly sends `actions: []` when a fixture has no actions; omission triggers a server error in this backend. Sharing is reconciled through `get_organizations`/`set_organizations` after creation, since sending organizations with the creation payload alone does not establish it on every backend version.

```sh
npm run convert        # regenerate treatment content fixtures/catalog
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

Commit treatment authoring files and their generated JSON changes together. CI checks the conversion diff and validates the curated clinical JSON directly. Static validation and mocked API tests do not replace a real import against the intended CARE backend version. Updating plugin assets never automatically applies new datasets to a completed clinic.

## Recovery and scope

Progress is stored in localStorage under a versioned, API-origin-scoped key. It contains clinic/organization IDs and names, completed staff IDs, and step status, not passwords or staff contact information. Staff drafts remain in memory. Closing or refreshing mid-step may require entering unfinished staff details again; matching existing usernames are not recreated.

Progress schema 5 adds per-item form/template choices, alongside the clinical category keys introduced in schema 4. Schema 2/3/4 checkpoints and the previous `2026-09-30` dataset migrate to `2026-10-04` without losing clinic IDs or earlier work. New forms/templates are unselected, and completed clinics stay complete rather than silently importing replacements. Unfinished combined content resumes at questionnaires; checkpoints already at clinical forms, templates or completion stay there and mark Clinical data for later when migrating from schema 2/3. No uploaded files, credentials or patient responses are stored in checkpoints.

The numbering steps are now ordered patient then invoice. Older checkpoints remain at their saved step; completing or skipping either numbering step visits the other only if it has not already been completed/skipped. Reordering never silently loses a pending numbering step or forces an already configured one to be repeated.

One browser tab at a time can run setup, using Web Locks on a secure CARE origin. This is not a server-wide lock across computers. Use one administrator/browser for initial setup.

The CARE database is authoritative. Existing facilities block a new wizard except when matching saved progress. If creation succeeded but its response/checkpoint was lost, the recorded creation intent allows the administrator to confirm the matching facility and continue. No facility is adopted silently. Clearing browser storage loses resume context; this version does not provide server-side jobs or cross-browser resume.

If this browser remembers a clinic but CARE successfully reports no facilities, setup offers **Set up a new clinic** with confirmation. Check that you are connected to the intended deployment first, especially after a database reset or deployment change at the same URL. Resetting replaces only this plugin's checkpoint for the current CARE connection; it preserves your login, other browser storage, and all CARE database records, then rechecks CARE before restarting. This action is not offered for failed checks or when facilities exist. A hard refresh alone does not clear the saved checkpoint.

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
