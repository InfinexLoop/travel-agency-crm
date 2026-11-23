# Zuri Holidays — Travel Business Management

A local travel agency CRM and customer portal demonstration by Infinex Loop. The SQLite database contains fictional travellers, suppliers, prices and trips. Every communication, payment, supplier confirmation and visa update stays within the demo.

## What you can demonstrate

- Capture enquiries from the simulators, qualify them in the unified inbox, and manage customer and traveller profiles.
- Build tour packages and versioned quotations, then convert accepted quotes into bookings with supplier and operations tasks.
- Record simulated payments, track balances, and download demo quotations, invoices, receipts, itineraries, and vouchers.
- Review documents and visa statuses, accept quotations in the customer portal, and monitor booking and finance reports in the owner workspace.

## Start locally

Use Node.js 24.14+ and npm. Run the commands from this directory.

```sh
npm install
npm run db:setup
npm run dev
```

Open [the staff workspace](http://127.0.0.1:3000) or [the customer portal](http://127.0.0.1:3000/portal). Both spaces can be open in separate tabs in the same browser. For a production-mode local run, stop the dev server, then use `npm run build` and `npm start`.

Setup applies the SQL migrations and loads the presentation baseline once. SQLite and private uploads live under `data/`. Normal startup and subsequent setup runs preserve existing work. `CRM_DATA_DIR` can point to a separate database and uploads directory. Values set in the shell are shared by the setup and the server. See [.env.example](.env.example).

To reset the presentation, stop the server and run `npm run db:reset -- --confirm`, then start the server. This renames the previous data directory to a timestamped backup before seeding again.

## Demo accounts

The local and public demos can sign in with one click using the approved personas. The Owner / Admin button opens a separate demo owner preview. Staff and workflow administration require a private administrator sign-in. The common password below is for disposable local password tests. Hosted password sign-in uses separately provisioned credentials.

| Role | Email |
| --- | --- |
| Owner / Admin | `owner@zuri.demo` |
| Sales Manager | `manager@zuri.demo` |
| Sales Executive | `sales@zuri.demo` |
| Sales Executive (Ravi) | `sales2@zuri.demo` |
| Operations Executive | `operations@zuri.demo` |
| Finance Executive | `finance@zuri.demo` |
| Customer (Ananya Rao) | `customer@zuri.demo` |
| Customer (Rohan Mehta) | `customer2@zuri.demo` |
| Customer (Meera Iyer) | `customer3@zuri.demo` |

Use Owner / Admin for the full walkthrough. The individual staff roles demonstrate server-enforced access. Sales executives only see leads assigned to their account. From a sent quote, use **Create demo portal link** and **Open customer portal** to open a one-time, 10-minute link for the actual customer you just created. It establishes a separate customer session and leaves the staff tab signed in.

## Run the simulators

- **Website enquiry** — Go to **Simulation center → Website enquiry**. Select an example traveller or enter your own synthetic details. Submit the form and use **View CRM lead**. Submissions, acknowledgements, sales assignments and follow-ups are persisted.
- **WhatsApp chat** — Select **WhatsApp chat**, choose **Dubai family holiday**, and start the conversation. Type replies or select each suggested reply and send it. The right pane shows the collected trip requirements and automation activity. After qualification, ask for a quote to trigger staff handoff. Open the CRM lead or the staff inbox from the same page.
- **Instagram DM** — Select **Instagram DM**, enter a synthetic handle such as `@demo.traveller.nov`, select a scenario, then start and send the first message. The handle can create a prospect before a phone number is known. Continue through the prompts to update or link their contact details.
- **Phone enquiry** — Use **Simulation center → Phone enquiry** or **Enquiries → Log phone enquiry**. Enter the caller, travel brief, notes and follow-up. The call is stored as a manual interaction.

Use a different fictional phone number/email or Instagram handle to show a brand-new enquiry on subsequent walkthroughs. Reusing a contact and destination may link to an open enquiry. **Session history** reopens previous chat sessions. **Run due automations** in the overview processes due follow-ups, document reminders, departure reminders and expired quotations.

## 10-minute client walkthrough

| Time | Show |
| --- | --- |
| 0:00–1:00 | Owner overview and the distinction between booking value, confirmed revenue and recorded cash. |
| 1:00–3:00 | Dubai family WhatsApp chat. Send the suggested replies and follow the CRM activity as the lead is qualified. |
| 3:00–5:00 | Open the lead, create a quotation from its suggested package, verify the itinerary and download the PDF. Approve and send the simulated quote. |
| 5:00–7:00 | Open the one-time portal link, accept the quotation, convert it in the staff tab and record a simulated advance in the portal. |
| 7:00–9:00 | Show the new tasks, request a supplier service and record a demo confirmation. Confirm the booking, issue a demo invoice and open the voucher or receipt. |
| 9:00–10:00 | Refresh reports and show the new booking and collections. For the final travel stages, open a seeded **Documents Ready** or **Completed** booking. |

To finish the new booking live, use **Documents Ready → Travel In Progress → Completed** and submit feedback from the portal. Review any open document requests and visa cases before moving to **Documents Ready**.

## Verify

```sh
npm run db:migrate
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts its own local server on port 3100 with a separate temporary database. To use an existing Chrome installation on macOS, set `PLAYWRIGHT_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` when running the test command.

Managers and admins grant sales access from the customer profile using **Assign customer access**. Sales staff receive access to customers they create. Sales staff need both customer access and ownership to work on an enquiry. Managers can transfer enquiry ownership separately. Changing or removing an existing customer assignment revokes that customer’s portal sessions and pending portal links. When upgrading an existing database, managers review and explicitly assign existing customers. Migration 006 clears existing customer portal sessions and pending portal links so customers sign in again.

## Financial definitions

- Booking value covers non-cancelled bookings. Confirmed booking revenue includes Confirmed, Documents Ready, Travel In Progress and Completed.
- Recorded net cash sums successful simulated payments less recorded refunds. Pending and failed transactions have no balance effect. Cancelled bookings have no outstanding customer amount, and their remaining payment/refund history is retained.
- Active supplier commitments less settlements produce supplier payables. Estimated gross profit uses confirmed revenue less the higher of each booking’s quoted cost and active supplier commitments. The chart groups these figures by booking creation month.
- Finance can resolve pending transactions and record audited pricing changes while a booking is open. The accepted quotation figures remain in their original revision.
- All money is stored in integer paise with INR reporting. Quote tax is a configurable amount in each quotation. The reporting and booking calendar use Asia/Kolkata.

## Implementation and boundaries

Next.js App Router and React, Node’s native SQLite API, Zod, Recharts, pdf-lib, Vitest and Playwright. SQL migrations are in `db/`, shared rules in `domains/`, database operations and authorization in `server/`, and the workspace UI in `components/`. There are no required third-party credentials or background services. The website ingestion adapter is local, authenticated and restricted to the demo.

The public Zuri Holidays site, WhatsApp, Instagram, email, call, payment, supplier and visa systems are outside this local demo. Payment and ticketing artifacts are synthetic. The stored finance records and PDFs are for demonstration purposes. Staff can manually run due workflows. Set `CRM_AUTO_DUE=1` to process them every minute while an authorized staff tab is visible. The app uses no background scheduler or native message delivery.

Dubai Marina photo by AJ Ahamad, [Pexels](https://www.pexels.com/photo/stunning-twilight-view-of-dubai-marina-skyline-30068864/).

## Cloudflare Workers demo

The local Next.js and SQLite commands above still work. After switching to the deployment branch, run `npm run db:setup` once to apply the additive migration to any existing local database.

The Cloudflare configuration uses vinext with no application cache or image optimizer. `DB` binds the demo's D1 database and `FILES` binds its private R2 bucket. The Worker uses the same business rules as the local server. It validates a revision before committing an atomic D1 batch and retries when another application write wins the race. R2 documents are served through the CRM's authorized download route.

### Test the Cloudflare build locally

```sh
npm ci
npx vinext check
npm run typecheck
npm run test
npm run build
npm run build:vinext
npx playwright install chromium
npm run test:e2e
npm run test:e2e:worker
```

The two journey commands explicitly select disposable SQLite or isolated workerd with local D1 and R2. Both start a fresh loopback server and reject hosted URLs, credentials, and an existing listener. The Worker suite enables the local test binding for its disposable build.

Run `npm run test:smoke:hosted` against the fixed demo Worker. It checks the public login screens, all nine sign-ins and sign-outs on desktop and mobile, and authentication on CRM data, exports and documents. It performs no CRM record mutations. Optionally supply an existing `CRM_SMOKE_STAFF_SESSION` to check an authorized staff session with a read-only data request and redirects disabled.

### Initialize the hosted data

Use an authorized Cloudflare account with the app's named resources. The D1 UUID is recorded in `cloudflare/resources.ts`. Run migrations explicitly before deploying. These commands apply only unapplied migrations and generate seed SQL from a fresh temporary database with **synthetic records only**.

```sh
npx cf d1 migrations apply a3f9036d-3506-4dde-bd60-3a5bf6036a18 --dir db
mkdir -p .cloudflare
npm run db:seed:cloudflare -- .cloudflare/synthetic-seed.json
npx cf d1 query a3f9036d-3506-4dde-bd60-3a5bf6036a18 --batch @.cloudflare/synthetic-seed.json
```

The seed is a guarded batch that skips a previously seeded database and rejects an unseeded database containing customer or user records. Set `CRM_SEED_DATE=YYYY-MM-DD` to reproduce the calendar dates of the seed. The Worker never seeds or resets itself. The reset command is for local SQLite only. Before exposing a newly seeded Worker, set separate passwords for its accounts using the application's password hashing and revoke existing sessions for rotated accounts.

### Deploy the public demo

Use `CRM_PUBLIC_DEMO=1 npm run deploy:vinext` with `CRM_LOCAL_TEST` unset to enable quick login on the dedicated, synthetic-only D1 database. Keep real contacts, travel data and files out of this shared demo. Keep preview URLs disabled and the R2 bucket private. The Worker serves the CRM sign-in screens directly. CRM sessions and roles govern access to records and private downloads. Uploads to the shared R2 bucket require a password sign-in or a portal link issued by password-authenticated staff. Apply pending migrations first and explicitly assign selected synthetic customers to each sales persona on existing databases.
