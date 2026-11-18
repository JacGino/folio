// Planning checklists by project category (from the Planning Checklist sheets). Each item has a stable id, so ticks stay
// attached to the right line even if the wording is edited later. `title` items are the coloured blocks in the sheet.
export const CHECKLISTS = {
  'SAL100KW': {
    label: 'SAL100KW',
    sides: {
      residential: { label: 'Residential', items: [
        { id: 'sr1', text: 'Check in eLASIS whether the google coordinate of the premise have lot number. If yes, to provide land title' },
        { id: 'sr2', text: 'Applicant name must be inside land title. If land title have multiple landowners, to provide consent form for electricity supply.' },
        { id: 'sr3', text: 'Site photos, floor plan, single line diagram must be attached' },
        { id: 'sr4', text: 'Meter point location must be indicated in the site photos' },
        { id: 'sr5', title: 'For subsidy application', tone: 'blue', notes: [
          'Tariff should be domestic only (only individual house allowed)',
          'To check applicant IC that they have no active existing account in Customer Info Listing',
          'Gross income must be lower than RM5,000.00 (latest payslip must be endorsed by Ketua Kampung/Tuai Rumah/Ketua Kaum of that area)',
          'If applicant no payslip, to attach surat pengesahan bekerja from KK/TR of that area',
          'To really check on the lot/land title.'] },
        { id: 'sr6', title: 'For rumah sewa application', tone: 'purple', notes: [
          'Check site photos, usually its adjoining house consisting of few doors',
          'If rumah sewa, tariff should be commercial',
          'To charge 6% SST and not eligible for subsidy'] },
        { id: 'sr7', text: 'If the lot have land title, to ensure that the google coordinate of the premise match with the address and land title' },
        { id: 'sr8', text: 'To provide nearest meter number' },
        { id: 'sr9', text: 'Must provide Occupational Permit from BDA (only applicable to premises outside of Kampung/Resettlement boundary)' },
        { id: 'sr10', text: 'To apply for single phase meter, applied load must be lower than 5KVA. To apply for three phase meter, applied load must be higher than 5KVA' },
      ] },
      nonres: { label: 'Non-Residential', items: [
        { id: 'sn1', text: 'Meter point location must be indicated in the site photos' },
        { id: 'sn2', text: 'To apply for single phase meter, applied load must be lower than 5KVA. To apply for three phase meter, applied load must be higher than 5KVA' },
        { id: 'sn3', text: 'To ensure the tariff is commercial' },
        { id: 'sn4', text: 'Site photos, floor plan, single line diagram must be attached' },
        { id: 'sn5', text: 'To provide nearest meter number' },
        { id: 'sn6', title: 'Telco Tower', tone: 'orange', notes: ['SMA approval letter must be attached', 'Floor plan is Not Applicable for Tower jobs'] },
        { id: 'sn7', title: 'Temporary Supply', tone: 'green', notes: ['Must have Appendix B - Undertaking of Temporary Supply'] },
        { id: 'sn8', text: 'If the lot have land title, to ensure that the google coordinate of the premise match with the address and land title' },
        { id: 'sn9', text: 'Must provide Occupational Permit from BDA (only applicable to permanent application like shophouse, warehouse (NA to Tower/Temp supply)' },
      ] },
    },
  },
  'Substation Site Enquiry': {
    label: 'Subsite Checklist / Report', items: [
      { id: 'ss1', text: 'Check on the 1st submission, if the application is resubmission' },
      { id: 'ss2', text: 'Check on the nearby source of supply (tapping point) with SCADA loading & LT distance to last customer/meter point' },
      { id: 'ss3', text: 'Substation Feeder Loading' },
      { id: 'ss4', text: 'Project Details from eCX (Screenshot)', notes: ['Loading details in eCX against applied load'] },
      { id: 'ss5', text: 'Check against e-lasis' },
      { id: 'ss6', text: 'If subsite exceeding 15psp or transformer tails more than 50m, kindly request voltage drop calculation' },
      { id: 'ss7', text: 'If subsite is using existing site, please take photos and attached in the report' },
    ],
  },
  'Turnkey Stage 1': {
    label: 'Turnkey Stage 1', items: [
      { id: 't1a', text: 'Must have substation site letter (especially for housing, commercial shophouses/warehouses)' },
      { id: 't1b', text: 'Check cable route/ LT overheadline make sure not passing private land. Within service corridor (state land)' },
      { id: 't1c', text: 'The proposed HT/LT lines/underground cables routes do not cross in the middle of state land as the utility need to be relocated in the future. Use road reserve/ land boundary' },
      { id: 't1d', text: 'Checking on site plan', notes: ['please ensure the termination point is not on single pole', 'Stay is not inside customer house (check on the stay angle)', 'Site Plan must be endorsed by PEPC'] },
      { id: 't1e', text: 'Compare LOU to single line diagram. Ensure single line diagram sign by PEPC' },
      { id: 't1f', text: 'Check on the nearby source of supply (tapping point) with SCADA loading/Substation Feeder Loading' },
    ],
  },
  'Turnkey Stage 2': {
    label: 'Turnkey Stage 2', items: [
      { id: 't2a', text: 'Check Competent Person is not in SESCO annual contracts across region.' },
      { id: 't2b', text: 'Check Competent Person license is valid and not suspended' },
      { id: 't2c', text: 'Materials to follow APL. Approved product list. Always refer back to SEB website (not 1seb)' },
      { id: 't2d', text: 'Check quantity in LOU matching the BQ (materials supply under turnkey)' },
      { id: 't2e', text: 'Wayleave approvals must be attached (JKR, BDA, TM, LAKU, MUT & other relevant agencies)' },
      { id: 't2f', text: 'Controlled Items must follow latest Turnkey Price' },
    ],
  },
  'NEM Solar': {
    label: 'NEM applications', items: [
      { id: 'nm1', text: 'Check application under 1-phase (max. 12kWp) or 3-phase (max. 20kWp) and depends on existing meter' },
      { id: 'nm2', text: 'Check numbers of panels installed against AC01 form' },
      { id: 'nm3', text: "To get feeder loading between 11am - 3pm & transformer's capacity max. at 75%" },
      { id: 'nm4', text: 'Check installation of PV meter before cutout and must have isolator' },
      { id: 'nm5', text: 'Submission must be endorsed by SEDA' },
      { id: 'nm6', text: 'Installer must have Chargeman L4 Certificate' },
      { id: 'nm7', text: 'Must have signed/endorsed checklist from Retail' },
      { id: 'nm8', text: "Planning Engineer to update loading's file & to issue approval letter for scheme/design (CC bill for PV meter will be issued by Retail)" },
    ],
  },
  'Temporary Supply': {
    label: 'Temporary Supply', items: [
      { id: 'ts1', text: 'Must have Appendix B - Undertaking of Temporary Supply (Declaration form for non-commercial purposes)' },
    ],
  },
};

/** the checklists that apply to a project, in category order; SAL100KW uses the Residential or Non-Residential side */
export function checklistsFor(categories, side = 'residential') {
  const out = [];
  // Non Turnkey (NTK) and Upgrading of Supply (UOS) use the SAL100KW checklist, Residential or Non-Residential side
  // (one list when a project has more than one of them); it is labelled with the project's own category
  const SAME = { 'Non Turnkey': 'NTK', 'Upgrading of Supply': 'UOS' };
  const like = Object.keys(SAME).filter(c => categories.includes(c));
  const cats = like.length && !categories.includes('SAL100KW') ? [...categories, 'SAL100KW'] : categories;
  const ntkOnly = cats !== categories, aliasLabel = like.map(c => SAME[c]).join(' / ');
  for (const [cat, def] of Object.entries(CHECKLISTS)) {
    if (!cats.includes(cat)) continue;
    if (def.sides) { const s = def.sides[side] || def.sides.residential; out.push({ cat, label: (ntkOnly && cat === 'SAL100KW' ? aliasLabel : def.label) + ' · ' + s.label, items: s.items, sides: def.sides, side }); }
    else out.push({ cat, label: def.label, items: def.items });
  }
  return out;
}
/** Residential unless the project's premise type / tariff says otherwise (the switch in the checklist can change it) */
export function guessSide(premise = '', tariff = '') {
  const t = (premise + ' ' + tariff).toLowerCase();
  return /commercial|industr|shop|warehouse|office|tower|telco|non[- ]?res/.test(t) ? 'nonres' : 'residential';
}
