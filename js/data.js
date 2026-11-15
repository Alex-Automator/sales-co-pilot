// Demo data for revision 1. People and client companies are invented.
const STAGES = [
  ['new', '#9AA1A6'], ['contacted', '#5B7FA6'], ['replied', '#6C5CE7'], ['meeting', '#E0A100'],
  ['proposal', '#F07F1A'], ['negotiation', '#7CB518'], ['signed', '#12995B'], ['lost', '#C8473F'],
];
const ZONES = ['company', 'direction', 'audience', 'topic'];
const TYPES = ['contact', 'company', 'campaign', 'task'];

function dayOffset(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function demoState() {
  const V = { company: 'c1', direction: 'd1', audience: 'a1', topic: 't1' };
  const card = (o) => Object.assign({
    id: 'k' + Math.random().toString(36).slice(2, 9), type: 'contact', stage: 'new', title: '',
    vec: { ...V }, f: {}, next: { text: '', date: '' }, awaiting: false,
    auto: { follow: false, reply: false, notify: true, draft: true }, notes: '', photo: '',
  }, o);
  return {
    v: 1, lang: 'en', view: 'vector', sel: { ...V },
    zones: {
      company: [
        { id: 'c1', name: 'ODDIN', mailbox: 'sales@oddin.net', signature: 'ODDIN' },
        { id: 'c2', name: 'INDUSTRIT', mailbox: 'sales@industrit.net', signature: 'INDUSTRIT' },
        { id: 'c3', name: 'BidPlan Partner', mailbox: 'sales@bidplanpartner.net', signature: 'BidPlan Partner' },
      ],
      direction: [
        { id: 'd1', name: '3D Simulation of construction', company: 'c1' },
        { id: 'd2', name: 'Design & Engineering', company: 'c1' },
        { id: 'd3', name: 'Industrial projects', company: 'c2' },
        { id: 'd4', name: 'Construction Bids', company: 'c3' },
      ],
      audience: [
        { id: 'a1', name: 'CEO / Owner' }, { id: 'a2', name: 'Project Director' },
        { id: 'a3', name: 'Preconstruction / BD' },
      ],
      topic: [
        { id: 't1', name: 'Data center builders' }, { id: 't2', name: 'MEP installation contractors' },
        { id: 't3', name: 'General contractors US' },
      ],
    },
    cards: [
      card({ type: 'campaign', title: 'US data center GCs · directors',
        f: { sheetUrl: '', dailyCap: '8', variantA: 'Hi {firstName}, we build 4D construction simulations…', variantB: '', variantC: '' },
        auto: { follow: true, reply: false, notify: true, draft: true } }),
      card({ type: 'company', title: 'Hartwell Builders Inc.', f: { website: 'hartwell.example', country: 'United States' } }),
      card({ type: 'task', title: 'Find MEP contractors, Sweden', next: { text: 'Build the list', date: dayOffset(2) } }),
      card({ stage: 'contacted', title: 'Erik Lindqvist', f: { jobTitle: 'CEO', company: 'Nordbygg AB', email: 'erik@nordbygg.example' },
        next: { text: 'Follow-up', date: dayOffset(0) } }),
      card({ stage: 'contacted', title: 'Maria Kowalczyk', f: { jobTitle: 'Project Director', company: 'Vistal Group' } }),
      card({ stage: 'contacted', title: 'James Okafor', f: { jobTitle: 'Owner', company: 'Okafor Mechanical' },
        auto: { follow: true, reply: false, notify: true, draft: false } }),
      card({ stage: 'replied', title: 'Anna Bergström', awaiting: true,
        f: { jobTitle: 'COO', company: 'Fjordtek AS', email: 'anna@fjordtek.example', phone: '+47 000 00 000' },
        next: { text: 'Reply with case study', date: dayOffset(0) },
        notes: 'Tendering a data center in Q1. Asked for a relevant case and rough pricing.' }),
      card({ stage: 'replied', title: 'Tom Reilly', awaiting: true, f: { jobTitle: 'VP Ops', company: 'Calder Construction' } }),
      card({ stage: 'meeting', title: 'Lars Holm', f: { jobTitle: 'CEO', company: 'Holm & Dahl' }, next: { text: 'Call', date: dayOffset(3) } }),
      card({ stage: 'proposal', title: 'Sophie Tremblay', f: { jobTitle: 'Director', company: 'Laurentide Build' } }),
      card({ stage: 'negotiation', title: 'David Chen', f: { jobTitle: 'Owner', company: 'Pacific Core DC' },
        next: { text: 'Send revised scope', date: dayOffset(-2) } }),
      card({ stage: 'signed', title: 'Ingrid Nyström', f: { jobTitle: 'CEO', company: 'Nystrom Montage' } }),
      card({ stage: 'contacted', title: 'Paul Weber', vec: { company: 'c3', direction: 'd4', audience: 'a3', topic: 't3' },
        f: { jobTitle: 'Preconstruction Manager', company: 'Weber & Sons' }, next: { text: 'Follow-up', date: dayOffset(-1) } }),
      card({ stage: 'replied', title: 'Dana Ortiz', awaiting: true, vec: { company: 'c3', direction: 'd4', audience: 'a3', topic: 't3' },
        f: { jobTitle: 'Director of Business Development', company: 'Ortiz Construction' } }),
    ],
    docs: [
      { id: 'x1', title: 'Data center case study', url: '', priority: 1, company: 'c1' },
      { id: 'x2', title: 'Service one-pager', url: '', priority: 2, company: 'c1' },
    ],
  };
}
