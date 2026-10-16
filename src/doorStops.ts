/**
 * Door stops from ABI Interiors (abiinteriors.com.au, door hardware → door stops; fetched 2026-10-16). Both Kolton
 * stops are 304 stainless steel cylinders, 51.5 mm across with a 74.5 mm projection, and can be wall or floor
 * mounted. Finish colours are approximations.
 */

export interface DoorStopProduct {
  slug: string;
  name: string;
  finish: string;
  hex: string;
  magnetic: boolean;
  image: string;
  description: string;
}

/** Published size of the Kolton stops (mm). */
export const DOOR_STOP_SIZE = { diameter: 51.5, projection: 74.5 };

const IMG = 'https://media.abiinteriors.com/8266KQUL/at/';
const KOLTON = 'A minimal stainless steel door stop that stops the door handle hitting the wall; wall or floor mounted, with fitting screws.';
const MAGNETIC = 'A magnetic stainless steel door stop with a PVD finish: it holds the door open as well as stopping it; wall or floor mounted.';

// slug | finish | hex | magnetic | image (under ABI's media path)
const ROWS = `
kolton-door-stop-brushed-brass|Brushed Brass|b8955a|0|7fcrxhh3kzj8bp6tkcbrwjfv/Kolton_Door_Stop_-_Brushed_Brass_-_Feature.jpg?format=png&crop=1077%2C1080%2Cx3%2Cy0&pad=0%2C3%2C0%2C0
kolton-door-stop-brushed-copper|Brushed Copper|b87333|0|4w8x3x2cw4jb2k9kh6p2xrz/Kolton_Door_Stop_-_Brushed_Copper_-_Feature.jpg?format=png&crop=1078%2C1080%2Cx0%2Cy0&pad=0%2C0%2C0%2C2
kolton-door-stop-brushed-gunmetal|Brushed Gunmetal|4c4d4f|0|k8swtwfk33qhwz83czf95nnw/Kolton_Door_Stop_-_Brushed_Gunmetal_-_Feature.jpg?format=png&crop=1079%2C1080%2Cx1%2Cy0&pad=0%2C1%2C0%2C0
kolton-door-stop-matte-black|Matte Black|222222|0|9v6tpxskqsbcfq5jbx9t9cqj/Kolton_Door_Stop_-_Matte_Black_-_Feature.jpg?format=png&crop=1078%2C1080%2Cx2%2Cy0&pad=0%2C2%2C0%2C0
kolton-door-stop-stainless-steel|Stainless Steel|c0c3c6|0|64fqnpx4fpfgjqf5n54wscgx/Kolton_Door_Stop_-_Stainless_Steel_-_Feature.jpg?format=png&crop=1080%2C1080%2Cx0%2Cy0
kolton-magnetic-door-stop-antique-aurum|Antique Aurum|a8874f|1|v888mgpt4njmvxbmrvkr425/17723-Kolton%20Magnetic%20Door%20Stop_Side_Antique%20Aurum.png?trim=-0.01,0.03,0.01,0.02&width=1080&height=1080&format=jpg
kolton-magnetic-door-stop-antique-bronze|Antique Bronze|6e5a43|1|kqgv952hmvb99x66pn973pxf/17724-Kolton%20Magnetic%20Door%20Stop_Side_Antique%20Bronze.png?trim=-0.01,0.03,0.01,0.02&width=1080&height=1080&format=jpg
kolton-magnetic-door-stop-antique-slate|Antique Slate|55585b|1|ffxrck2h2367xq2855r33rtm/17725-Kolton%20Magnetic%20Door%20Stop_Side_Antique%20Slate.png?trim=-0.01,0.03,0.01,0.02&width=1080&height=1080&format=jpg
kolton-magnetic-door-stop-antique-steel|Antique Steel|8e9194|1|89tvkbsqgv3twxmb7xtkx927/17726-Kolton%20Magnetic%20Door%20Stop_Side_Antique%20Steel.png?trim=-0.01,0.03,0.01,0.02&width=1080&height=1080&format=jpg
`;

export const DOOR_STOPS: DoorStopProduct[] = ROWS.trim()
  .split('\n')
  .map((line) => {
    const [slug, finish, hex, magnetic, image] = line.split('|');
    const mag = magnetic === '1';
    return {
      slug,
      name: `Kolton ${mag ? 'Magnetic ' : ''}Door Stop – ${finish}`,
      finish,
      hex: `#${hex}`,
      magnetic: mag,
      image: IMG + image,
      description: mag ? MAGNETIC : KOLTON,
    };
  });

export const DEFAULT_DOOR_STOP = 'kolton-door-stop-stainless-steel';

export const doorStopProduct = (slug: string | undefined) => DOOR_STOPS.find((p) => p.slug === slug) ?? DOOR_STOPS.find((p) => p.slug === DEFAULT_DOOR_STOP)!;

export const doorStopUrl = (slug: string) => `https://www.abiinteriors.com.au/product/${slug}/`;
