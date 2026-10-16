/**
 * LG French door fridges (68), from lg.com/au (fetched 2026-10-16: the French door pages listed in LG Australia's sitemap,
 * including older models LG still has pages for). Sizes are LG's published product size (W × H × D mm, depth including
 * handles). Finish colours are approximations; the drawn features (ice & water dispenser, InstaView, Door-in-Door,
 * MoodUP panels) and the number of freezer drawers are worked out from each model's name and model number.
 */

export type LgFeature = 'ice' | 'instaview' | 'did' | 'moodup';

export interface LgFridge {
  model: string;
  name: string;
  litres: number;
  /** "French Door" or "Slim French Door". */
  short: string;
  finish: string;
  hex: string;
  width: number;
  height: number;
  depth: number;
  url: string;
  image: string;
  features: LgFeature[];
  /** Freezer drawers under the fridge doors. */
  drawers: 1 | 2;
  blurb: string;
}

// model | name | litres | short | finish | hex | W | H | D | page (under /au/fridge-freezers/french-door/) | photo (under LG's AU image path) | features | drawers
const ROWS = `
GF-L500MBL|506L Slim French Door Fridge - Plumbed|506|Slim French Door|Matte Black|232324|835|1787|730|gf-l500mbl/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-l500mbl/new-gallery-images/450x450/multi-door-f-next8-2026-gc-l22ffqxj-gf-l500mbl-au-essencemattblack-01-front-450.jpg||1
GF-L500MWH|506L Slim French Door Fridge - Plumbed|506|Slim French Door|Matte White|ecebe7|835|1787|730|gf-l500mwh/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-l500mwh/no-logo/450x450_GFL500MWH.jpg||1
GF-L500PL|506L Slim French Door Fridge - Plumbed|506|Slim French Door|Stainless|c3c6ca|835|1787|730|gf-l500pl/|fridges/gf-l500pl_apyrgap_ehap_au_c/gallery/GF-L500PL_basic_img.jpg||1
GF-L570MBL|506L Slim French Door Fridge - Ice & Water|506|Slim French Door|Matte Black|232324|835|1787|734|gf-l570mbl/|fridges/gf-l570mbl_amcrgap_ehap_au_c/no-logo/450x450_GFL570MBL.jpg|ice|1
GF-L570MBNL|506L Slim French Door Fridge - Ice & Water|506|Slim French Door|Matte Black|232324|835|1787|734|gf-l570mbnl/|fridges/gf-l570mbnl_amcrgap_ehap_au_c/gallery/GF-L570MBNL_basic_img.jpg|ice|1
GF-L570PL|506L Slim French Door Fridge - Ice & Water|506|Slim French Door|Stainless|c3c6ca|835|1787|734|gf-l570pl/|fridges/gf-l570pl_apzrgap_ehap_au_c/gallery/GF-L570PL_basic_img.jpg|ice|1
GF-L570PNL|506L Slim French Door Fridge - Non-Plumbed|506|Slim French Door|Stainless|c3c6ca|835|1787|734|gf-l570pnl/|fridges/gf-l570pnl_apzrgap_ehap_au_c/gallery/GF-L570PNL_basic_img.jpg|ice|1
GF-LN500MBL|506L Slim French Door Fridge - Non-Plumbed|506|Slim French Door|Matte Black|232324|835|1787|730|gf-ln500mbl/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-ln500mbl/new-gallery-images/450x450/multi-door-f-next8-2026-gc-l22ffqsj-gf-ln500mbl-au-essencemattblack-01-front-450.jpg||1
GF-LN500PL|506L Slim French Door Fridge - Non-Plumbed|506|Slim French Door|Stainless|c3c6ca|835|1787|730|gf-ln500pl/|fridges/gf-ln500pl_apyrgap_ehap_au_c/gallery/GF-LN500PL_basic_img.jpg||1
GF-V500MBLC|508L Slim French Door Fridge with InstaViewᵀᴹ|508|Slim French Door|Matte Black|232324|835|1787|730|gf-v500mblc/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-v500mblc/450x450/multi-door-f-next8-2026-gc-x22ffqrb-gf-v500mblc-au-essencemattblack-01-front1-450.jpg|instaview,did|1
GF-V570MBL|508L Slim French Door Fridge, with InstaView Door-In-Door®, in Matte Black Finish|508|Slim French Door|Matte Black|232324|835|1787|734|gf-v570mbl/|fridges/gf-v570mbl_amcrgap_ehap_au_c/gallery/GF-V570MBL-1.jpg|ice,instaview,did|1
GF-V570MBLC|508L Slim French Door Fridge with Craft Ice™|508|Slim French Door|Matte Black|232324|835|1787|734|gf-v570mblc/|fridges/gf-v570mblc_amcrgap_ehap_au_c/GF-V570MBL_basic_img.jpg|ice,instaview,did|1
GF-V570PNL|508L Slim French Door Fridge - Non-Plumbed|508|Slim French Door|Stainless|c3c6ca|835|1787|734|gf-v570pnl/|fridges/gf-v570pnl_apzrgap_ehap_au_c/GF-V570PNL_APZRGAP_EHAP_AU_C-450x450.jpg|ice,instaview,did|1
GF-VN500PL|508L Slim French Door Fridge with InstaView™|508|Slim French Door|Stainless|c3c6ca|835|1787|730|gf-vn500pl/|fridges/gf-vn500pl_apyrgap_ehap_au_c/no-logo/450x450_GFVN500PL.jpg|instaview|1
GF-B505BB|530L Slim French Door Fridge - Matte Black|530|Slim French Door|Matte Black|232324|835|1787|730|gf-b505bb/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-b505bb/new-gallery-images/450x450/F-Next8_B_Di_GC-B22FFQZB_GF-B505BB_EP_Front-450X450.jpg||1
GF-B505MBL|530L Slim French Door Fridge - Matte Black|530|Slim French Door|Matte Black|232324|835|1787|730|gf-b505mbl/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-b505mbl/new-gallery-images/450x450/multi-door-f-next8-2026-gc-b22ffqvb-gf-b505mbl-au-essencemattblack-01-front-450.jpg||1
GF-B505PL|530L Slim French Door Fridge - Stainless|530|Slim French Door|Stainless|c3c6ca|835|1787|730|gf-b505pl/|fridges/gf-b505pl_apyrgap_ehap_au_c/gallery/GF-B505PL_basic_img.jpg||1
GF-B530BL|530L Slim French Door Fridge - Black Finish|530|Slim French Door|Black|2a2a2b|835|1787|734|gf-b530bl/|fridges/gf-b530bl_awbrgap_ehap_au_c/no-logo/450x450_GFB530BL.jpg||1
GF-B590MBL|530L Slim French Door Fridge - Matte Black Finish|530|Slim French Door|Matte Black|232324|835|1787|734|gf-b590mbl/|fridges/gf-b590mbl_amcrgap_ehap_au_c/gallery/GF-B590MBL_basic_450.jpg||1
GF-B590PL|530L Slim French Door Fridge - Stainless Finish|530|Slim French Door|Stainless|c3c6ca|835|1787|734|gf-b590pl/|fridges/gf-b590pl_apzrgap_ehap_au_c/gallery/GF-B590PL_basic_img.jpg||1
GF-VN600BM|576L French Door Fridge with InstaView™|576|French Door|Black|2a2a2b|835|1777|736|gf-vn600bm/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-vn600bm/gallery-images/450x450/multi-door-t-vn7-2025-gv-k23ffgeb-gf-vn600bm-au-blackmirror-02-front-food-450x450.jpg|instaview|1
GF-B589PLE|589L French Door Fridge in Stainless Finish|589|French Door|Stainless|c3c6ca|836|1776|731|gf-b589ple/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/gf-b589ple/gallery-images/450x450/01_Raptor7_GV-B218FLCB_GF-B589PLE_PY_Front.jpg||1
GF-D613PL|613L Door-In-Door® French Door Fridge With Ice & Water Dispenser|613|French Door|Stainless|c3c6ca|908|1771|763|gf-d613pl/|fridges/gf-d613pl_apzrgap_ehap_au_c/gallery/1 GF-D613PL_02_Large.jpg|ice,did|1
GF-L613PL|613L French Door Fridge with Ice & Water Dispenser|613|French Door|Stainless|c3c6ca|915|1780|745|gf-l613pl/|fridges/gf-l613pl_apzrgap_ehap_au_c/gallery/GF-L613PL_gallery_1.jpg|ice|1
GF-MV600|617L French Door Fridge - MoodUP® LED Panels|617|French Door|Matte White|ecebe7|914|1865|687|gf-mv600/|fridges/gf-mv600_annrgap_ehap_au_c/gallery/GF-MV600_basic_img.jpg|moodup|1
GF-B620BSL|620L French Door Fridge, in Black Stainless Steel|620|French Door|Black Stainless|3c3d40|908|1771|763|gf-b620bsl/|fridges/gf-b620bsl_asbrgap_ehap_au_c/gallery/medium01.jpg||1
GF-B620PL|620L French Door Fridge in Anti-fingerprint Stainless Finish|620|French Door|Stainless|c3c6ca|908|1771|763|gf-b620pl/|fridges/gf-b620pl_apzrgap_ehap_au_c/gallery/GF-B620PL_01_Large.jpg||1
GF-B620SL|620L French Door Refrigerator with Auto Ice Maker|620|French Door|Stainless|c3c6ca|915|1780|763|gf-b620sl/|fridges/gf-b620sl_astrgap_ehap_au_c/gallery/Majesty_Large_01.jpg||1
GF-LN700MBL|636L French Door Fridge - Non-Plumbed|636|French Door|Matte Black|232324|914|1792|733|gf-ln700mbl/|fridges/gf-ln700mbl_aevrgap_ehap_au_c/gallery/GF-LN700MBL_basic_img.jpg||1
GF-LN700PL|636L French Door Fridge - Non-Plumbed|636|French Door|Stainless|c3c6ca|914|1792|733|gf-ln700pl/|fridges/gf-ln700pl_apyrgap_ehap_au_c/gallery/GF-LN700PL_basic_img.jpg||1
GF-D706BSL|637L French Door Fridge, with Door-In-Door®, in Black Stainless Finish|637|French Door|Black Stainless|3c3d40|915|1787|744|gf-d706bsl/|fridges/gf-d706bsl_asbrgap_ehap_au_c/gallery/D-001.jpg|ice,did|1
GF-D706MBL|637L French Door Fridge, with Door-In-Door®, in Matte Black Finish|637|French Door|Matte Black|232324|915|1787|744|gf-d706mbl/|fridges/gf-d706mbl_amcrgap_ehap_au_c/gallery/D-001.jpg|ice,did|1
GF-L700MBL|637L French Door Fridge - Plumbed|637|French Door|Matte Black|232324|914|1792|729|gf-l700mbl/|fridges/gf-l700mbl_aevrgap_ehap_au_c/gallery/GF-L700MBL_basic_img.jpg||1
GF-L700MWH|637L French Door Fridge - Plumbed|637|French Door|Matte White|ecebe7|914|1792|729|gf-l700mwh/|fridges/gf-l700mwh_aehrgap_ehap_au_c/gallery/GF-L700MWH_basic_img.jpg||1
GF-L700PL|637L French Door Fridge - Plumbed|637|French Door|Stainless|c3c6ca|914|1792|729|gf-l700pl/|fridges/gf-l700pl_apyrgap_ehap_au_c/gallery/GF-L700PL_basic_img.jpg||1
GF-L706MBL|637L French Door Fridge in Matte Black Finish|637|French Door|Matte Black|232324|915|1793|744|gf-l706mbl/|fridges/gf-l706mbl_amcrgap_ehap_au_c/gallery/D-001.jpg|ice|1
GF-L706PL|637L French Door Fridge with Ice & Water Dispenser in Stainless Finish|637|French Door|Stainless|c3c6ca|915|1793|744|gf-l706pl/|fridges/gf-l706pl_apzrgap_ehap_au_c/gallery/D-001.jpg|ice|1
GF-V706BSL|637L French Door Fridge, with InstaView Door-In-Door®, in Black Stainless Finish|637|French Door|Black Stainless|3c3d40|915|1793|744|gf-v706bsl/|fridges/gf-v706bsl_asbrgap_ehap_au_c/gallery/GF-V706BSL-1.jpg|ice,instaview,did|1
GF-V706BSLC|637L French Door Fridge with Craft Ice™|637|French Door|Black Stainless|3c3d40|912|1793|744|gf-v706bslc/|fridges/gf-v706bslc_asbrgap_ehap_au_c/GF-V706BSLC_ASBRGAP_EHAP_AU_C-450x450.jpg|ice,instaview,did|1
GF-V706MBL|637L French Door Fridge, with InstaView Door-In-Door®, in Matte Black finish|637|French Door|Matte Black|232324|915|1793|744|gf-v706mbl/|fridges/gf-v706mbl_amcrgap_ehap_au_c/gallery/GF-V706MBL-1.jpg|ice,instaview,did|1
GF-V706MBLC|637L French Door Fridge in Matte Black Finish|637|French Door|Matte Black|232324|915|1793|744|gf-v706mblc/|fridges/gf-v706mblc_amcrgap_ehap_au_c/GF-V706MBLC_AMCRGAP_EHAP_AU_C-450x450.jpg|ice,instaview,did|1
GF-D700BSLC|638L French Door Fridge with Craft Ice™|638|French Door|Black Stainless|3c3d40|914|1792|729|gf-d700bslc/|fridges/gf-d700bslc_asbrgap_ehap_au_c/gallery/GF-D700BSLC_basic_img.jpg|did|1
GF-D700MBLC|638L French Door Fridge with Craft Ice™|638|French Door|Matte Black|232324|914|1792|729|gf-d700mblc/|fridges/gf-d700mblc_aevrgap_ehap_au_c/gallery/GF-D700MBLC_basic_img.jpg|did|1
SG-5I700TSL|LG SIGNATURE 640L French Door Fridge|640|French Door|Stainless|c3c6ca|912|1788|758|sg-5i700tsl/|https://www.lg.com/content/dam/channel/wcms/au/home-appliances/fridge/SG-5I700TSL/SG-5I700TSL_Basic_img.jpg||1
GF-V700BSLC|642L French Door Fridge with InstaView™|642|French Door|Black Stainless|3c3d40|914|1792|729|gf-v700bslc/|fridges/gf-v700bslc_asbrgap_ehap_au_c/gallery/new_0008_GF-V700BSLC_FDF_450.jpg|instaview,did|1
GF-V700MBLC|642L French Door Fridge with InstaView™|642|French Door|Matte Black|232324|914|1792|729|gf-v700mblc/|fridges/gf-v700mblc_aevrgap_ehap_au_c/no-logo/450x450_GFV700MBLC.jpg|instaview,did|1
GF-B730MBL|664L French Door Fridge in Matte Black Finish|664|French Door|Matte Black|232324|915|1787|739|gf-b730mbl/|fridges/gf-b730mbl_amcrgap_ehap_au_c/gallery/D-001.jpg||1
GF-B730PL|664L French Door Fridge in Stainless Finish|664|French Door|Stainless|c3c6ca|915|1787|739|gf-b730pl/|fridges/gf-b730pl_apzrgap_ehap_au_c/gallery/D-001.jpg||1
GF-B700MBL|665L French Door Fridge - Matte Black Finish|665|French Door|Matte Black|232324|914|1787|725|gf-b700mbl/|fridges/gf-b700mbl_aevrgap_ehap_au_c/gallery/GF-B700MBL_basic_img.jpg||1
GF-B700PL|665L French Door Fridge - Stainless Finish|665|French Door|Stainless|c3c6ca|914|1787|725|gf-b700pl/|fridges/gf-b700pl_apyrgap_ehap_au_c/gallery/GF-B700PL_basic_img.jpg||1
GF-B705MBL|665L French Door Fridge - 5 Star Energy|665|French Door|Matte Black|232324|914|1787|725|gf-b705mbl/|fridges/gf-b705mbl_aevrgap_ehap_au_c/gallery/GF-B705MBL_basic_img.jpg||1
GF-AD701SL|701L Door-in-Door® French Door Fridge with CustomChill™ Drawer|701|French Door|Stainless|c3c6ca|912|1790|820|gf-ad701sl/|fridges/gf-ad701sl_astrgap_ehap_au_c/gallery/large01.jpg|did|1
GF-D708BSL|708L French Door Fridge, with Door-in-Door®, in Black Stainless Steel|708|French Door|Black Stainless|3c3d40|912|1802|759|gf-d708bsl/|fridges/gf-d708bsl_asbrgap_ehap_au_c/gallery/medium01.jpg|ice,did|1
GF-D708MBSL|708L French Door Fridge, with Door-in-Door®, in Matte Black Stainless Steel|708|French Door|Black Stainless|3c3d40|912|1802|759|gf-d708mbsl/|fridges/gf-d708mbsl_amtrgap_ehap_au_c/GF-D708MBSL_AMTRGAP_EHAP_AU_C-450x450.jpg|ice,did|1
GF-L708PL|708L French Door Fridge, in Brushed Steel Finish|708|French Door|Brushed Steel|a9adb1|912|1802|759|gf-l708pl/|fridges/gf-l708pl_ansrgap_ehap_au_c/gallery/medium01.jpg|ice|1
GF-V708BSL|708L French Door Fridge, with InstaView Door-in-Door®, in Black Stainless Steel|708|French Door|Black Stainless|3c3d40|912|1802|759|gf-v708bsl/|fridges/gf-v708bsl_asbrgap_ehap_au_c/GF-V708BSL_ASBRGAP_EHAP_AU_C-450x450.jpg|ice,instaview,did|1
GF-V708MBSL|708L French Door Fridge, with InstaView Door-in-Door®, in Matte Black Stainless Steel|708|French Door|Black Stainless|3c3d40|912|1802|759|gf-v708mbsl/|fridges/gf-v708mbsl_amtrgap_ehap_au_c/GF-V708MBSL_AMTRGAP_EHAP_AU_C-450x450.jpg|ice,instaview,did|1
GF-5D712BSL|712L French Door Fridge, with Door-In-Door®, in Black Stainless Steel|712|French Door|Black Stainless|3c3d40|912|1800|758|gf-5d712bsl/|fridges/gf-5d712bsl_asbrgap_ehap_au_c/GF-5D712BSL_ASBRGAP_EHAP_AU_C-450x450.jpg|did|2
GF-5D712SL|712L French Door Fridge with Door-In-Door®|712|French Door|Stainless|c3c6ca|910|1808|758|gf-5d712sl/|fridges/gf-5d712sl_astrgap_ehap_au_c/gallery/Ref-Desktop1.jpg|did|2
GF-5L712PL|712L French Door Fridge with Anti-fingerprint Brushed Finish|712|French Door|Brushed Steel|a9adb1|910|1808|758|gf-5l712pl/|fridges/gf-5l712pl_ansrgap_ehap_au_c/gallery/1 P-Next6_GF-5L712PL.ANSRGAP_Front_Large.jpg||1
GF-D725BML|725L French Door Fridge, with Dual Door-In-Door®, in Black Mirror Glass Finish|725|French Door|Black|2a2a2b|912|1797|758|gf-d725bml/|fridges/gf-d725bml_abmrgap_ehap_au_c/gallery/medium01.jpg|did|2
GF-SD730SL|730L Door-in-Door® French Door Fridge with Slim Ice Maker|730|French Door|Stainless|c3c6ca|912|1790|805|gf-sd730sl/|fridges/gf-sd730sl_astrgap_ehap_au_c/gallery/01_GF-SD730SL_Front_DID_Open_Food_1100X730.jpg|did|2
GF-V900MBLC|847L French Door Fridge with InstaView™|847|French Door|Matte Black|232324|914|1792|918|gf-v900mblc/|fridges/gf-v900mblc_aevrgap_ehap_au_c/no-logo/450x450_GFV900MBLC.jpg|instaview,did|2
GF-V910MBLC|847L French Door Fridge in Matte Black Finish|847|French Door|Matte Black|232324|912|1793|919|gf-v910mblc/|fridges/gf-v910mblc_amcrgap_ehap_au_c/gallery/D-001.jpg|instaview,did|2
GF-V910MBL|852L French Door Fridge, with InstaView Door-In-Door®, in Matte Black finish|852|French Door|Matte Black|232324|915|1793|933|gf-v910mbl/|fridges/gf-v910mbl_amcrgap_ehap_au_c/gallery/GF-V910MBL-1.jpg|instaview,did|2
GF-5D906SL|906L Door-in-Door® French Door Fridge with Ice & Water Dispenser|906|French Door|Stainless|c3c6ca|912|1800|915|gf-5d906sl/|fridges/gf-5d906sl_astrgap_ehap_au_c/gallery/1 GF-5D906SL_Front_Large.jpg|ice,did|2
GP-5D906BSL|906L Door-In-Door® French Door Fridge With Triple Filtered Ice & Water|906|French Door|Black Stainless|3c3d40|912|1797|923|gp-5d906bsl/|fridges/gp-5d906bsl_asbrgap_ehap_au_c/gallery/GP-5D906BSL_Front.jpg|ice,did|2
GF-V910MBSL|910L French Door Fridge, with InstaView Door-in-Door®, in Matte Black Stainless Steel|910|French Door|Black Stainless|3c3d40|912|1802|924|gf-v910mbsl/|fridges/gf-v910mbsl_amtrgap_ehap_au_c/GF-V910MBSL_AMTRGAP_EHAP_AU_C-450x450.jpg|instaview,did|2
`;

const PAGE = 'https://www.lg.com/au/fridge-freezers/french-door/';
const IMG = 'https://www.lg.com/content/dam/channel/wcms/au/images/';

export const LG_FRIDGES: LgFridge[] = ROWS.trim()
  .split('\n')
  .map((line) => {
    const [model, name, litres, short, finish, hex, w, h, d, page, image, features, drawers] = line.split('|');
    return {
      model,
      name,
      litres: Number(litres),
      short,
      finish,
      hex: `#${hex}`,
      width: Number(w),
      height: Number(h),
      depth: Number(d),
      url: PAGE + page,
      image: image ? (image.startsWith('http') ? image : IMG + image) : '',
      features: (features ? features.split(',') : []) as LgFeature[],
      drawers: (Number(drawers) === 2 ? 2 : 1) as 1 | 2,
      blurb: `${name}.`,
    };
  });

/** Catalogue item type for a model. */
export const lgFridgeType = (model: string) => `lg_${model.toLowerCase()}`;

export const LG_FRIDGE_BY_TYPE: Record<string, LgFridge> = Object.fromEntries(LG_FRIDGES.map((f) => [lgFridgeType(f.model), f]));
