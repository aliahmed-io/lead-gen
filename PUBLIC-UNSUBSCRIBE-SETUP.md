# Public unsubscribe hosting

The dashboard stays password-free and restricted to 127.0.0.1:3000.

The separate `npm run optout` service binds to 127.0.0.1:3001. It exposes only signed unsubscribe GET/POST and a health endpoint. It uses the same working SQLite database and signing key as the sender. GET displays confirmation; POST persists suppression immediately. Admin APIs and dashboard pages are not served by this listener.

## Deployment still required
1. Start `npm run optout` with the same .env/data directory as LeadGen.
2. In an HTTPS tunnel provider such as Cloudflare Tunnel, route a dedicated public hostname to `http://127.0.0.1:3001`. Never route the public hostname to port 3000.
3. Configure DASHBOARD_URL to that HTTPS origin (without a path), then restart the dashboard, monitor and sending worker.
4. Run `npm run launch:check`. It requests a signed canary confirmation page without submitting an unsubscribe or sending email.
5. With an owned test recipient, verify the email's unsubscribe link from another network, submit it, and check that later outreach is blocked. Record the result in Launch checks.

## Availability
A tunnel does not keep the computer running. The PC, opt-out service and tunnel must stay online while recipients may use the links. If that cannot be maintained, deploy the service with the authoritative suppression store on an always-running host before outreach. A random temporary tunnel URL is unsuitable for links already sent to recipients. Mailbox hosting does not provide this endpoint automatically.

There is no public endpoint deployed by adding these files. No DNS record, domain registration or mailbox is changed by starting the listener.
