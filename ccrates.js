// Folio v2 — Connection Charge rate catalogue, transcribed from
// SESCO Connection Charges Guidelines 2019, Rev 1.0 / May 2019 (Section 4 Schedule of Rates, Section 3.1.14, Table 5.1).
// Descriptions, units and rates are as printed. Rates are exclusive of Service Tax and "subject to review" (Section 4):
// they are reference values from this guideline version, not verified current tariffs.
// Each catalogue is versioned; saved calculations keep their own copy of every rate they used.

export const GUIDELINE = { id: 'CCG2019-R1.0', name: 'Connection Charges Guidelines 2019', rev: 'Rev 1.0 / May 2019', status: 'Reference only — not verified as currently effective' };

// component keys used by the methodology engine
export const COMPONENTS = {
  meter: 'Meter Fee', perhouse: 'Per House Fee', lt: 'Low Tension Cost', ltstreet: 'Low Tension Cost for Street Lighting', ht: 'High Tension Extension Cost',
  htexcess: 'High Tension Cost in excess of 1000m', substation: 'Substation Cost', scc: 'Substation Capacity Charge', lcc: 'Line Capacity Charge',
  admin: 'Administration Fee', testing: 'Testing Fee', controlled: 'Controlled Items', engfee: 'Engineering Fee',
};

const R = (code, table, page, desc, unit, rate, extra = {}) => ({ code, table, page, desc, unit, rate, version: GUIDELINE.id, ...extra });

// ---------- Table 4.1 Meter Fees (page 10) ----------
const T41 = [
  R('MF-01', '4.1', 10, 'Single Phase whole current kWh meter (Normal)', 'each', 150.00, { phase: 1 }),
  R('MF-02', '4.1', 10, 'Single Phase whole current kWh meter (Discounted)', 'each', 70.00, { phase: 1, cond: 'Discounted meter fee applies only to the customers in Section 3.1.17(a): residential houses, longhouses, Government-assisted, low cost / low cost plus and Resettlement Scheme units with applied load not exceeding 2kVA per unit (Section 3.1.17(c)).', contributionOnly: true }),
  R('MF-03', '4.1', 10, 'Three Phase whole current kWh meter', 'each', 500.00, { phase: 3 }),
  R('MF-04', '4.1', 10, 'Three Phase CT-operated kWh/kVarh meter for low voltage applications', 'each', 1570.00, { phase: 3 }),
  R('MF-05', '4.1', 10, 'Three Phase PT/CT-operated kWh/kVarh + Maximum Demand meter (Class 0.5s) for high voltage abd/or applications requiring summation function where the applied load in <5,000kVA', 'each', 2060.00, { phase: 3, cond: 'Applied load below 5,000kVA.' }),
  R('MF-06', '4.1', 10, 'Three Phase PT/CT-operated kWh/kVarh + Maximum Demand meter (Class 0.5s) for high voltage and/or applications requiring summation function where the applied load in =>5,000kVA', 'each', 8000.00, { phase: 3, cond: 'Applied load 5,000kVA and above.' }),
  R('MF-07', '4.1', 10, 'Low Voltage current transformers (CTs) : 200/5, 400/5, 800/5, 1200/5, 1600/5 & 2000/5 (set of 3)', 'set', 300.00),
  R('MF-08', '4.1', 10, 'Test terminal block for CT & PT/CT installation, complete with voltage fuse carriers', 'each', 300.00),
].map(r => ({ ...r, comp: 'meter' }));

// ---------- Table 4.2 per House Fee (page 10) — Category 2 only (Section 3.1.10) ----------
const T42 = [
  R('PH-01', '4.2', 10, 'Detached House (1-phase supply)', 'each', 11100.00, { phase: 1, mal: 'detached' }),
  R('PH-02', '4.2', 10, 'Semi-Detached House (1-phase supply)', 'each', 8800.00, { phase: 1, mal: 'semi' }),
  R('PH-03', '4.2', 10, 'Terrace/Quadrant House (1-phase Supply)', 'each', 6700.00, { phase: 1, mal: 'terrace' }),
  R('PH-04', '4.2', 10, 'Detached House (3-phase Supply)', 'each', 14500.00, { phase: 3, mal: 'detached' }),
  R('PH-05', '4.2', 10, 'Semi-Detached House (3-phase Supply)', 'each', 11900.00, { phase: 3, mal: 'semi' }),
  R('PH-06', '4.2', 10, 'Terrace/Quadrant House (3-phase Supply)', 'each', 9700.00, { phase: 3, mal: 'terrace' }),
  R('PH-07', '4.2', 10, 'Low Cost Plus Housing Terrace/Quadrant/Semi-Detached/Detached (1-phase supply, Service Cable Scheme)', 'each', 5300.00, { phase: 1, mal: 'lowcostplus' }),
  R('PH-08', '4.2', 10, 'Low Cost Plus Walk-Up Flat for based design of centralised metering (1-phase supply)', 'each', 700.00, { phase: 1, mal: 'lowcostplus' }),
  R('PH-09', '4.2', 10, 'Low Cost / Low Cost Plus Housing Terrace/Quadrant/Semi-Detached/Detached (1-phase supply, Service Line Scheme)', 'each', 1500.00, { phase: 1, mal: null, cond: 'Low Cost or Low Cost Plus — choose the matching premise type for the capacity basis.' }),
  R('PH-10', '4.2', 10, 'Low Cost Walk-Up Flat for based design of centralised metering (1-phase supply)', 'each', 600.00, { phase: 1, mal: 'lowcost' }),
  R('PH-11', '4.2', 10, 'Shophouse Unit 1 storey or 2-storey (1-phase or 3-phase supply)', 'each', 8000.00, { phase: 0, mal: null }),
  R('PH-12', '4.2', 10, 'Shophouse Unit 3 storey or 4-storey (1-phase or 3-phase supply)', 'each', 12500.00, { phase: 0, mal: null }),
].map(r => ({ ...r, comp: 'perhouse' }));

// ---------- Table 4.3 Low Tension Cost, Part 1 (page 11) ----------
const T43a = [
  R('LT-01', '4.3 (Part 1)', 11, 'Low Voltage CT Metering Cabinet (400A)', 'each', 5400.00),
  R('LT-02', '4.3 (Part 1)', 11, 'Low Voltage CT Metering Cabinet (800A)', 'each', 5700.00),
  R('LT-03', '4.3 (Part 1)', 11, 'Low Voltage CT Metering Cabinet (2000A)', 'each', 9400.00),
  R('LT-04', '4.3 (Part 1)', 11, '1-phase service line', 'each', 1350.00),
  R('LT-05', '4.3 (Part 1)', 11, '1-phase service line Twin-twisted', 'each', 1000.00),
  R('LT-06', '4.3 (Part 1)', 11, '3-phase service line', 'each', 2100.00),
  R('LT-07', '4.3 (Part 1)', 11, 'Uprate service line from 1-phase/2-phase to 3-phase', 'each', 900.00),
  R('LT-08', '4.3 (Part 1)', 11, 'Belian riser and steel bracket for service line', 'each', 430.00),
  R('LT-09', '4.3 (Part 1)', 11, '1-phase service cable 2C 25mmsq Al, 2C 16mmsq Cu (first  30m)', 'each', 2500.00, { pair: 'LT-10', first: 30 }),
  R('LT-10', '4.3 (Part 1)', 11, '1-phase service cable 2C 25mmsq Al, 2C 16mmsq Cu (per m beyond 30m)', 'meter', 75.00, { beyondOf: 'LT-09' }),
  R('LT-11', '4.3 (Part 1)', 11, '3-phase service cable 4C 25mmsq Al, 16mmsq Cu (first 30m)', 'each', 4800.00, { pair: 'LT-12', first: 30 }),
  R('LT-12', '4.3 (Part 1)', 11, '3-phase service cable 4C 25mmsq Al, 16mmsq Cu (per m beyond 30m)', 'meter', 130.00, { beyondOf: 'LT-11' }),
  R('LT-13', '4.3 (Part 1)', 11, '3-phase service cable 4C 70mmsq Al or 4C 35mmsq Cu', 'meter (circuit length)', 150.00),
  R('LT-14', '4.3 (Part 1)', 11, '3-phase service cable 4C 150mmsq Al', 'meter (circuit length)', 170.00),
  R('LT-15', '4.3 (Part 1)', 11, '3-phase service cable 4C 300mmsq Al', 'meter (circuit length)', 185.00),
  R('LT-16', '4.3 (Part 1)', 11, '3-phase service cable 4 x 1C 500mmsq Al', 'meter (circuit length)', 330.00),
  R('LT-17', '4.3 (Part 1)', 11, '3-phase service cable 7 x 1C 500mmsq Al', 'meter (circuit length)', 565.00),
  R('LT-18', '4.3 (Part 1)', 11, '3-phase service cable 11 x 1C 500mmsq Al', 'meter (circuit length)', 895.00),
  R('LT-19', '4.3 (Part 1)', 11, '3-phase overhead line + switch wire (5-wire) pole span', 'per span with pole', 3805.00),
  R('LT-20', '4.3 (Part 1)', 11, '3-phase overhead line + switch wire (5-wire) span', 'per span without pole', 2385.00),
  R('LT-21', '4.3 (Part 1)', 11, '3-phase overhead line (4-wire) pole span', 'per span with pole', 3480.00),
  R('LT-22', '4.3 (Part 1)', 11, '3-phase overhead line (4-wire) span', 'per span without pole', 2060.00),
  R('LT-23', '4.3 (Part 1)', 11, '1-phase overhead line (2-wire) pole span', 'per span with pole', 2570.00),
  R('LT-24', '4.3 (Part 1)', 11, '1-phase overhead line (2-wire) span', 'per span without pole', 1140.00),
  R('LT-25', '4.3 (Part 1)', 11, 'Additional 1-wire overhead line', 'per span without pole', 820.00),
  R('LT-26', '4.3 (Part 1)', 11, '1-phase overhead line (Twin-Twisted) pole span', 'per span with pole', 2530.00),
  R('LT-27', '4.3 (Part 1)', 11, '1-phase overhead line (Twin-Twisted) span', 'per span without pole', 1130.00),
  R('LT-28', '4.3 (Part 1)', 11, 'Low Tension Single Pole only', 'each', 2100.00),
  R('LT-29', '4.3 (Part 1)', 11, 'Low Tension H-Pole only', 'each', 3800.00),
  R('LT-30', '4.3 (Part 1)', 11, '3-phase underground cable 4C 70mmsq Al or 4C 35mmsq Cu', 'meter', 150.00),
  R('LT-31', '4.3 (Part 1)', 11, '3-phase underground cable 4C 150mmsq Al', 'meter', 170.00),
  R('LT-32', '4.3 (Part 1)', 11, '3-phase underground cable 4C 300mmsq Al', 'meter', 185.00),
  R('LT-33', '4.3 (Part 1)', 11, 'Category 1 applicants for work scope involving single phase service line with/without belian riser only, where built up area not exceeding 755sq-ft (based on the size of Spektra Medium or any such requirements as declared by the Authorities) and with load not exceeding 2kVA per unit', 'per house', 500.00, { cats: [1], cond: 'Category 1 only; single phase service line with/without belian riser only; built-up area ≤ 755 sq ft; load ≤ 2kVA per unit (also Section 3.1.17(b)).' }),
];
// ---------- Table 4.3 Low Tension Cost, Part 2 (pages 11–12) ----------
const T43b = [
  R('LT-34', '4.3 (Part 2)', 11, 'Distribution Pillar 7W6F', 'each', 12600.00),
  R('LT-35', '4.3 (Part 2)', 11, 'Mini Pillar 4-Way', 'each', 5420.00),
  R('LT-36', '4.3 (Part 2)', 11, 'Service Intake 250A', 'each', 2820.00),
  R('LT-37', '4.3 (Part 2)', 11, 'Service Intake 400A', 'each', 3350.00),
  R('LT-38', '4.3 (Part 2)', 11, '6-Way Centralised Metering Cabinet (CMC)', 'each', 5100.00),
  R('LT-39', '4.3 (Part 2)', 11, '9-Way Centralised Metering Cabinet (CMC)', 'each', 6750.00),
  R('LT-40', '4.3 (Part 2)', 11, 'Street Lighting Control Box (1-phase & 3-phase) - Wall mounted or Pole mounted', 'each', 1135.00, { street: true }),
  R('LT-41', '4.3 (Part 2)', 11, 'Street Lighting Control Box (1-phase & 3-phase) - Ground mounted', 'each', 1500.00, { street: true }),
  R('LT-42', '4.3 (Part 2)', 11, 'Bracket Street Lighting wall mounted (100W) with wiring', 'each', 1100.00, { street: true }),
  R('LT-43', '4.3 (Part 2)', 11, 'Bracket Street Lighting wall mounted (150W) with wiring', 'each', 1397.00, { street: true }),
  R('LT-44', '4.3 (Part 2)', 12, 'Bracket Street Lighting on pole (100W) with wiring', 'each', 500.00, { street: true }),
  R('LT-45', '4.3 (Part 2)', 12, 'Bracket Street Lighting on pole (150W) with wiring', 'each', 680.00, { street: true }),
  R('LT-46', '4.3 (Part 2)', 12, 'Single lamp column street lighting (150W) with underground cable', 'each', 3000.00, { street: true }),
  R('LT-47', '4.3 (Part 2)', 12, 'Twin/Double lamp column street lighting (150W) with underground cable', 'each', 7400.00, { street: true }),
  R('LT-48', '4.3 (Part 2)', 12, 'Single lamp column street lighting (250W) with underground cable', 'each', 3100.00, { street: true }),
  R('LT-49', '4.3 (Part 2)', 12, 'Twin/Double lamp column street lighting (250W) with underground cable', 'each', 7550.00, { street: true }),
];
const T43 = [...T43a, ...T43b].map(r => ({ ...r, comp: 'lt' }));

// ---------- Table 4.4 High Tension Cost (page 12) ----------
const T44 = [
  R('HT-01', '4.4', 12, '11kV Overhead Lines with Single Pole span', 'per span with pole', 8700.00),
  R('HT-02', '4.4', 12, '11kV Overhead Lines with H-Pole span', 'per span with pole', 11700.00),
  R('HT-03', '4.4', 12, '11kV Overhead Lines span', 'per span without pole', 4300.00),
  R('HT-04', '4.4', 12, '33kV Overhead Lines with Single Pole span', 'per span with pole', 12250.00),
  R('HT-05', '4.4', 12, '33kV Overhead Lines with H-pole span', 'per span with pole', 16800.00),
  R('HT-06', '4.4', 12, '33kV Overhead Lines', 'per span without pole', 6200.00),
  R('HT-07', '4.4', 12, '11kV Single Pole only', 'each', 4600.00),
  R('HT-08', '4.4', 12, '11kV H-Pole only', 'each', 7550.00),
  R('HT-09', '4.4', 12, '33kV Single Pole', 'each', 6700.00),
  R('HT-10', '4.4', 12, '33kV H-Pole', 'each', 11800.00),
  R('HT-11', '4.4', 12, '11kV Air Break Isolator (ABI) exclude pole', 'each', 18700.00),
  R('HT-12', '4.4', 12, '33kV Air Break Isolator (ABI) exclude pole', 'each', 22280.00),
  R('HT-13', '4.4', 12, '11kV underground cable 3C 185mmsq AL', 'meter', 260.00),
  R('HT-14', '4.4', 12, '33kV underground cable 3 x 1C 630mmsq Cu', 'meter (circuit length)', 900.00),
  R('HT-15', '4.4', 12, '33kV underground cable 3 x 1C 630mmsq Al', 'meter (circuit length)', 500.00),
  R('HT-16', '4.4', 12, '33kV underground cable 3C 240mmsq Al', 'meter', 350.00),
  R('HT-17', '4.4', 12, '33kV underground cable 3C 95mmsq Al', 'meter', 320.00),
  R('HT-18', '4.4', 12, 'Shutdown Notice (advertisement through local newspapers)', 'each', 3000.00),
].map(r => ({ ...r, comp: 'ht' }));

// ---------- Table 4.5 Substation Cost (pages 12–13) ----------
const SITE = 'Site specific conditions requiring substation on suspended floor with brickwall fencing shall use prevailing rates.';
const T45 = [
  R('SS-01', '4.5', 12, '11kV or 33kV Switching Pole with 1 set Air Break Fused Isolator (ABFI)', 'each', 17040.00),
  R('SS-02', '4.5', 12, '11kV Switching Sub with 1 no. RMU', 'each', 39710.00),
  R('SS-03', '4.5', 12, 'Substation 11/.433kV 50kVA (Pole mount)', 'each', 36590.00, { kva: 50 }),
  R('SS-04', '4.5', 12, 'Substation 11/.433kV 50kVA (Platform mount)', 'each', 40550.00, { kva: 50 }),
  R('SS-05', '4.5', 12, 'Substation 11/.433kV 160kVA (Platform mount)', 'each', 60690.00, { kva: 160 }),
  R('SS-06', '4.5', 12, 'Substation 11/.433kV 160kVA (Ground mount / Suspended )', 'each', 90890.00, { kva: 160 }),
  R('SS-07', '4.5', 12, 'Substation 11/.433kV 300kVA (Ground mount / Suspended )', 'each', 106410.00, { kva: 300 }),
  R('SS-08', '4.5', 12, 'Substation 11/.433kV 500kVA (Ground mount / Suspended )', 'each', 127860.00, { kva: 500 }),
  R('SS-09', '4.5', 12, 'Substation 11/.433kV 1000kVA (Ground mount / Suspended )', 'each', 188060.00, { kva: 1000 }),
  R('SS-10', '4.5', 12, 'Substation 11/.433kV 1500kVA (Ground mount / Suspended )', 'each', 214770.00, { kva: 1500 }),
  R('SS-11', '4.5', 12, 'Substation 33/.433kV 50kVA (Pole / Platform mount)', 'each', 41210.00, { kva: 50 }),
  R('SS-12', '4.5', 12, 'Substation 33/.433kV 160kVA (Platform mount)', 'each', 64130.00, { kva: 160 }),
  R('SS-13', '4.5', 12, 'Substation 33/.433kV 160kVA (Ground mount / Suspended )', 'each', 81120.00, { kva: 160 }),
  R('SS-14', '4.5', 12, 'Substation 33/.433kV 300kVA (Ground mount / Suspended )', 'each', 113990.00, { kva: 300 }),
  R('SS-15', '4.5', 12, 'Substation 33/.433kV 500kVA (Ground mount / Suspended )', 'each', 144680.00, { kva: 500 }),
  R('SS-16', '4.5', 12, 'Substation 33/.433kV 1000kVA (Ground mount / Suspended )', 'each', 177120.00, { kva: 1000 }),
  R('SS-17', '4.5', 12, 'Substation 33/11kV 1000kVA (Platform Mount)', 'each', 198880.00, { kva: 1000 }),
  R('SS-18', '4.5', 12, 'Pad Mount Substation 11/.433kV 300kVA', 'each', 190580.00, { kva: 300 }),
  R('SS-19', '4.5', 12, 'Pad Mount Substation 11/.433kV 500kVA', 'each', 211320.00, { kva: 500 }),
  R('SS-20', '4.5', 12, 'Brickwall Fencing for Double Transformer Substation (Ground mount only)*', 'each', 36180.00, { cond: SITE }),
  R('SS-21', '4.5', 12, 'Brickwall Fencing for Single Transformer Substation (Ground mount only)*', 'each', 29870.00, { cond: SITE }),
  R('SS-22', '4.5', 12, 'Chainlink Fencing for Double Transformer Substation', 'each', 11480.00),
  R('SS-23', '4.5', 13, 'Chainlink Fencing for Single Transformer Substation', 'each', 9700.00),
  R('SS-24', '4.5', 13, 'Belian Platform for Single Transformer', 'each', 9230.00),
  R('SS-25', '4.5', 13, '11kV Auto Recloser', 'each', 80410.00),
  R('SS-26', '4.5', 13, '33kV Auto Recloser', 'each', 101360.00),
].map(r => ({ ...r, comp: 'substation' }));

// ---------- Table 4.6 Controlled Items (page 13) — Turnkey only (Section 3.1.13) ----------
const T46 = [
  R('CI-01', '4.6', 13, 'Standard Padlocks (33kV, 11kV, LV)', 'each', 50.00),
  R('CI-02', '4.6', 13, 'Low Voltage CT Metering Cabinet (400A) exclude installation', 'each', 5000.00),
  R('CI-03', '4.6', 13, 'Low Voltage CT Metering Cabinet (800A) exclude installation', 'each', 5300.00),
  R('CI-04', '4.6', 13, 'Low Voltage CT Metering Cabinet (2000A) exclude installation', 'each', 8800.00),
  R('CI-05', '4.6', 13, '100A Service Cutout', 'each', 38.00),
  R('CI-06', '4.6', 13, '60A Service Cutout', 'each', 36.00),
  R('CI-07', '4.6', 13, 'Neutral Link', 'each', 10.00),
  R('CI-08', '4.6', 13, 'Meter Cabinet (1-phase)', 'each', 180.00),
  R('CI-09', '4.6', 13, 'Meter Cabinet (3-phase)', 'each', 220.00),
].map(r => ({ ...r, comp: 'controlled' }));

// ---------- Table 4.7 Capacity Charge (page 13) ----------
const T47 = [
  R('CC-01', '4.7', 13, 'Substation Capacity Charge', 'RM/kVA', 445.00, { comp: 'scc' }),
  R('CC-02', '4.7', 13, 'Line Capacity Charge', 'RM/kVA', 30.00, { comp: 'lcc' }),
];

// ---------- Table 4.8 Administration Fee (page 13) — Turnkey only (Section 3.1.11) ----------
const T48 = [
  R('AF-01', '4.8', 13, 'Substation Civil Works', 'Per Substation', 1500.00),
  R('AF-02', '4.8', 13, 'Substation Electrical Works', 'Per Substation', 1000.00),
  R('AF-03', '4.8', 13, 'High Voltage Cables/Lines with equipment', 'Per 1km circuit', 500.00, { per: 1000 }),
  R('AF-04', '4.8', 13, 'Low Voltage Cables/Lines with equipment', 'Per 500m circuit', 200.00, { per: 500 }),
].map(r => ({ ...r, comp: 'admin' }));

// ---------- Table 4.9 Testing Fee (page 13) — Turnkey, when SESCO is asked to test (Section 3.1.12) ----------
const T49 = [
  R('TF-01', '4.9', 13, 'LT Overhead Lines/Underground Cables commissioning test', 'Per feeder/cct length', 700.00),
  R('TF-02', '4.9', 13, 'HV Circuit Breakers (with Relays and Metering) commissioning test', 'Per Panel', 1500.00),
  R('TF-03', '4.9', 13, 'Ring Main Units commissioning test', 'Per Unit', 500.00),
  R('TF-04', '4.9', 13, 'Isolation Switches and Fused Switches commissioning test', 'Per Unit', 500.00),
  R('TF-05', '4.9', 13, 'Distribution Transformer commissioning test', 'Per Unit', 500.00),
  R('TF-06', '4.9', 13, 'HT Overhead Lines/Underground/Submarine Cables (without HV pressure test)', 'Per km', 1500.00),
  R('TF-07', '4.9', 13, 'HT Overhead Lines/Underground/Submarine Cables (with HV pressure test)', 'Per feeder/length', 3500.00),
].map(r => ({ ...r, comp: 'testing' }));

// ---------- Section 3.1.14 Engineering Fee (page 7) ----------
const ENG = [R('EF-01', '3.1.14', 7, 'Engineering Fee — customer opts for Turnkey Project after SESCO has released the Normal Project Connection Charges (SESCO appointed in writing to undertake the works as Normal Project, including design)', 'each', 3000.00, { comp: 'engfee' })];

export const RATES = [...T41, ...T42, ...T43, ...T44, ...T45, ...T46, ...T47, ...T48, ...T49, ...ENG];
export const RATE = Object.fromEntries(RATES.map(r => [r.code, r]));
export const CATALOGUES = { [GUIDELINE.id]: { guideline: GUIDELINE, rates: RATES } };

// ---------- Table 5.1 Minimum Assigned Load (page 14) + premise classes used by Section 5.2 ----------
// res: residential (Section 5.2.2 a/b); threeOnly: "at minimum requires three phase supply" (Section 5.2.1 a);
// contrib: types named in Section 3.1.17(a) (capacity charges borne by SESCO when applied load ≤ 2kVA per unit).
export const PREMISES = [
  { key: 'small', label: 'Small Residential House', mal: 2, res: true, listed: true, contrib: true, fn: 1 },
  { key: 'govt', label: 'Residential House built under relevant Government assisted scheme', mal: 1.5, res: true, listed: true, contrib: true, fn: 2 },
  { key: 'lh2', label: 'Longhouse Double Storey Unit/Bilik', mal: 2, res: true, listed: true, contrib: true },
  { key: 'lh1', label: 'Longhouse Single Storey Unit/Bilik', mal: 1.5, res: true, listed: true, contrib: true },
  { key: 'lowcostplus', label: 'Low Cost Plus House or Flat', mal: 2, res: true, listed: true, contrib: true },
  { key: 'lowcost', label: 'Low Cost House or Flat', mal: 1.5, res: true, listed: true, contrib: true },
  { key: 'detached', label: 'Detached House up to 3-Storey', mal: 5, res: true, listed: true },
  { key: 'semi', label: 'Semi-Detached House up to 3-Storey', mal: 4, res: true, listed: true },
  { key: 'terrace', label: 'Terrace or Quadrant House up to 3-Storey', mal: 3, res: true, listed: true },
  { key: 'apt5', label: 'Apartment or Condominium Unit > 1000ft² (92.9m²)', mal: 5, res: true, listed: true },
  { key: 'apt4', label: 'Apartment or Condominium Unit < 1000ft² (92.9m²)', mal: 4, res: true, listed: true },
  { key: 'lightind', label: 'Light Industry Unit', mal: 10, res: false, listed: true, threeOnly: true },
  { key: 'shopcom', label: 'Shophouse Unit Floor (Commercial)', mal: 5, res: false, listed: true, threeOnly: true },
  { key: 'shopres', label: 'Shophouse Unit Floor (Residential)', mal: 3, res: true, listed: true, threeOnly: true },
  { key: 'resettle', label: 'Residential house in a Resettlement Scheme area (not listed in Table 5.1)', mal: null, res: true, listed: false, contrib: true },
  { key: 'othres', label: 'Other residential premise (not listed in Table 5.1)', mal: null, res: true, listed: false },
  { key: 'nonres', label: 'Non-residential premise (commercial, industrial, other — not listed in Table 5.1)', mal: null, res: false, listed: false },
];
export const PREMISE = Object.fromEntries(PREMISES.map(p => [p.key, p]));
export const TABLE51_NOTES = {
  1: 'Small Residential House: total floor area not exceeding 755ft² (70.1m²) and load not exceeding 2kVA per unit. If applied maximum demand exceeds single phase 2kVA or three-phase supply, classify as Detached, Semi-Detached or Terrace/Quadrant House.',
  2: 'Government assisted scheme: applied load (maximum demand) not exceeding 2kVA. If applied maximum demand exceeds single phase 2kVA or three-phase supply, classify as Detached, Semi-Detached or Terrace/Quadrant House.',
};
