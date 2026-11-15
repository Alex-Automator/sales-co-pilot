# VECTOR SCP — Sales-co-pilot

Web app for finding B2B clients, contacting them and tracking how effective those contacts are.
Built for ODDIN, INDUSTRIT and BidPlan Partner.

**Status: version 0.1** — the interface on demo data. Nothing is sent anywhere; data is saved only in the browser.

## Try it

Open `index.html` in a browser. No install or build step.

## What works in revision 1

- Vector screen: Company → Direction → Audience → Topic, with counters of replies waiting and tasks due
- "New vector" in four steps; add your own items in every zone
- Funnel board: drag cards between stages, quick add, search, filters
- Four card types: Contact, Company, Campaign, Task; clone, convert, delete
- Card details: next step and date, autopilot switches, notes, photo pasted with Ctrl+V
- Analytics by zone; Database → Library of documents with priorities
- English / Ukrainian interface

## Not yet

Sign-in, shared database, Google Sheets, Gmail sending, mailbox health checks, Claude and ChatGPT, document generators.
See [docs/SPEC.md](docs/SPEC.md) for the agreed scope and stages.

## Structure

```
index.html      page shell
css/app.css     styles (graphite and cool greys, terracotta accent)
js/i18n.js      interface texts EN / UA
js/data.js      stages, card types, demo data
js/app.js       screens and actions
scripts/bundle.py   builds one self-contained preview.html
docs/SPEC.md    agreed specification
```
