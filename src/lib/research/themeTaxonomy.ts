// A curated taxonomy of Indian market themes (#378). A theme is not a sector: "Defence & Aerospace" is one industry,
// "Power T&D & Smart Meters" is parts of several. Each theme lists words that are looked for inside the data service's
// real industry names (lower case, a substring match), so a renamed or new industry is still found and nothing here is a
// hand-copied list of companies.

export interface ThemeDef {
  readonly label: string;
  /** Lower-case fragments of industry names the theme covers. */
  readonly industries: readonly string[];
  /** Other words people type for it ("psu", "chip"); matched as the start of a word. */
  readonly aliases: readonly string[];
}

const t = (label: string, industries: readonly string[], aliases: readonly string[] = []): ThemeDef => ({ label, industries, aliases });

export const THEME_TAXONOMY: readonly ThemeDef[] = [
  t('Defence & Aerospace', ['aerospace & defense'], ['defense', 'drone', 'missile', 'aircraft', 'psu']),
  t('Railways & Rolling Stock', ['railway wagons'], ['rail', 'locomotive', 'metro', 'wagon']),
  t('Shipbuilding & Ports', ['ship building', 'port & port', 'shipping', 'dredging'], ['shipyard', 'maritime']),
  // The data has no semiconductor industry, so this is the electronics-manufacturing end of it; the name says so.
  t('Electronics & EMS', ['consumer electronics', 'computers hardware'], ['ems', 'chip', 'semiconductor', 'electronic']),
  t('Solar & Green Energy', ['power generation', 'integrated power', 'heavy electrical', 'other electrical equipment'], ['renewable', 'hydrogen', 'wind', 'clean']),
  t('Power T&D & Smart Meters', ['power - transmission', 'power distribution', 'heavy electrical', 'cables - electricals', 'power trading', 'other electrical equipment'], ['transmission', 'grid', 'transformer', 'cable']),
  t('Pharma & CDMO', ['pharmaceuticals', 'biotechnology'], ['drug', 'api', 'cdmo', 'generic']),
  t('Hospitals & Healthcare Services', ['hospital', 'healthcare service', 'medical equipment', 'pharmacy retail', 'healthcare research'], ['diagnostic', 'medical']),
  t('Banks', ['private sector bank', 'public sector bank', 'other bank'], ['banking', 'psu bank']),
  t('NBFCs & Housing Finance', ['non banking', 'housing finance', 'microfinance', 'financial institution'], ['nbfc', 'lending', 'credit']),
  t('Capital Markets & Wealth', ['stockbroking', 'asset management', 'exchange and data', 'depositories', 'other capital market', 'ratings', 'financial products distributor'], ['broker', 'amc', 'exchange', 'wealth']),
  t('Insurance', ['life insurance', 'general insurance', 'insurance distributors'], ['insurer']),
  t('Fintech & Digital Platforms', ['financial technology', 'e-retail', 'internet & catalogue', 'web based media', 'digital entertainment'], ['internet', 'ecommerce', 'startup', 'new age']),
  t('IT Services & Digital Engineering', ['computers - software', 'it enabled', 'software products', 'business process', 'consulting services'], ['software', 'saas', 'it']),
  t('Data Centers & Cloud', ['data processing', 'it enabled services', 'telecom - infrastructure'], ['cloud', 'datacenter', 'hosting']),
  t('Telecom', ['telecom'], ['telecommunication', '5g', 'broadband', 'airtel']),
  t('EV & Auto Ancillaries', ['auto components', 'tyres', 'castings & forgings'], ['ev', 'electric vehicle', 'battery', 'ancillary']),
  t('Autos & Mobility', ['passenger cars', 'commercial vehicles', 'tractors', 'auto dealer', '2/3 wheelers'], ['car', 'automobile', 'two wheeler', 'truck']),
  t('Specialty Chemicals', ['specialty chemicals', 'dyes', 'carbon black', 'industrial gases'], ['chemical', 'fluorochemical', 'pigment']),
  t('Agrochemicals & Fertilisers', ['pesticides', 'fertilizers', 'commodity chemicals', 'petrochemicals'], ['agri', 'crop', 'fertiliser', 'urea']),
  t('Steel & Ferrous Metals', ['iron & steel', 'sponge iron', 'ferro', 'pig iron'], ['steel', 'iron']),
  t('Non-ferrous Metals & Mining', ['aluminium', 'copper', 'zinc', 'diversified metals', 'precious metals', 'coal', 'industrial minerals'], ['mining', 'metal', 'commodity']),
  t('Oil & Gas', ['refineries', 'oil exploration', 'oil equipment', 'oil storage', 'lpg/cng', 'gas transmission', 'lubricants', 'offshore'], ['oil', 'gas', 'crude', 'petroleum', 'cng']),
  t('Cement & Building Materials', ['cement', 'other construction materials', 'ceramics', 'sanitary', 'plywood', 'granites', 'glass - industrial', 'paints'], ['construction material', 'tiles', 'paint']),
  t('Infrastructure & Construction', ['civil construction', 'road assets', 'construction vehicles', 'water supply'], ['infra', 'roads', 'epc', 'highway']),
  t('Real Estate', ['residential, commercial', 'real estate related'], ['realty', 'housing', 'property']),
  t('Hotels, Travel & Aviation', ['hotels', 'tour, travel', 'amusement', 'airline', 'airport'], ['tourism', 'airline', 'hospitality']),
  t('QSR & Restaurants', ['restaurants'], ['food service', 'quick service', 'dining']),
  t('FMCG & Packaged Foods', ['packaged foods', 'diversified fmcg', 'household products', 'personal care', 'edible oil', 'dairy', 'tea & coffee', 'other food', 'cigarettes'], ['consumer', 'staples', 'fmcg']),
  t('Alcohol & Beverages', ['breweries & distilleries', 'other beverages'], ['liquor', 'beer', 'spirits']),
  t('Retail & Apparel', ['speciality retail', 'diversified retail', 'garments', 'footwear'], ['retail', 'fashion', 'luxury', 'clothing']),
  t('Gems & Jewellery', ['gems, jewellery'], ['gold', 'diamond', 'jewelry', 'luxury']),
  t('Consumer Durables & Appliances', ['household appliances', 'consumer electronics', 'houseware', 'furniture', 'cycles'], ['appliance', 'durable', 'ac']),
  t('Agriculture & Sugar', ['sugar', 'other agricultural', 'seafood', 'animal feed', 'tractors'], ['farm', 'agri', 'ethanol', 'sugarcane']),
  t('Textiles', ['textile', 'garments', 'jute'], ['cotton', 'yarn', 'fabric']),
  t('Media & Entertainment', ['tv broadcasting', 'film production', 'media & entertainment', 'print media', 'advertising', 'electronic media', 'printing'], ['ott', 'broadcast', 'movies', 'advertising']),
  t('Education & E-learning', ['education', 'e-learning'], ['edtech', 'school', 'learning']),
  t('Logistics & Transport', ['logistics solution', 'transport related', 'road transport', 'port & port'], ['freight', 'supply chain', 'warehouse']),
  t('Industrial Capex & Engineering', ['industrial products', 'compressors', 'abrasives', 'other industrial products', 'electrodes', 'heavy electrical'], ['capital goods', 'machinery', 'engineering', 'pump', 'bearing']),
  t('Packaging & Paper', ['packaging', 'plastic products', 'paper'], ['plastic', 'carton']),
  t('Waste & Water Management', ['waste management', 'water supply'], ['recycling', 'sanitation', 'environment']),
  t('Holding & Diversified Groups', ['investment company', 'holding company', 'diversified'], ['conglomerate', 'group']),
];
