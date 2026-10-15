import { ITEM_MAP, productLink, SKYLIGHT_DEFAULTS, SKYLIGHT_MODELS, SOLAR_DEFAULTS, SOLAR_PANELS, TIMBERLINE, VANITY_DEFAULTS } from './catalog';

/**
 * Details for items modelled on a real product, for the product card: brand, description, key specs, price,
 * photo and links. ABI Interiors details come from the (on-demand) ABI product list.
 */

export interface ProductInfo {
  brand: string;
  brandUrl: string;
  name: string;
  url?: string;
  image?: string;
  description?: string;
  specs: [string, string][];
  price?: string;
  /** Small print, e.g. which details are assumed. */
  note?: string;
}

interface ItemLike {
  type: string;
  name?: string;
  width?: number;
  depth?: number;
  height?: number;
  options?: Record<string, string | number>;
}

const PHL = { brand: 'Provincial Home Living', brandUrl: 'https://www.provincialhomeliving.com.au/' };
const HN = { brand: 'Harvey Norman', brandUrl: 'https://www.harveynorman.com.au/' };
const PANASONIC = { brand: 'Panasonic', brandUrl: 'https://www.panasonic.com/au/' };
const VELUX = { brand: 'VELUX', brandUrl: 'https://www.velux.com.au/' };
const TIMBERLINE_BRAND = { brand: 'Timberline', brandUrl: 'https://timberline.com.au/' };
const ABI = { brand: 'ABI Interiors', brandUrl: 'https://www.abiinteriors.com.au/' };

const size = (w?: number, d?: number, h?: number) => `${w} W × ${d} D × ${h} H mm`;

const STATIC: Record<string, Omit<ProductInfo, 'url'>> = {
  buffet_hutch: {
    ...PHL,
    name: 'Rochester Buffet & Hutch',
    image: 'https://www.provincialhomeliving.com.au/media/catalog/product/cache/0b2baf72d7efc3c93788a097408aaf09/1/1/1117259923_a.jpg',
    description:
      'A natural oak buffet and hutch that comes in two pieces: twelve drawers below, two open shelves, and four glazed doors with slightly blue-tinted tempered glass over three shelves.',
    specs: [
      ['Size', '2310 W × 510 D × 2200 H mm'],
      ['Materials', 'Oak, engineered board, plywood, glass'],
      ['Finish', 'Natural oak'],
      ['Weight', '272 kg'],
    ],
    price: '$6,895',
  },
  buffet_lombardozzi: {
    ...HN,
    name: 'Lombardozzi Buffet – Tasmanian Oak',
    description: 'A solid Tasmanian oak buffet with four doors and three drawers, sold in 110, 158 and 207 cm widths.',
    specs: [
      ['Widths', '1100 / 1580 / 2070 mm'],
      ['Material', 'Solid Tasmanian oak'],
    ],
    note: 'Depth and height in the model (450 × 800 mm) are typical figures, not from the listing.',
  },
  ac_indoor: {
    ...PANASONIC,
    name: 'Panasonic Z Series 8.0 kW split system (CS/CU-Z80YKR)',
    description: 'A reverse-cycle inverter split system for cooling and heating, with Wi-Fi control.',
    specs: [
      ['Capacity', '8.0 kW cooling / 9.0 kW heating'],
      ['Indoor unit', '1040 W × 244 D × 295 H mm'],
      ['Outdoor unit', '875 W × 320 D × 795 H mm'],
    ],
  },
  shelving_rack: {
    brand: 'Bunnings',
    brandUrl: 'https://www.bunnings.com.au/',
    name: 'Pinnacle 1830 × 1820 × 540 mm 4 Tier Heavy Duty Shelving Unit',
    description: 'Boltless steel shelving in matte black powder coat that snaps together, with particleboard shelves.',
    specs: [
      ['Size', '1820 W × 540 D × 1830 H mm'],
      ['Shelves', '4'],
      ['Load', 'About 600 kg per shelf, evenly spread (check the label)'],
    ],
  },
  shelving_rack_tall: {
    brand: 'Bunnings NZ',
    brandUrl: 'https://www.bunnings.co.nz/',
    name: 'Pinnacle 2090 × 1820 × 540 mm 5 Tier Heavy Duty Shelving Unit',
    description: 'The taller five-tier version of the Pinnacle heavy duty shelving, in matte black.',
    specs: [
      ['Size', '1820 W × 540 D × 2090 H mm'],
      ['Shelves', '5'],
      ['Load', 'About 600 kg per shelf, evenly spread (check the label)'],
    ],
  },
  sun_tunnel: {
    ...VELUX,
    name: 'VELUX Sun Tunnel',
    description: 'A tubular skylight: a roof dome, a reflective tube and a ceiling diffuser that bring daylight into small or windowless rooms.',
    specs: [],
  },
};
STATIC.ac_outdoor = STATIC.ac_indoor;

const VELUX_BLURB: Record<string, string> = {
  FS: 'A fixed (non-opening) skylight for daylight.',
  VS: 'A manually opening skylight, opened with a winder or rod, for daylight and ventilation.',
  VSE: 'An electrically opening skylight with a wall control and rain sensor.',
  VSS: 'A solar-powered opening skylight: no wiring needed, with a remote and rain sensor.',
};

/** Product details for an item, or null if it isn't a real product. */
export async function productInfo(it: ItemLike): Promise<ProductInfo | null> {
  const link = productLink({ type: it.type, options: it.options });
  if (it.type.startsWith('abi_')) {
    const slug = it.options?.slug ? String(it.options.slug) : '';
    if (!slug)
      return {
        ...ABI,
        name: ITEM_MAP[it.type]?.name ?? 'ABI Interiors product',
        description: 'Choose the exact ABI Interiors product in this item’s panel to see its details, size, finish and price.',
        specs: [],
        url: ABI.brandUrl,
      };
    const { ABI_PRODUCTS } = await import('./abi');
    const p = ABI_PRODUCTS.find((x) => x.slug === slug);
    if (!p) return null;
    return {
      ...ABI,
      name: p.name,
      url: link?.url,
      image: p.image,
      description: p.description,
      specs: [
        ['Finish', p.finish],
        ['Size', size(p.width, p.depth, p.height)],
        ...(p.mount ? ([['Mounting', p.mount]] as [string, string][]) : []),
        ['Category', p.group],
      ].filter(([, v]) => v) as [string, string][],
      price: p.price,
    };
  }
  if (it.type === 'vanity_tl') {
    const o = { ...VANITY_DEFAULTS, ...(it.options ?? {}) };
    return {
      ...TIMBERLINE_BRAND,
      name: `Timberline ${o.range} vanity`,
      url: link?.url,
      description: `A ${o.range} vanity from Timberline, shown with the options chosen in its panel. Check Timberline’s range page for the exact sizes, colours and tops available.`,
      specs: [
        ['Width', `${it.width} mm`],
        ['Mounting', TIMBERLINE.mounting[String(o.mounting)] ?? String(o.mounting)],
        ['Fronts', TIMBERLINE.fronts[String(o.fronts)] ?? String(o.fronts)],
        ['Style', TIMBERLINE.style[String(o.style)] ?? String(o.style)],
        ['Basin', TIMBERLINE.basin[String(o.basin)] ?? String(o.basin)],
        ['Top', TIMBERLINE.top[String(o.top)] ?? String(o.top)],
      ],
    };
  }
  if (it.type === 'solar_array') {
    const o = { ...SOLAR_DEFAULTS, ...(it.options ?? {}) };
    const p = SOLAR_PANELS[String(o.panel)] ?? SOLAR_PANELS.jinko_tiger_neo_440;
    const count = Number(o.rows) * Number(o.cols);
    return {
      brand: p.brand,
      brandUrl: p.brandUrl,
      name: `${p.brand} ${p.model}`,
      url: p.url,
      description: `${count} panels (${o.rows} × ${o.cols}, ${o.orient}) for a ${((count * p.watts) / 1000).toFixed(2)} kW system.`,
      specs: [
        ['Model', p.code],
        ['Power', `${p.watts} W per panel`],
        ['Efficiency', `${p.efficiency}%`],
        ['Panel size', `${p.long} × ${p.short} × ${p.thick} mm`],
        ['Weight', `${p.kg} kg per panel`],
      ],
      note: 'From the maker’s datasheet. Check the exact model and availability with your installer.',
    };
  }
  if (it.type === 'skylight') {
    const o = { ...SKYLIGHT_DEFAULTS, ...(it.options ?? {}) };
    const model = String(o.model);
    return {
      ...VELUX,
      name: `VELUX ${SKYLIGHT_MODELS[model] ?? model} skylight`,
      url: link?.url,
      description: VELUX_BLURB[model],
      specs: [
        ['Size', `${o.size ? `${o.size} — ` : ''}${it.width} × ${it.depth} mm`],
        ['Type', 'Pitched roof skylight'],
      ],
    };
  }
  const s = STATIC[it.type];
  if (!s) return null;
  const specs = it.type === 'sun_tunnel' ? ([['Tube', `${it.width} mm`]] as [string, string][]) : s.specs;
  return { ...s, specs, url: link?.url };
}

/** Whether an item type is (or can be) a real product. */
export function isProductType(type: string) {
  return type.startsWith('abi_') || type === 'vanity_tl' || type === 'skylight' || type === 'solar_array' || type in STATIC;
}
