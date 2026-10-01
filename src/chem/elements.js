// Periodic table data for all 118 elements.
//
// Columns: Z, symbol, name, atomic mass, category, group, period, electronegativity (Pauling),
// covalent radius (pm), CPK/Jmol colour, state at 20 °C (s/l/g), melting point (K),
// boiling point (K), density (g/cm³), electron configuration, bonding valences.
//
// Category codes:
//   AM alkali metal, AE alkaline earth metal, TM transition metal, PT post-transition metal,
//   MD metalloid, NM reactive nonmetal, HA halogen, NG noble gas, LN lanthanide, AC actinide,
//   UK unknown chemical properties.

const RAW = `
1|H|Hydrogen|1.008|NM|1|1|2.20|31|FFFFFF|g|13.99|20.27|0.00008988|1s1|1
2|He|Helium|4.0026|NG|18|1||28|D9FFFF|g|0.95|4.22|0.0001785|1s2|0
3|Li|Lithium|6.94|AM|1|2|0.98|128|CC80FF|s|453.65|1603|0.534|[He] 2s1|1
4|Be|Beryllium|9.0122|AE|2|2|1.57|96|C2FF00|s|1560|2742|1.85|[He] 2s2|2
5|B|Boron|10.81|MD|13|2|2.04|84|FFB5B5|s|2349|4200|2.34|[He] 2s2 2p1|3
6|C|Carbon|12.011|NM|14|2|2.55|76|909090|s|3823|4098|2.267|[He] 2s2 2p2|4
7|N|Nitrogen|14.007|NM|15|2|3.04|71|3050F8|g|63.15|77.36|0.0012506|[He] 2s2 2p3|3,5
8|O|Oxygen|15.999|NM|16|2|3.44|66|FF0D0D|g|54.36|90.20|0.001429|[He] 2s2 2p4|2
9|F|Fluorine|18.998|HA|17|2|3.98|57|90E050|g|53.48|85.03|0.001696|[He] 2s2 2p5|1
10|Ne|Neon|20.180|NG|18|2||58|B3E3F5|g|24.56|27.07|0.0008999|[He] 2s2 2p6|0
11|Na|Sodium|22.990|AM|1|3|0.93|166|AB5CF2|s|370.87|1156|0.971|[Ne] 3s1|1
12|Mg|Magnesium|24.305|AE|2|3|1.31|141|8AFF00|s|923|1363|1.738|[Ne] 3s2|2
13|Al|Aluminium|26.982|PT|13|3|1.61|121|BFA6A6|s|933.47|2792|2.698|[Ne] 3s2 3p1|3
14|Si|Silicon|28.085|MD|14|3|1.90|111|F0C8A0|s|1687|3538|2.3296|[Ne] 3s2 3p2|4
15|P|Phosphorus|30.974|NM|15|3|2.19|107|FF8000|s|317.3|553.6|1.82|[Ne] 3s2 3p3|3,5
16|S|Sulfur|32.06|NM|16|3|2.58|105|FFFF30|s|388.36|717.87|2.067|[Ne] 3s2 3p4|2,4,6
17|Cl|Chlorine|35.45|HA|17|3|3.16|102|1FF01F|g|171.6|239.11|0.003214|[Ne] 3s2 3p5|1,3,5,7
18|Ar|Argon|39.948|NG|18|3||106|80D1E3|g|83.80|87.30|0.0017837|[Ne] 3s2 3p6|0
19|K|Potassium|39.098|AM|1|4|0.82|203|8F40D4|s|336.53|1032|0.862|[Ar] 4s1|1
20|Ca|Calcium|40.078|AE|2|4|1.00|176|3DFF00|s|1115|1757|1.54|[Ar] 4s2|2
21|Sc|Scandium|44.956|TM|3|4|1.36|170|E6E6E6|s|1814|3109|2.989|[Ar] 3d1 4s2|3
22|Ti|Titanium|47.867|TM|4|4|1.54|160|BFC2C7|s|1941|3560|4.54|[Ar] 3d2 4s2|4,2,3
23|V|Vanadium|50.942|TM|5|4|1.63|153|A6A6AB|s|2183|3680|6.11|[Ar] 3d3 4s2|5,2,3,4
24|Cr|Chromium|51.996|TM|6|4|1.66|139|8A99C7|s|2180|2944|7.15|[Ar] 3d5 4s1|3,2,6
25|Mn|Manganese|54.938|TM|7|4|1.55|139|9C7AC7|s|1519|2334|7.44|[Ar] 3d5 4s2|2,4,7
26|Fe|Iron|55.845|TM|8|4|1.83|132|E06633|s|1811|3134|7.874|[Ar] 3d6 4s2|2,3
27|Co|Cobalt|58.933|TM|9|4|1.88|126|F090A0|s|1768|3200|8.86|[Ar] 3d7 4s2|2,3
28|Ni|Nickel|58.693|TM|10|4|1.91|124|50D050|s|1728|3186|8.912|[Ar] 3d8 4s2|2
29|Cu|Copper|63.546|TM|11|4|1.90|132|C88033|s|1357.77|2835|8.96|[Ar] 3d10 4s1|2,1
30|Zn|Zinc|65.38|TM|12|4|1.65|122|7D80B0|s|692.68|1180|7.134|[Ar] 3d10 4s2|2
31|Ga|Gallium|69.723|PT|13|4|1.81|122|C28F8F|s|302.91|2673|5.907|[Ar] 3d10 4s2 4p1|3
32|Ge|Germanium|72.630|MD|14|4|2.01|120|668F8F|s|1211.4|3106|5.323|[Ar] 3d10 4s2 4p2|4
33|As|Arsenic|74.922|MD|15|4|2.18|119|BD80E3|s|1090|887|5.776|[Ar] 3d10 4s2 4p3|3,5
34|Se|Selenium|78.971|NM|16|4|2.55|120|FFA100|s|494|958|4.809|[Ar] 3d10 4s2 4p4|2,4,6
35|Br|Bromine|79.904|HA|17|4|2.96|120|A62929|l|265.8|332.0|3.122|[Ar] 3d10 4s2 4p5|1,3,5
36|Kr|Krypton|83.798|NG|18|4|3.00|116|5CB8D1|g|115.79|119.93|0.003733|[Ar] 3d10 4s2 4p6|0,2
37|Rb|Rubidium|85.468|AM|1|5|0.82|220|702EB0|s|312.46|961|1.532|[Kr] 5s1|1
38|Sr|Strontium|87.62|AE|2|5|0.95|195|00FF00|s|1050|1655|2.64|[Kr] 5s2|2
39|Y|Yttrium|88.906|TM|3|5|1.22|190|94FFFF|s|1799|3609|4.469|[Kr] 4d1 5s2|3
40|Zr|Zirconium|91.224|TM|4|5|1.33|175|94E0E0|s|2128|4682|6.506|[Kr] 4d2 5s2|4
41|Nb|Niobium|92.906|TM|5|5|1.6|164|73C2C9|s|2750|5017|8.57|[Kr] 4d4 5s1|5,3
42|Mo|Molybdenum|95.95|TM|6|5|2.16|154|54B5B5|s|2896|4912|10.22|[Kr] 4d5 5s1|6,4
43|Tc|Technetium|98|TM|7|5|1.9|147|3B9E9E|s|2430|4538|11|[Kr] 4d5 5s2|7,4
44|Ru|Ruthenium|101.07|TM|8|5|2.2|146|248F8F|s|2607|4423|12.37|[Kr] 4d7 5s1|3,4,8
45|Rh|Rhodium|102.91|TM|9|5|2.28|142|0A7D8C|s|2237|3968|12.41|[Kr] 4d8 5s1|3
46|Pd|Palladium|106.42|TM|10|5|2.20|139|006985|s|1828.05|3236|12.02|[Kr] 4d10|2,4
47|Ag|Silver|107.87|TM|11|5|1.93|145|C0C0C0|s|1234.93|2435|10.501|[Kr] 4d10 5s1|1
48|Cd|Cadmium|112.41|TM|12|5|1.69|144|FFD98F|s|594.22|1040|8.69|[Kr] 4d10 5s2|2
49|In|Indium|114.82|PT|13|5|1.78|142|A67573|s|429.75|2345|7.31|[Kr] 4d10 5s2 5p1|3
50|Sn|Tin|118.71|PT|14|5|1.96|139|668080|s|505.08|2875|7.287|[Kr] 4d10 5s2 5p2|4,2
51|Sb|Antimony|121.76|MD|15|5|2.05|139|9E63B5|s|903.78|1860|6.685|[Kr] 4d10 5s2 5p3|3,5
52|Te|Tellurium|127.60|MD|16|5|2.1|138|D47A00|s|722.66|1261|6.232|[Kr] 4d10 5s2 5p4|2,4,6
53|I|Iodine|126.90|HA|17|5|2.66|139|940094|s|386.85|457.4|4.93|[Kr] 4d10 5s2 5p5|1,3,5,7
54|Xe|Xenon|131.29|NG|18|5|2.6|140|429EB0|g|161.4|165.03|0.005887|[Kr] 4d10 5s2 5p6|0,2,4,6
55|Cs|Caesium|132.91|AM|1|6|0.79|244|57178F|s|301.59|944|1.873|[Xe] 6s1|1
56|Ba|Barium|137.33|AE|2|6|0.89|215|00C900|s|1000|2170|3.594|[Xe] 6s2|2
57|La|Lanthanum|138.91|LN||6|1.10|207|70D4FF|s|1193|3737|6.145|[Xe] 5d1 6s2|3
58|Ce|Cerium|140.12|LN||6|1.12|204|FFFFC7|s|1068|3716|6.77|[Xe] 4f1 5d1 6s2|3,4
59|Pr|Praseodymium|140.91|LN||6|1.13|203|D9FFC7|s|1208|3793|6.773|[Xe] 4f3 6s2|3
60|Nd|Neodymium|144.24|LN||6|1.14|201|C7FFC7|s|1297|3347|7.007|[Xe] 4f4 6s2|3
61|Pm|Promethium|145|LN||6|1.13|199|A3FFC7|s|1315|3273|7.26|[Xe] 4f5 6s2|3
62|Sm|Samarium|150.36|LN||6|1.17|198|8FFFC7|s|1345|2067|7.52|[Xe] 4f6 6s2|3,2
63|Eu|Europium|151.96|LN||6|1.2|198|61FFC7|s|1099|1802|5.243|[Xe] 4f7 6s2|3,2
64|Gd|Gadolinium|157.25|LN||6|1.2|196|45FFC7|s|1585|3546|7.895|[Xe] 4f7 5d1 6s2|3
65|Tb|Terbium|158.93|LN||6|1.2|194|30FFC7|s|1629|3503|8.229|[Xe] 4f9 6s2|3
66|Dy|Dysprosium|162.50|LN||6|1.22|192|1FFFC7|s|1680|2840|8.55|[Xe] 4f10 6s2|3
67|Ho|Holmium|164.93|LN||6|1.23|192|00FF9C|s|1734|2993|8.795|[Xe] 4f11 6s2|3
68|Er|Erbium|167.26|LN||6|1.24|189|00E675|s|1802|3141|9.066|[Xe] 4f12 6s2|3
69|Tm|Thulium|168.93|LN||6|1.25|190|00D452|s|1818|2223|9.321|[Xe] 4f13 6s2|3
70|Yb|Ytterbium|173.05|LN||6|1.1|187|00BF38|s|1097|1469|6.965|[Xe] 4f14 6s2|3,2
71|Lu|Lutetium|174.97|LN||6|1.27|187|00AB24|s|1925|3675|9.84|[Xe] 4f14 5d1 6s2|3
72|Hf|Hafnium|178.49|TM|4|6|1.3|175|4DC2FF|s|2506|4876|13.31|[Xe] 4f14 5d2 6s2|4
73|Ta|Tantalum|180.95|TM|5|6|1.5|170|4DA6FF|s|3290|5731|16.654|[Xe] 4f14 5d3 6s2|5
74|W|Tungsten|183.84|TM|6|6|2.36|162|2194D6|s|3695|6203|19.25|[Xe] 4f14 5d4 6s2|6,4
75|Re|Rhenium|186.21|TM|7|6|1.9|151|267DAB|s|3459|5869|21.02|[Xe] 4f14 5d5 6s2|7,4
76|Os|Osmium|190.23|TM|8|6|2.2|144|266696|s|3306|5285|22.59|[Xe] 4f14 5d6 6s2|4,8
77|Ir|Iridium|192.22|TM|9|6|2.20|141|175487|s|2719|4701|22.56|[Xe] 4f14 5d7 6s2|3,4
78|Pt|Platinum|195.08|TM|10|6|2.28|136|D0D0E0|s|2041.4|4098|21.45|[Xe] 4f14 5d9 6s1|2,4
79|Au|Gold|196.97|TM|11|6|2.54|136|FFD123|s|1337.33|3129|19.3|[Xe] 4f14 5d10 6s1|3,1
80|Hg|Mercury|200.59|TM|12|6|2.00|132|B8B8D0|l|234.32|629.88|13.534|[Xe] 4f14 5d10 6s2|2,1
81|Tl|Thallium|204.38|PT|13|6|1.62|145|A6544D|s|577|1746|11.85|[Xe] 4f14 5d10 6s2 6p1|1,3
82|Pb|Lead|207.2|PT|14|6|2.33|146|575961|s|600.61|2022|11.34|[Xe] 4f14 5d10 6s2 6p2|2,4
83|Bi|Bismuth|208.98|PT|15|6|2.02|148|9E4FB5|s|544.7|1837|9.78|[Xe] 4f14 5d10 6s2 6p3|3,5
84|Po|Polonium|209|PT|16|6|2.0|140|AB5C00|s|527|1235|9.196|[Xe] 4f14 5d10 6s2 6p4|2,4
85|At|Astatine|210|HA|17|6|2.2|150|754F45|s|575|610|6.4|[Xe] 4f14 5d10 6s2 6p5|1
86|Rn|Radon|222|NG|18|6|2.2|150|428296|g|202|211.3|0.00973|[Xe] 4f14 5d10 6s2 6p6|0
87|Fr|Francium|223|AM|1|7|0.7|260|420066|s|300|950|1.87|[Rn] 7s1|1
88|Ra|Radium|226|AE|2|7|0.9|221|007D00|s|973|2010|5.5|[Rn] 7s2|2
89|Ac|Actinium|227|AC||7|1.1|215|70ABFA|s|1323|3471|10.07|[Rn] 6d1 7s2|3
90|Th|Thorium|232.04|AC||7|1.3|206|00BAFF|s|2115|5061|11.72|[Rn] 6d2 7s2|4
91|Pa|Protactinium|231.04|AC||7|1.5|200|00A1FF|s|1841|4300|15.37|[Rn] 5f2 6d1 7s2|5
92|U|Uranium|238.03|AC||7|1.38|196|008FFF|s|1405.3|4404|18.95|[Rn] 5f3 6d1 7s2|6,4
93|Np|Neptunium|237|AC||7|1.36|190|0080FF|s|917|4273|20.45|[Rn] 5f4 6d1 7s2|5
94|Pu|Plutonium|244|AC||7|1.28|187|006BFF|s|912.5|3501|19.84|[Rn] 5f6 7s2|4
95|Am|Americium|243|AC||7|1.13|180|545CF2|s|1449|2880|13.69|[Rn] 5f7 7s2|3
96|Cm|Curium|247|AC||7|1.28|169|785CE3|s|1613|3383|13.51|[Rn] 5f7 6d1 7s2|3
97|Bk|Berkelium|247|AC||7|1.3|168|8A4FE3|s|1259|2900|14.79|[Rn] 5f9 7s2|3
98|Cf|Californium|251|AC||7|1.3|168|A136D4|s|1173|1743|15.1|[Rn] 5f10 7s2|3
99|Es|Einsteinium|252|AC||7|1.3|165|B31FD4|s|1133|1269|8.84|[Rn] 5f11 7s2|3
100|Fm|Fermium|257|AC||7|1.3|167|B31FBA|s|1800|||[Rn] 5f12 7s2|3
101|Md|Mendelevium|258|AC||7|1.3|173|B30DA6|s|1100|||[Rn] 5f13 7s2|3
102|No|Nobelium|259|AC||7|1.3|176|BD0D87|s|1100|||[Rn] 5f14 7s2|2
103|Lr|Lawrencium|266|AC||7|1.3|161|C70066|s|1900|||[Rn] 5f14 7s2 7p1|3
104|Rf|Rutherfordium|267|TM|4|7||157|CC0059|s||||[Rn] 5f14 6d2 7s2|4
105|Db|Dubnium|268|TM|5|7||149|D1004F|s||||[Rn] 5f14 6d3 7s2|5
106|Sg|Seaborgium|269|TM|6|7||143|D90045|s||||[Rn] 5f14 6d4 7s2|6
107|Bh|Bohrium|270|TM|7|7||141|E00038|s||||[Rn] 5f14 6d5 7s2|7
108|Hs|Hassium|277|TM|8|7||134|E6002E|s||||[Rn] 5f14 6d6 7s2|8
109|Mt|Meitnerium|278|UK|9|7||129|EB0026|s||||[Rn] 5f14 6d7 7s2|3
110|Ds|Darmstadtium|281|UK|10|7||128|EE0022|s||||[Rn] 5f14 6d8 7s2|2
111|Rg|Roentgenium|282|UK|11|7||121|F0001E|s||||[Rn] 5f14 6d9 7s2|1,3
112|Cn|Copernicium|285|TM|12|7||122|F2001A|l||||[Rn] 5f14 6d10 7s2|2
113|Nh|Nihonium|286|UK|13|7||136|F40016|s||||[Rn] 5f14 6d10 7s2 7p1|1,3
114|Fl|Flerovium|289|UK|14|7||143|F60012|s||||[Rn] 5f14 6d10 7s2 7p2|2
115|Mc|Moscovium|290|UK|15|7||162|F8000E|s||||[Rn] 5f14 6d10 7s2 7p3|1,3
116|Lv|Livermorium|293|UK|16|7||175|FA000A|s||||[Rn] 5f14 6d10 7s2 7p4|2
117|Ts|Tennessine|294|UK|17|7||165|FC0006|s||||[Rn] 5f14 6d10 7s2 7p5|1
118|Og|Oganesson|294|UK|18|7||157|FE0002|s||||[Rn] 5f14 6d10 7s2 7p6|0
`;

export const CATEGORIES = {
  AM: { name: 'Alkali metal', color: '#ff8a65', metal: true },
  AE: { name: 'Alkaline earth metal', color: '#ffca5f', metal: true },
  TM: { name: 'Transition metal', color: '#f4a3b4', metal: true },
  PT: { name: 'Post-transition metal', color: '#9fd3c7', metal: true },
  MD: { name: 'Metalloid', color: '#b5d86b', metal: false },
  NM: { name: 'Reactive nonmetal', color: '#7fd6ff', metal: false },
  HA: { name: 'Halogen', color: '#c3a6ff', metal: false },
  NG: { name: 'Noble gas', color: '#b08cff', metal: false },
  LN: { name: 'Lanthanide', color: '#ffb2e0', metal: true },
  AC: { name: 'Actinide', color: '#ff9ad0', metal: true },
  UK: { name: 'Unknown properties', color: '#c9ccd6', metal: true },
};

const STATE_NAMES = { s: 'Solid', l: 'Liquid', g: 'Gas' };

// Elements that exist naturally as diatomic molecules (X₂).
export const DIATOMIC = new Set(['H', 'N', 'O', 'F', 'Cl', 'Br', 'I']);

function num(v) {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Number of valence electrons for main-group elements (used for lone pairs / VSEPR). */
function valenceElectrons(group, z) {
  if (z === 1) return 1;
  if (z === 2) return 2;
  if (!group) return null;
  if (group <= 2) return group;
  if (group >= 13) return group - 10;
  return null; // transition metals: no simple lone-pair model
}

export const ELEMENTS = [];
export const BY_SYMBOL = {};

for (const line of RAW.trim().split('\n')) {
  const c = line.split('|');
  const z = Number(c[0]);
  const group = num(c[5]);
  const period = Number(c[6]);
  // Display position on an 18 × 10 grid (rows 9 and 10 hold the f-block).
  let col = group;
  let row = period;
  if (z >= 57 && z <= 71) { col = 3 + (z - 57); row = 9; }
  if (z >= 89 && z <= 103) { col = 3 + (z - 89); row = 10; }
  const el = {
    z,
    symbol: c[1],
    name: c[2],
    mass: Number(c[3]),
    synthetic: [43, 61].includes(z) || z >= 93,
    category: c[4],
    categoryName: CATEGORIES[c[4]].name,
    group,
    period,
    col,
    row,
    electronegativity: num(c[7]),
    covalentRadius: Number(c[8]),
    color: '#' + c[9],
    state: c[10],
    stateName: STATE_NAMES[c[10]],
    meltingPoint: num(c[11]),
    boilingPoint: num(c[12]),
    density: num(c[13]),
    config: c[14],
    valences: c[15].split(',').map(Number),
    valenceElectrons: valenceElectrons(group, z),
    isMetal: CATEGORIES[c[4]].metal,
  };
  el.maxValence = Math.max(...el.valences);
  el.minValence = Math.min(...el.valences);
  el.diatomic = DIATOMIC.has(el.symbol);
  ELEMENTS.push(el);
  BY_SYMBOL[el.symbol] = el;
}

export function getElement(symbol) {
  return BY_SYMBOL[symbol];
}
