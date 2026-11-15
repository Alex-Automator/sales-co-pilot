// Demo data for revision 1. People and client companies are invented.
const STAGES = [
  ['new', '#9AA1A6'], ['contacted', '#5B7FA6'], ['replied', '#6C5CE7'], ['meeting', '#E0A100'],
  ['proposal', '#F07F1A'], ['negotiation', '#7CB518'], ['signed', '#12995B'], ['lost', '#C8473F'],
];
const ZONES = ['company', 'direction', 'audience', 'topic'];
const TYPES = ['contact', 'company', 'campaign', 'task'];
const TYPE_ICONS = {
  contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  company: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2"/>',
  campaign: '<path d="M3 10v4h3l7 4V6l-7 4z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
};
function defaultLegend() {
  return [
    { id: 'l1', color: '#E4572E', label: 'Hot' }, { id: 'l2', color: '#E0A100', label: 'Warm' },
    { id: 'l3', color: '#5B7FA6', label: 'Cold' }, { id: 'l4', color: '#12995B', label: 'Partner' },
  ];
}
function defaultUser() { return { name: 'Demo Operator', email: 'operator@example.com', photo: '' }; }
const VERSION = '0.1';
const WIDGETS = ['analytics', 'calendar', 'important', 'mail'];
const DOC_TYPES = ['offer', 'framework', 'addendum', 'invoice'];
const DOC_STAGES = ['proposal', 'negotiation', 'signed'];
const UI_ICONS = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', ring: '<circle cx="12" cy="12" r="6"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/>',
};
const SENIORITY = ['Owner / C-level', 'VP', 'Director', 'Manager'];
// Default grey outline pictures for parameters without an image.
const ICONS = {
  company: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2"/>',
  direction: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  audience: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  topic: '<path d="M3 11V4a1 1 0 0 1 1-1h7l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
};

function dayOffset(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Empty state for the real program: everything comes from the server after sign-in.
function emptyState() {
  return { v: 2, lang: 'en', view: 'vector', active: '', draft: {}, vectors: [], cards: [], docs: [], gdocs: [],
    zones: { company: [], direction: [], audience: [], topic: [] }, legend: defaultLegend(),
    user: { name: '', email: '', photo: '' }, widgets: WIDGETS.slice(), guideSeen: false };
}
function demoState() {
  const V = { company: 'c1', direction: 'd1', audience: 'a1', topic: 't1' };
  const card = (o) => Object.assign({
    id: 'k' + Math.random().toString(36).slice(2, 9), type: 'contact', stage: 'new', title: '', vid: 'v1',
    vec: { ...V }, f: {}, next: { text: '', date: '' }, awaiting: false,
    auto: { follow: false, reply: false, notify: true, draft: true }, notes: '', photo: '',
  }, o);
  return {
    v: 2, legend: defaultLegend(), user: defaultUser(), widgets: WIDGETS.slice(), gdocs: [], guideSeen: false, lang: 'en', view: 'vector', active: 'v1', draft: {},
    vectors: [
      { id: 'v1', company: 'c1', direction: 'd1', audience: 'a1', topic: 't1', owner: 'me' },
      { id: 'v2', company: 'c3', direction: 'd4', audience: 'a3', topic: 't3', owner: 'me' },
    ],
    zones: {
      company: [
        { id: 'c1', name: 'ODDIN', img: '', s: { website: 'https://oddin.design', signature: 'ODDIN',
          mailboxes: [{ email: 'sales@oddin.com', primary: true }, { email: 'sales@oddin.net', primary: false }] } },
        { id: 'c2', name: 'INDUSTRIT', img: '', s: { website: 'https://www.industrit.com', signature: 'INDUSTRIT',
          mailboxes: [{ email: 'sales@industrit.com', primary: true }, { email: 'sales@industrit.net', primary: false }] } },
        { id: 'c3', name: 'BidPlan Partner', img: '', s: { website: 'https://bidplanpartner.com', signature: 'BidPlan Partner',
          mailboxes: [{ email: 'sales@bidplanpartner.com', primary: true }, { email: 'sales@bidplanpartner.net', primary: false }] } },
      ],
      direction: [
        { id: 'd1', name: '3D / 4D simulation of construction', company: 'c1', img: '', s: { desc: '',
          criteria: ['Builds data centers or large industrial halls', 'Publishes project cases on the website', 'Works on tenders'] } },
        { id: 'd2', name: 'Structural design: steel, concrete, timber', company: 'c1', img: '', s: { desc: '', criteria: [] } },
        { id: 'd5', name: 'Tender preparation', company: 'c1', img: '', s: { desc: '', criteria: [] } },
        { id: 'd3', name: 'Industrial projects', company: 'c2', img: '', s: { desc: '', criteria: [] } },
        { id: 'd4', name: 'Construction Bids', company: 'c3', img: '', s: { desc: '', criteria: [] } },
      ],
      audience: [
        { id: 'a1', name: 'CEO / Owner', img: '', s: { titles: 'CEO, Owner, Founder, President', seniority: ['Owner / C-level'], role: 'decision', tone: 'formal' } },
        { id: 'a2', name: 'Project Director', img: '', s: { titles: 'Project Director, Head of Projects', seniority: ['Director'], role: 'decision', tone: 'neutral' } },
        { id: 'a3', name: 'Preconstruction / BD', img: '', s: { titles: 'Preconstruction, Business Development, Estimating', seniority: ['VP', 'Director', 'Manager'], role: 'influence', tone: 'neutral' } },
      ],
      topic: [
        { id: 't1', name: 'Data center builders', img: '', s: { hook: 'A data center project the company has built or is tendering for', keywords: 'data center, data centre, hyperscale, MW', proof: '' } },
        { id: 't2', name: 'MEP installation contractors', img: '', s: { hook: '', keywords: '', proof: '' } },
        { id: 't3', name: 'General contractors US', img: '', s: { hook: '', keywords: '', proof: '' } },
      ],
    },
    cards: [
      card({ type: 'campaign', title: 'US data center GCs · directors',
        f: { sheetUrl: '', dailyCap: '8', variantA: 'Hi {firstName}, we build 4D construction simulations…', variantB: '', variantC: '' },
        auto: { follow: true, reply: false, notify: true, draft: true } }),
      card({ type: 'company', title: 'Hartwell Builders Inc.', color: 'l3', f: { website: 'hartwell.example', country: 'United States' } }),
      card({ type: 'task', title: 'Find MEP contractors, Sweden', next: { text: 'Build the list', date: dayOffset(2) } }),
      card({ stage: 'contacted', title: 'Erik Lindqvist', f: { jobTitle: 'CEO', company: 'Nordbygg AB', email: 'erik@nordbygg.example' },
        next: { text: 'Follow-up', date: dayOffset(0) } }),
      card({ stage: 'contacted', title: 'Maria Kowalczyk', f: { jobTitle: 'Project Director', company: 'Vistal Group' } }),
      card({ stage: 'contacted', title: 'James Okafor', f: { jobTitle: 'Owner', company: 'Okafor Mechanical' },
        auto: { follow: true, reply: false, notify: true, draft: false } }),
      card({ stage: 'replied', title: 'Anna Bergström', awaiting: true, color: 'l1',
        f: { jobTitle: 'COO', company: 'Fjordtek AS', email: 'anna@fjordtek.example', phone: '+47 000 00 000' },
        next: { text: 'Reply with case study', date: dayOffset(0) },
        notes: 'Tendering a data center in Q1. Asked for a relevant case and rough pricing.' }),
      card({ stage: 'replied', title: 'Tom Reilly', awaiting: true, f: { jobTitle: 'VP Ops', company: 'Calder Construction' } }),
      card({ stage: 'meeting', title: 'Lars Holm', color: 'l2', f: { jobTitle: 'CEO', company: 'Holm & Dahl' }, next: { text: 'Call', date: dayOffset(3) } }),
      card({ stage: 'proposal', title: 'Sophie Tremblay', f: { jobTitle: 'Director', company: 'Laurentide Build' }, next: { text: 'Send proposal', date: dayOffset(6) } }),
      card({ stage: 'meeting', title: 'Greta Solberg', f: { jobTitle: 'Owner', company: 'Solberg Entreprenør' }, next: { text: 'Intro call', date: dayOffset(8) } }),
      card({ stage: 'negotiation', title: 'David Chen', f: { jobTitle: 'Owner', company: 'Pacific Core DC' },
        next: { text: 'Send revised scope', date: dayOffset(-2) } }),
      card({ stage: 'signed', title: 'Ingrid Nyström', f: { jobTitle: 'CEO', company: 'Nystrom Montage' } }),
      card({ stage: 'contacted', title: 'Paul Weber', vid: 'v2', vec: { company: 'c3', direction: 'd4', audience: 'a3', topic: 't3' },
        f: { jobTitle: 'Preconstruction Manager', company: 'Weber & Sons' }, next: { text: 'Follow-up', date: dayOffset(-1) } }),
      card({ stage: 'replied', title: 'Dana Ortiz', awaiting: true, vid: 'v2', vec: { company: 'c3', direction: 'd4', audience: 'a3', topic: 't3' },
        f: { jobTitle: 'Director of Business Development', company: 'Ortiz Construction' } }),
    ],
    docs: [
      { id: 'x1', title: 'Data center case study', url: '', priority: 1, company: 'c1' },
      { id: 'x2', title: 'Service one-pager', url: '', priority: 2, company: 'c1' },
    ],
  };
}
