import { useEffect, useState } from 'react';

/**
 * Terms of use and privacy policy: a pop-up (openLegal('terms' | 'privacy') from anywhere) and a one-time notice
 * on first visit. Plain English on purpose.
 */

export type LegalTab = 'terms' | 'privacy' | 'disclosure';
const UPDATED = '15 October 2026';
/** Bump when the terms change, so the first-visit notice shows again. */
const VERSION = '2026-10-15';
const ACCEPT_KEY = 'home-designer:termsAccepted';

export function openLegal(tab: LegalTab = 'terms') {
  window.dispatchEvent(new CustomEvent('home-designer:legal', { detail: tab }));
}

function accepted() {
  try {
    return localStorage.getItem(ACCEPT_KEY) === VERSION;
  } catch {
    return false;
  }
}

export default function Legal() {
  const [tab, setTab] = useState<LegalTab | null>(null);
  const [notice, setNotice] = useState(() => !accepted());
  useEffect(() => {
    const onOpen = (e: Event) => setTab(((e as CustomEvent).detail as LegalTab) ?? 'terms');
    window.addEventListener('home-designer:legal', onOpen);
    return () => window.removeEventListener('home-designer:legal', onOpen);
  }, []);
  useEffect(() => {
    if (!tab) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setTab(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tab]);
  const accept = () => {
    try {
      localStorage.setItem(ACCEPT_KEY, VERSION);
    } catch {
      // ignore
    }
    setNotice(false);
  };

  return (
    <>
      {notice && !tab && (
        <div className="legal-notice" role="dialog" aria-label="Before you start">
          <p>
            <b>Home Designer is a design and visualisation tool only.</b> It isn’t building, structural or engineering advice, and its
            measurements and estimates are approximate. Check everything with a qualified professional before you build or buy. Your
            designs stay in your browser.
          </p>
          <div className="legal-notice-actions">
            <button onClick={() => setTab('terms')}>Terms of Service</button>
            <button onClick={() => setTab('privacy')}>Privacy Policy</button>
            <button className="primary" onClick={accept}>
              I understand
            </button>
          </div>
        </div>
      )}
      {tab && (
        <div className="legal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setTab(null)}>
          <div className="legal-modal" role="dialog" aria-modal="true" aria-label={tab === 'terms' ? 'Terms of Service' : tab === 'privacy' ? 'Privacy Policy' : 'Brand Disclosure'}>
            <div className="legal-head">
              <div className="seg">
                <button className={tab === 'terms' ? 'active' : ''} onClick={() => setTab('terms')}>
                  Terms of Service
                </button>
                <button className={tab === 'privacy' ? 'active' : ''} onClick={() => setTab('privacy')}>
                  Privacy Policy
                </button>
                <button className={tab === 'disclosure' ? 'active' : ''} onClick={() => setTab('disclosure')}>
                  Brand Disclosure
                </button>
              </div>
              <button className="legal-close" onClick={() => setTab(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="legal-body">{tab === 'terms' ? <Terms /> : tab === 'privacy' ? <Privacy /> : <Disclosure />}</div>
            {notice && (
              <div className="legal-foot">
                <button
                  className="primary"
                  onClick={() => {
                    accept();
                    setTab(null);
                  }}
                >
                  I understand
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Terms() {
  return (
    <article>
      <h2>Terms of Service</h2>
      <p className="legal-updated">Last updated {UPDATED}</p>
      <p className="legal-short">
        <b>The short version:</b> this is a sketching and visualisation tool for ideas. Don’t build, knock down, buy or sign anything
        based only on what it shows. Please don’t remove a load-bearing wall because a website made it look fine. Check everything
        with a qualified professional. If you rely on it anyway, that’s on you.
      </p>

      <h3>1. What Home Designer is</h3>
      <p>
        Home Designer is a free, hobby-built tool for sketching floor plans, trying out finishes and furniture, and seeing a rough 3D
        version of a home. By using it you agree to these terms. If you don’t agree, please don’t use it.
      </p>

      <h3>2. It is not professional advice</h3>
      <p>Nothing in Home Designer is architectural, structural, engineering, building, surveying, plumbing, electrical or other professional advice. In particular, it:</p>
      <ul>
        <li>doesn’t check structural adequacy, load-bearing walls, bracing, footings, roof framing or spans;</li>
        <li>isn’t certified against the National Construction Code, Australian Standards, council rules, bushfire (BAL), waterproofing, energy or accessibility requirements;</li>
        <li>can’t tell you whether work needs approval, a permit or a licensed trade.</li>
      </ul>
      <p>
        Before any building or renovation work, get advice from appropriately qualified and licensed people (for example a builder,
        architect or building designer, structural engineer, building certifier and your council), and follow it.
      </p>

      <h3>3. Measurements, quantities and checks are estimates</h3>
      <p>
        Areas, dimensions, roof shapes, flooring, plasterboard, cornice and skirting quantities, door clearance checks and similar
        figures are worked out from what you draw, with simplifying assumptions. They may be wrong or incomplete. Measure on site and
        confirm quantities with your supplier or tradesperson before ordering or building.
      </p>

      <h3>4. Products, brands and colours</h3>
      <p>
        Home Designer refers to real products and ranges (for example doors, paints, appliances, skylights and furniture) to make
        designs feel realistic. Models are approximations based on publicly available information and may not match the real
        product, its sizes, options, availability or price. Paint and finish colours are screen approximations: always check a physical
        sample. Brand and product names belong to their owners. Home Designer isn’t affiliated with, endorsed or sponsored by any of
        them.
      </p>

      <h3>5. Your designs</h3>
      <p>
        Your designs are yours. They’re kept in your own browser and in any files you save; Home Designer has no server copy and can’t
        recover lost work, so save and back up anything you care about.
      </p>

      <h3>6. Provided “as is”</h3>
      <p>
        Home Designer is provided free, “as is” and “as available”. It may contain errors, change, or stop working or being available
        at any time, without notice.
      </p>

      <h3>7. Liability</h3>
      <p>
        To the maximum extent permitted by law, the author of Home Designer isn’t liable for any loss, damage, cost or injury (including
        building defects, rework, purchases, delays or lost data) arising from using, or relying on, Home Designer or anything it shows.
      </p>
      <p>
        Nothing in these terms excludes, restricts or modifies any right or remedy you have under the Australian Consumer Law or other
        law that can’t lawfully be excluded.
      </p>

      <h3>8. The fun bits</h3>
      <p>
        The walk-through’s music and hidden extras are just for fun. Music is streamed by YouTube under YouTube’s own terms; you can turn
        it off in the walk-through panel.
      </p>

      <h3>9. Changes</h3>
      <p>
        These terms may be updated from time to time; the date above shows when. Continuing to use Home Designer after a change means you
        accept the updated terms. These terms are governed by the laws of Australia.
      </p>
    </article>
  );
}

function Privacy() {
  return (
    <article>
      <h2>Privacy Policy</h2>
      <p className="legal-updated">Last updated {UPDATED}</p>
      <p className="legal-short">
        <b>The short version:</b> there are no accounts, no analytics and no tracking in Home Designer, and your designs never leave
        your device. The only outside services involved are the website host, YouTube if you play the walk-through music, and brand websites for product photos when you open a product card.
      </p>

      <h3>What Home Designer doesn’t collect</h3>
      <p>
        Home Designer doesn’t ask for your name, email or any other personal information, doesn’t use analytics or advertising, and
        doesn’t set cookies of its own. There’s no server that receives or stores your designs.
      </p>

      <h3>What’s stored on your device</h3>
      <ul>
        <li>
          <b>In your browser</b> (local storage, only for this website): an autosave of your current design, and preferences such as
          panel layout, render quality, paint range, calculator settings and whether the walk-through music is on.
        </li>
        <li>
          <b>Files you save</b> (<code>.home.json</code>, PNG or SVG exports) stay wherever you put them.
        </li>
      </ul>
      <p>
        None of this is sent anywhere. You can remove it at any time by clearing this site’s data in your browser settings (this also
        removes the autosave, so save your design to a file first).
      </p>

      <h3>Third-party services</h3>
      <ul>
        <li>
          <b>Website hosting.</b> Like any website, the server that delivers the app (for example GitHub Pages) may log technical
          details such as your IP address and browser type, under the host’s own privacy policy.
        </li>
        <li>
          <b>YouTube.</b> The walk-through music is played by YouTube’s embedded player. When it loads, YouTube (Google) may set cookies
          and collect information under Google’s privacy policy. It only loads when you start a walk-through with music on, or type a
          certain cheat code. Turn the music off in the walk-through panel and the player isn’t loaded.
        </li>
        <li>
          <b>Product photos.</b> When a product card opens, its photo is loaded straight from the brand’s or retailer’s website
          (for example ABI Interiors), which can see that request like any website visit. No referrer is sent with it.
        </li>
        <li>
          <b>Links</b> to paint makers and product pages (e.g. Dulux, Porter’s Paints) open their websites, which have their own privacy
          policies.
        </li>
      </ul>

      <h3>Australian Privacy Act</h3>
      <p>
        Because Home Designer doesn’t collect personal information, there’s nothing held about you to access or correct. If you contact the
        author (for example through the project’s GitHub page), whatever you send is used only to reply and isn’t shared.
      </p>

      <h3>Changes</h3>
      <p>If this policy changes, the date above will be updated.</p>
    </article>
  );
}

/** Brands that appear in Home Designer, and what they're used for. */
const BRANDS: { name: string; url: string; what: string }[] = [
  { name: 'ABI Interiors', url: 'https://www.abiinteriors.com.au/', what: 'Bathroom, kitchen and laundry fixtures and tapware' },
  { name: 'Bunnings (Pinnacle)', url: 'https://www.bunnings.com.au/', what: 'Garage shelving' },
  { name: 'COLORBOND® steel (BlueScope)', url: 'https://colorbond.com/', what: 'Roof and garage door colours' },
  { name: 'Corinthian Doors', url: 'https://www.corinthian.com.au/', what: 'Internal and entrance door designs' },
  { name: 'Dulux', url: 'https://www.dulux.com.au/', what: 'Paint colours' },
  { name: 'Front Porch Properties', url: 'https://frontporchproperties.com.au/', what: 'Entrance doors and sidelites' },
  { name: 'Gyprock', url: 'https://www.gyprock.com.au/', what: 'Mentioned in the plasterboard calculator' },
  { name: 'Harvey Norman', url: 'https://www.harveynorman.com.au/', what: 'Lombardozzi buffet' },
  { name: 'Jinko Solar', url: 'https://jinkosolar.com.au/', what: 'Solar panels' },
  { name: 'SunPower (Maxeon)', url: 'https://www.sunpowerglobal.com/au', what: 'Solar panels' },
  { name: 'Trina Solar', url: 'https://www.trinasolar.com/au/', what: 'Solar panels' },
  { name: 'Hume Doors', url: 'https://www.humedoors.com.au/', what: 'Entrance and internal door designs' },
  { name: 'Panasonic', url: 'https://www.panasonic.com/au/', what: 'Split system air conditioner' },
  { name: 'Porter’s Paints', url: 'https://www.porterspaints.com/', what: 'Paint colours' },
  { name: 'Provincial Home Living', url: 'https://www.provincialhomeliving.com.au/', what: 'Rochester buffet & hutch' },
  { name: 'Timberline', url: 'https://timberline.com.au/', what: 'Bathroom vanities' },
  { name: 'VELUX', url: 'https://www.velux.com.au/', what: 'Skylights and Sun Tunnels' },
];

function Disclosure() {
  return (
    <article>
      <h2>Brand Disclosure</h2>
      <p className="legal-updated">Last updated {UPDATED}</p>
      <p className="legal-short">
        <b>The short version:</b> the brands in Home Designer are here because I like them and they make designs feel real. Nobody pays
        for them to be here. There are no sponsorships, kickbacks, affiliate links or freebies.
      </p>

      <h3>No sponsorship or payment</h3>
      <p>
        Home Designer isn’t sponsored by, affiliated with, or endorsed by any of the brands below, and receives nothing from them: no
        money, commissions, referral or affiliate fees, free or discounted products, or any other benefit. Product and website links
        are plain links with no tracking or referral codes. Their inclusion isn’t a recommendation for your particular project, so
        compare options and get professional advice.
      </p>

      <h3>Brands that appear</h3>
      <table className="area-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Used for</th>
          </tr>
        </thead>
        <tbody>
          {BRANDS.map((b) => (
            <tr key={b.name}>
              <td>
                <a href={b.url} target="_blank" rel="noopener noreferrer">
                  {b.name}
                </a>
              </td>
              <td>{b.what}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Product details and colours</h3>
      <p>
        Product names, sizes, colours and prices come from each brand’s public website at the time they were added, and may since have
        changed. 3D models are approximations, and screen colours are approximate. Check with the brand or retailer before you buy.
        All trademarks belong to their owners.
      </p>

      <h3>Music</h3>
      <p>
        The walk-through music (Sabrina Carpenter’s “House Tour”, and a Doom soundtrack video for a certain cheat code) is played from
        YouTube with YouTube’s own player. There’s no affiliation with the artists, labels, id Software or YouTube.
      </p>
    </article>
  );
}
