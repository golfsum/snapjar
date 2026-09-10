// Writes the public marketing/SEO HTML pages from one footer and nav.
// Run: node scripts/build-seo-pages.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const ORIGIN = "https://getsnapjar.com";

const LINKS = {
  events: [
    ["/wedding", "Weddings"],
    ["/birthday", "Birthdays"],
    ["/baby-shower", "Baby showers"],
    ["/bridal-shower", "Bridal showers"],
    ["/bachelorette", "Bachelorette parties"],
    ["/engagement-party", "Engagement parties"],
    ["/rehearsal-dinner", "Rehearsal dinners"],
    ["/graduation", "Graduations"],
    ["/family-reunion", "Family reunions"],
    ["/quinceanera", "Quinceañeras"],
    ["/bar-mitzvah", "Bar and bat mitzvahs"],
    ["/anniversary", "Anniversaries"],
    ["/holiday-party", "Holiday parties"],
    ["/office-party", "Office parties"],
    ["/gender-reveal", "Gender reveals"],
    ["/retirement-party", "Retirement parties"]
  ],
  product: [
    ["/how-it-works", "How it works"],
    ["/pricing", "Pricing"],
    ["/faq", "FAQ"],
    ["/qr-code-photo-sharing", "QR photo sharing"]
  ],
  compare: [
    ["/guestpix-alternative", "Guestpix alternative"],
    ["/wedibox-alternative", "Wedibox alternative"],
    ["/pov-alternative", "POV alternative"],
    ["/google-photos-shared-album", "vs Google Photos"]
  ],
  for: [
    ["/for-photographers", "Photographers"],
    ["/for-wedding-planners", "Wedding planners"]
  ]
};

const CATALOG = Object.fromEntries(
  [...LINKS.events, ...LINKS.product, ...LINKS.compare, ...LINKS.for,
    ["/contact", "Contact"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"]
  ].map(([href, label]) => [href.slice(1), { href, label }])
);

function footerHtml() {
  const col = (title, items) =>
    `<div><h3>${title}</h3>${items.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</div>`;
  return `<footer class="site-foot">
  <div class="site-foot-grid">
    <div class="site-foot-brand">
      <a class="logo" href="/"><img class="logo-mark" src="/assets/logo.svg" alt="Snapjar"><span class="logo-txt">snap<i>jar</i></span></a>
      <p>QR photo sharing for weddings and parties. Guests scan a code. Every photo lands in one album.</p>
    </div>
    ${col("Events", LINKS.events)}
    ${col("Product", LINKS.product)}
    ${col("Compare", LINKS.compare)}
    ${col("For vendors", [...LINKS.for, ["/contact", "Contact"], ["/privacy", "Privacy"], ["/terms", "Terms"]])}
  </div>
  <div class="site-foot-bottom">
    <span>Snapjar</span>
    <span class="footer-links">
      <a href="/contact">support@getsnapjar.com</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </span>
  </div>
</footer>`;
}

function relatedHtml(slugs) {
  const items = slugs
    .map((slug) => CATALOG[slug])
    .filter(Boolean)
    .map(({ href, label }) => `<a href="${href}">${label}</a>`)
    .join("");
  return `<section class="section">
    <h2>Keep looking around</h2>
    <p class="section-sub">Same product, different nights.</p>
    <div class="related">${items}</div>
  </section>`;
}

function faqHtml(faq) {
  if (!faq?.length) return "";
  const items = faq.map((item) =>
    `<details><summary>${item.q}</summary><p>${item.a}</p></details>`
  ).join("");
  return `<section class="section section-alt">
    <h2>Questions people actually ask</h2>
    <div class="faq">${items}</div>
  </section>`;
}

function faqLd(faq, url) {
  if (!faq?.length) return "";
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q.replace(/<[^>]+>/g, ""),
      acceptedAnswer: { "@type": "Answer", text: item.a.replace(/<[^>]+>/g, "") }
    }))
  };
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
}

function stepsHtml(title, steps) {
  if (!steps?.length) return "";
  const cards = steps.map((s, i) =>
    `<div class="step"><div class="step-num">${i + 1}</div><h3>${s.h}</h3><p>${s.p}</p></div>`
  ).join("");
  return `<section class="section">
    <h2>${title}</h2>
    <div class="steps">${cards}</div>
  </section>`;
}

function splitHtml(block) {
  if (!block) return "";
  const paras = block.ps.map((p) => `<p>${p}</p>`).join("");
  return `<section class="section section-alt">
    <div class="split">
      <div>
        <h2>${block.h}</h2>
        ${paras}
      </div>
      <div class="quote-card">
        <p>"${block.quote}"</p>
        <span>${block.by}</span>
      </div>
    </div>
  </section>`;
}

function wrap({ slug, title, description, eyebrow, h1, lede, cta, ctaHref = "/create", crumb, stepsTitle, steps, split, extra = "", faq, related }) {
  const path = `/${slug}`;
  const url = `${ORIGIN}${path}`;
  const crumbLabel = crumb || h1;
  const pageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
    isPartOf: { "@type": "WebSite", name: "Snapjar", url: ORIGIN }
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: crumbLabel, item: url }
    ]
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#faf6ef">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="Snapjar">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ORIGIN}/assets/img/og.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ORIGIN}/assets/img/og.jpg">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/style.css">
  <script type="application/ld+json">
${JSON.stringify(pageLd, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumbLd, null, 2)}
  </script>
  ${faqLd(faq, url)}
  <script src="/assets/analytics.js" defer></script>
</head>
<body>
  <nav class="nav">
    <a class="logo" href="/"><img class="logo-mark" src="/assets/logo.svg" alt="Snapjar"><span class="logo-txt">snap<i>jar</i></span></a>
    <div class="nav-links">
      <a href="/how-it-works">How it works</a>
      <a href="/pricing">Pricing</a>
      <a href="/create" class="btn btn-small">Start an album</a>
    </div>
  </nav>
  <p class="crumbs"><a href="/">Home</a><span>/</span>${crumbLabel}</p>
  <header class="page-hero">
    <p class="eyebrow">${eyebrow}</p>
    <h1>${h1}</h1>
    <p>${lede}</p>
    <a href="${ctaHref}" class="btn btn-big">${cta}</a>
  </header>
  ${stepsHtml(stepsTitle, steps)}
  ${steps?.length ? splitHtml(split) : ""}
  ${extra}
  ${faqHtml(faq)}
  ${!steps?.length ? splitHtml(split) : ""}
  ${relatedHtml(related)}
  ${footerHtml()}
</body>
</html>
`;
}

const defaultRelated = ["wedding", "birthday", "baby-shower", "how-it-works", "pricing", "qr-code-photo-sharing"];

const PRICE_PLANS = `<section class="section" id="plans">
  <h2>Pricing that makes sense for one night</h2>
  <p class="section-sub">No subscription. You're throwing a party, not signing a contract.</p>
  <div class="plans">
    <div class="plan">
      <h3>Free</h3>
      <div class="price">$0</div>
      <ul>
        <li>1 event album</li>
        <li>Up to 25 photos</li>
        <li>QR code included</li>
        <li>Gallery stays up 7 days</li>
      </ul>
      <a href="/create" class="btn btn-outline">Start free</a>
    </div>
    <div class="plan plan-featured">
      <div class="plan-tag">Most people pick this</div>
      <h3>Party</h3>
      <div class="price">$19.99 <span>one time, per event</span></div>
      <ul>
        <li>Unlimited photos and videos</li>
        <li>Unlimited guests</li>
        <li>Gallery stays up 1 year</li>
        <li>Download everything in one click</li>
        <li>Printable QR sign designer</li>
      </ul>
      <a href="/create" class="btn">Create your album</a>
    </div>
    <div class="plan">
      <h3>Pro</h3>
      <div class="price">$29.99 <span>one time, per event</span></div>
      <ul>
        <li>Everything in Party</li>
        <li>Table QR Manager</li>
        <li>A personalized QR sign for every table</li>
        <li>Print all your table signs at once</li>
        <li>Photos auto-tagged by table</li>
      </ul>
      <a href="/create" class="btn btn-outline">Start free, upgrade later</a>
    </div>
  </div>
  <p class="pricing-note">Start free, upgrade from inside your album whenever you want. Even mid-party.</p>
</section>`;

const pages = [
  {
    slug: "wedding",
    title: "Wedding Photo Sharing with a QR Code | Snapjar",
    description: "Put a QR code on your reception tables and collect every photo your wedding guests take, in one shared album. No app to download. $19.99 one time, not $60 to $250 like most guest photo services.",
    eyebrow: "Wedding photo sharing, done the easy way",
    h1: "Get every photo your wedding guests take",
    lede: "Your photographer captures the ceremony. Your guests capture everything else: the getting-ready chaos, the cocktail hour, your college roommates on the dance floor at midnight. Snapjar puts a QR code on the tables so all of it lands in one album, automatically.",
    cta: "Create your wedding album free",
    crumb: "Weddings",
    stepsTitle: "How it works at a wedding",
    steps: [
      { h: "Print the table cards", p: "Create your album, print the QR card, and drop one on each reception table. It takes less time than picking the napkin color did." },
      { h: "Guests scan as they snap", p: "No app to download, no account to make. Grandparents included. The QR opens the album in their browser and they upload in one tap." },
      { h: "Every photo, the next morning", p: "Wake up to hundreds of photos from every table and every angle, weeks before your photographer's gallery arrives." }
    ],
    split: {
      h: "Why couples do this",
      ps: [
        "After the wedding, the photos scatter. Some are in a group chat, some on your aunt's phone, some on a camera roll you will never see. Asking people to send them afterward almost never works.",
        "A QR code on the table catches the photos the night they happen, while everyone is still in the room and still excited. It also gives guests without a plus-one something fun to do, which is a real and underrated benefit."
      ],
      quote: "The photos our guests took at the reception were the ones we actually posted. The candids nobody poses for.",
      by: "Why the QR card earns its spot on the table"
    },
    extra: `<section class="section">
      <h2>What it costs</h2>
      <p class="section-sub">Most wedding guest photo services charge $60 to $250 per event. Snapjar is $19.99, one time, and free to try.</p>
      <div class="plans">
        <div class="plan plan-featured">
          <div class="plan-tag">One price, one night</div>
          <h3>Party</h3>
          <div class="price">$19.99 <span>one time, per event</span></div>
          <ul>
            <li>Unlimited photos and guests</li>
            <li>Gallery stays up 1 year</li>
            <li>Printable table cards included</li>
            <li>Start free with 25 photos, upgrade any time</li>
          </ul>
          <a href="/create" class="btn">Create your album</a>
        </div>
      </div>
    </section>`,
    faq: [
      { q: "Do wedding guests need to download an app?", a: "No. They scan the QR code with their phone camera. The album opens in the browser and they add photos from there." },
      { q: "Where should we put the QR code?", a: "Reception tables first. Also the bar, the guestbook table, and a sign near the dance floor. The more people see it, the more photos you get." },
      { q: "Will this replace our photographer?", a: "No. Your photographer still shoots the ceremony, portraits, and the planned moments. Snapjar collects the guest candids they were never going to catch." },
      { q: "Can faraway family watch the album?", a: "Yes. Send them the album link. Photos appear live as guests add them, which is a kind way to include people who could not travel." }
    ],
    related: ["rehearsal-dinner", "engagement-party", "bridal-shower", "bachelorette", "for-photographers", "pricing"]
  },
  {
    slug: "birthday",
    title: "Birthday Party Photo Sharing with a QR Code | Snapjar",
    description: "Collect every photo from a birthday party in one shared album. Guests scan a QR code, no app needed. Free to start, $19.99 for unlimited photos.",
    eyebrow: "Birthday party photo sharing",
    h1: "One album for every photo from the party",
    lede: "Kid birthdays, 30th birthdays, surprise parties for people who hate surprises. Everyone's taking photos and nobody ever sends them. Stick a QR code by the cake and every photo lands in one shared album, live during the party.",
    cta: "Create your party album free",
    crumb: "Birthdays",
    stepsTitle: "Perfect for the parties where phones come out",
    steps: [
      { h: "Kid birthdays", p: "Every parent at the party takes photos of their own kid. With one QR code by the door, you get the shots of yours that you were too busy hosting to take." },
      { h: "Milestone birthdays", p: "The 30th, the 50th, the retirement-age one nobody names. The album becomes the group's shared memory of the night, blurry toasts included." },
      { h: "Surprise parties", p: "Twelve people film the surprise moment from twelve angles. For once, you get all twelve." }
    ],
    split: {
      h: "Easier than the group chat",
      ps: [
        "Group chats compress photos to mush and half the guests are never in the chat. Snapjar is one link, works on every phone, and guests do not need an app or an account. If they can scan a menu, they can add photos.",
        "You start free with 25 photos. If the party is bigger than that, unlimited is $19.99 one time. Not a subscription, because your birthday happens once a year."
      ],
      quote: "We put the QR next to the cake. By the time we cut it, the album already had 60 photos.",
      by: "The cake table is prime real estate"
    },
    faq: [
      { q: "Will kids' parents actually use it?", a: "Yes, because they are already taking photos. A QR by the gift table or the door is easier than collecting numbers for a group text." },
      { q: "Can I start free for a small party?", a: "Yes. Free albums hold 25 photos. Upgrade to Party for $19.99 if you want everything, including a gallery that stays up for a year." }
    ],
    related: ["anniversary", "retirement-party", "holiday-party", "wedding", "pricing", "how-it-works"]
  },
  {
    slug: "baby-shower",
    title: "Baby Shower Photo Sharing with a QR Code | Snapjar",
    description: "Collect every baby shower photo in one shared album. Guests scan a QR code, no app needed. The mom-to-be gets every photo without chasing anyone. Free to start.",
    eyebrow: "Baby shower photo sharing",
    h1: "Every photo from the shower, saved before the baby arrives",
    lede: "The bump photos, the gift reactions, the games, the grandma-to-be tearing up. Everyone at a shower takes photos and they vanish into forty different camera rolls. One QR code on the gift table collects them all.",
    cta: "Create your shower album free",
    crumb: "Baby showers",
    stepsTitle: "Why showers especially need this",
    steps: [
      { h: "The host is busy", p: "Whoever throws the shower spends it refilling drinks and running games. The guests become the photographers, and their photos actually get collected." },
      { h: "The album becomes a keepsake", p: "These photos end up in baby books and first-birthday slideshows. Having them in one place, at full quality, matters more than at most parties." },
      { h: "Faraway family can watch live", p: "Send the album link to the aunt who couldn't fly in. Photos appear in real time, so she's at the shower from three time zones away." }
    ],
    split: {
      h: "Simple enough for every guest",
      ps: [
        "Showers mix generations like nothing else: college friends, coworkers, both grandmothers. Snapjar works for all of them because there is nothing to install and no account to create. Scan, tap, done.",
        "Start free with 25 photos. Unlimited is $19.99 one time if you want every last one, and the gallery stays up for a year, long enough to still be there for the first-birthday slideshow."
      ],
      quote: "My sister couldn't travel for the shower, so she watched the album fill up live from her couch and texted commentary the whole time.",
      by: "The long-distance guest experience"
    },
    faq: [
      { q: "Can I use the same album later for the hospital or first birthday?", a: "Each album is meant for one event. Create a new one for the next milestone. It takes about 30 seconds." },
      { q: "Is it okay if the mom-to-be is not the host?", a: "Yes. The person who creates the album is the host and can delete photos. Share the link with the parents so they have it too." }
    ],
    related: ["gender-reveal", "bridal-shower", "birthday", "wedding", "how-it-works", "pricing"]
  },
  {
    slug: "bridal-shower",
    title: "Bridal Shower Photo Album with a QR Code | Snapjar",
    description: "Collect bridal shower photos in one shared album. Guests scan a QR code, no app needed. Free to start, $19.99 for unlimited photos.",
    eyebrow: "Bridal shower photo sharing",
    h1: "The shower photos that never make it out of group texts",
    lede: "Someone always says they will start a shared album and then does not. Put a QR code on the gift table instead. Guests add photos while they are still holding the phone they just used.",
    cta: "Create your shower album free",
    crumb: "Bridal showers",
    stepsTitle: "What actually gets photographed",
    steps: [
      { h: "The games", p: "The silly ones, the ones she pretended not to like, the scorecards. Those photos are the ones people ask for later and nobody can find." },
      { h: "The people who flew in", p: "College roommates, coworkers, the cousin from out of town. Each of them took a roll of photos you will not see unless you collect them tonight." },
      { h: "The bride, unposed", p: "Opening gifts, laughing with her mom, sitting down for two minutes. That is the album you want a year from now." }
    ],
    split: {
      h: "Works when the guest list is mixed",
      ps: [
        "Bridal showers pull in people who do not share an iCloud library or a WhatsApp thread. Snapjar does not care which phone they have. The QR opens a web page.",
        "Start free. Upgrade for $19.99 if the shower is big enough that 25 photos will not cover it."
      ],
      quote: "We taped the QR to the punch bowl. People scanned it while they were already in line.",
      by: "Put it where people pause"
    },
    faq: [
      { q: "Should this be a different album from the wedding?", a: "Yes. Keep the shower as its own album. The wedding gets its own QR on the reception tables." },
      { q: "Can the maid of honor set it up?", a: "Yes. Whoever creates it is the host. Send the bride the link so she has it on her phone too." }
    ],
    related: ["bachelorette", "wedding", "baby-shower", "engagement-party", "pricing", "how-it-works"]
  },
  {
    slug: "bachelorette",
    title: "Bachelorette Party Photo Sharing | Snapjar",
    description: "Collect every bachelorette or bachelor party photo in one album. Guests scan a QR code, no app, no group chat scavenger hunt after. Free to start.",
    eyebrow: "Bachelorette and bachelor parties",
    h1: "The weekend produces 800 photos. You will be sent 11.",
    lede: "Different Airbnbs, different nights, different group chats that not everyone is in. One QR code in the house and on the dinner table pulls the whole weekend into a single album before people fly home.",
    cta: "Create the weekend album free",
    crumb: "Bachelorette parties",
    stepsTitle: "How to actually get the photos",
    steps: [
      { h: "Put the QR on the fridge", p: "The house is headquarters. A printed card on the fridge or the bar cart gets more scans than a text nobody opens." },
      { h: "Share the link in the planning chat once", p: "One message, pinned. People add photos as the night happens instead of promising to dump their camera roll on Sunday." },
      { h: "Leave it up after the wedding", p: "A paid album stays for a year. The couple can scroll the weekend they were too busy to photograph themselves." }
    ],
    split: {
      h: "Bachelor parties too",
      ps: [
        "Same product. Golf, a cabin, a dinner, whatever the version is. The photos still live on six phones that will never AirDrop each other.",
        "Free for 25 photos if it is a small dinner. $19.99 if the weekend is going to be a lot."
      ],
      quote: "We had three group chats and still lost the photos from night one. Next time the QR goes on the rental door.",
      by: "Learn this the easy way"
    },
    faq: [
      { q: "Do people have to make an account while they are out?", a: "No. Scan and upload. That matters when nobody wants to install something at 11pm." },
      { q: "Can the bride or groom be kept out of the album until later?", a: "The album is just a link. Do not send it to them until you are ready. You are the host." }
    ],
    related: ["bridal-shower", "wedding", "engagement-party", "birthday", "how-it-works", "pricing"]
  },
  {
    slug: "engagement-party",
    title: "Engagement Party Photo Album with a QR Code | Snapjar",
    description: "Collect engagement party photos with a QR code guests can scan. No app, one shared album, free to start. $19.99 for unlimited photos.",
    eyebrow: "Engagement party photo sharing",
    h1: "Start the wedding chapter with the photos you actually have",
    lede: "The engagement party is the first time both families are in a room together. Everyone takes photos. Almost none of them reach the couple unless you collect them that night.",
    cta: "Create your engagement album free",
    crumb: "Engagement parties",
    stepsTitle: "A small party still loses photos",
    steps: [
      { h: "The announcement moment", p: "If there is a toast or a ring shot, six people catch it. The QR on the table means those six photos are not trapped on six phones." },
      { h: "Two families, zero shared albums", p: "Your side uses iMessage. Their side uses something else. Snapjar is the neutral ground that does not require anyone to join a new app." },
      { h: "A preview of the wedding album", p: "If it works here, you already know you want a QR on the reception tables later. Practice on a friendlier night." }
    ],
    split: {
      h: "Keep it separate from the wedding",
      ps: [
        "Make this its own album. You will want the engagement night as its own story, not mixed into 400 reception candids.",
        "Free is enough for a backyard. Upgrade if the guest list looks like a mini wedding."
      ],
      quote: "We used it at the engagement party so we would not have to explain a new app to grandma twice.",
      by: "A useful dress rehearsal"
    },
    faq: [
      { q: "Can we reuse the same QR at the wedding?", a: "Use a new album for the wedding so the photos stay organized. Creating another one is fast." }
    ],
    related: ["wedding", "rehearsal-dinner", "bridal-shower", "anniversary", "pricing", "how-it-works"]
  },
  {
    slug: "rehearsal-dinner",
    title: "Rehearsal Dinner Photo Sharing | Snapjar",
    description: "Collect rehearsal dinner photos in one QR album. Smaller than the wedding, still full of the people you actually want pictures of. No app for guests.",
    eyebrow: "Rehearsal dinner photo sharing",
    h1: "The dinner where the real guests are, and the photos vanish anyway",
    lede: "Wedding party, close family, the people who flew in early. This is often the better photo night, and it still dies in camera rolls because nobody wants to be the person collecting pictures.",
    cta: "Create the dinner album free",
    crumb: "Rehearsal dinners",
    stepsTitle: "Why the rehearsal dinner is worth its own album",
    steps: [
      { h: "Everyone is closer", p: "People sit, talk, and take candids they will not take during a 200-person reception. Those are the keepers." },
      { h: "Speeches you will want later", p: "Not just the official ones. The side comments, the siblings, the parents before they are in formalwear." },
      { h: "A quieter QR", p: "One card at the restaurant entrance or a link in the dinner invite is enough. You do not need a sign on every plate." }
    ],
    split: {
      h: "Do not mix it into the wedding dump",
      ps: [
        "A separate album means you can share the dinner with people who were there, without handing them 500 reception photos.",
        "25 free photos covers a lot of dinners. Upgrade if the wedding party is large and very online."
      ],
      quote: "The rehearsal photos were the ones we printed. The wedding ones were beautiful. These were us.",
      by: "Different night, different album"
    },
    faq: [
      { q: "Restaurant lighting is bad. Does that matter?", a: "Snapjar stores the photos guests already took. It does not replace good light. It just stops those photos from staying on their phones." }
    ],
    related: ["wedding", "engagement-party", "for-photographers", "pricing", "how-it-works", "faq"]
  },
  {
    slug: "graduation",
    title: "Graduation Photo Sharing with a QR Code | Snapjar",
    description: "Collect graduation photos from family and friends in one shared album. QR code, no app, works in a crowded stadium. Free to start.",
    eyebrow: "Graduation photo sharing",
    h1: "Everyone filmed the walk. You have none of the videos.",
    lede: "Commencement is a sea of phones and a family split across seats, lawns, and parking lots. One album link in the group text, plus a QR on the yard-sign at the party after, is how you actually get the photos.",
    cta: "Create your graduation album free",
    crumb: "Graduations",
    stepsTitle: "Stadium, then the party",
    steps: [
      { h: "Share the link before the ceremony", p: "Put it in the family thread the night before. People will already be shooting. Give them a place to drop files besides 'I'll send later.'" },
      { h: "QR at the open house", p: "The backyard party is where the posed shots and the cousins happen. Tape a card to the dessert table." },
      { h: "Relatives who could not come", p: "Send the album link. Photos show up live, which is the next best thing to a seat they could not get." }
    ],
    split: {
      h: "High school, college, med school, all of it",
      ps: [
        "Same problem at every stage: too many people with cameras, no shared place to put the files, and a graduate who is too busy to chase anyone.",
        "Start free. If the open house is huge, $19.99 keeps every photo for a year."
      ],
      quote: "We had photos from the row behind us that we would never have seen. Someone just scanned the card at the party.",
      by: "The seats you did not sit in"
    },
    faq: [
      { q: "Will it work with bad stadium wifi?", a: "Guests can add photos when they have a signal, including later at the house. The album does not need everyone online at the same second." },
      { q: "Can teachers or a class parent use this?", a: "Yes. Create an album, print a QR, share the link. You are the host and can delete anything that should not stay." }
    ],
    related: ["family-reunion", "bar-mitzvah", "birthday", "how-it-works", "pricing", "qr-code-photo-sharing"]
  },
  {
    slug: "family-reunion",
    title: "Family Reunion Photo Sharing | Snapjar",
    description: "Collect family reunion photos in one shared album. Aunts, cousins, and kids scan a QR code. No app, no 'who is hosting the Google album this year.'",
    eyebrow: "Family reunion photo sharing",
    h1: "Stop electing a cousin to collect 400 photos by email",
    lede: "Someone always volunteers to make a shared album and then spends the weekend reminding people. Print a QR, tape it to the picnic shelter, and let the reunion fill itself.",
    cta: "Create the reunion album free",
    crumb: "Family reunions",
    stepsTitle: "Built for people who do not have the same apps",
    steps: [
      { h: "Every generation, one scan", p: "No Apple vs Android fight. No 'I don't do Google.' The camera app opens a web page. That is the whole onboarding." },
      { h: "The park, the rental, the hotel lobby", p: "Print a few cards. Put them where people set down plates. Reunions move. The QR can too." },
      { h: "The people who only came Sunday", p: "They still get the Friday photos if they have the link. That is the point of one album instead of five threads." }
    ],
    split: {
      h: "You are not the family IT department",
      ps: [
        "You should be at the reunion, not troubleshooting iCloud invites for relatives who created a new email in 2011 and forgot it.",
        "Free covers a small picnic. $19.99 covers the kind of reunion that rents a hall."
      ],
      quote: "We used to lose a year of reunion photos in a dead Facebook album. The QR card outlasted the group chat.",
      by: "Pick a system that shows up"
    },
    faq: [
      { q: "Can more than one person add photos at once?", a: "Yes. That is the normal way it works. Dozens of phones can upload to the same album." },
      { q: "Who can delete a photo?", a: "The host can delete any photo. Guests can remove what they uploaded." }
    ],
    related: ["anniversary", "holiday-party", "graduation", "wedding", "how-it-works", "pricing"]
  },
  {
    slug: "quinceanera",
    title: "Quinceañera Photo Sharing with a QR Code | Snapjar",
    description: "Collect quinceañera guest photos in one album. QR codes on the tables, no app for tíos and classmates. Free to start, $19.99 unlimited.",
    eyebrow: "Quinceañera photo sharing",
    h1: "The court, the dance, the tables. All of it, not just the posed set.",
    lede: "You already hired a photographer. Your guests still take the photos you will want at midnight: cousins on the dance floor, grandparents watching the vals, the surprise faces. A QR on each table collects them.",
    cta: "Create your quinceañera album free",
    crumb: "Quinceañeras",
    stepsTitle: "How families actually use it",
    steps: [
      { h: "Table cards next to the centerpiece", p: "Same idea as a wedding reception. People scan while they sit. You do not have to make a speech about an app." },
      { h: "Share with family who could not travel", p: "Send the album link. Photos appear as the night happens, which is a gift to the relatives watching from another country." },
      { h: "Keep it after the professional gallery", p: "The photographer's photos arrive later. Guest candids can be in your hands before you leave the hall." }
    ],
    split: {
      h: "Works when the guest list is huge",
      ps: [
        "Classmates, padrinos, neighbors, both sides of the family. Nobody is installing something new for one night. A QR is familiar because restaurants already trained everyone.",
        "Start free if you are testing it at the brunch. Party is $19.99 for the main event."
      ],
      quote: "The professional photos were perfect. The table album was how we saw the party our daughter was actually at.",
      by: "Two jobs, two kinds of photos"
    },
    faq: [
      { q: "Can we print the QR in Spanish?", a: "Yes. The sign designer lets you write the words on the card. The album itself is simple enough that the language on the sign does most of the work." },
      { q: "Is this only for weddings?", a: "No. Quinceañeras, graduations, and birthdays all use the same product." }
    ],
    related: ["wedding", "birthday", "bar-mitzvah", "for-photographers", "pricing", "how-it-works"]
  },
  {
    slug: "bar-mitzvah",
    title: "Bar and Bat Mitzvah Photo Sharing | Snapjar",
    description: "Collect bar mitzvah and bat mitzvah guest photos with a QR code. No app, one album for family and classmates. Free to start.",
    eyebrow: "Bar and bat mitzvah photo sharing",
    h1: "Ceremony photos from the photographer. Party photos from everyone else.",
    lede: "The weekend already has a photographer. What you still lose are the classmate candids, the grandparents' phone pictures, and the party that happens after the service. One QR on the tables fixes that.",
    cta: "Create your event album free",
    crumb: "Bar and bat mitzvahs",
    stepsTitle: "A weekend with two crowds",
    steps: [
      { h: "Family at the service", p: "Share a link with relatives beforehand so the people in the pews have a place to put what they shoot. You still follow the venue's photo rules." },
      { h: "Kids at the party", p: "Classmates will take a hundred photos and send zero. A QR on the dessert table is more realistic than asking a 13-year-old to AirDrop you later." },
      { h: "Out-of-town grandparents", p: "They can watch the album fill up from the hotel or from home. Send the link. No new app." }
    ],
    split: {
      h: "Respect the room, collect the party",
      ps: [
        "If a synagogue or venue limits photos during the service, listen to that. Snapjar is for the parts of the weekend where phones are already out.",
        "$19.99 for unlimited if the party is the size these usually are. Free is enough to try at a Friday dinner."
      ],
      quote: "We got photos from kids we had never met and relatives we see once a decade. Same album.",
      by: "That is the guest list"
    },
    faq: [
      { q: "Can the host delete a photo a kid should not have uploaded?", a: "Yes. The host can remove any photo. You are not stuck with whatever hits the album." }
    ],
    related: ["wedding", "quinceanera", "birthday", "graduation", "pricing", "how-it-works"]
  },
  {
    slug: "anniversary",
    title: "Anniversary Party Photo Sharing | Snapjar",
    description: "Collect anniversary party photos in one shared album. Guests scan a QR code. No app, no chasing relatives after. Free to start.",
    eyebrow: "Anniversary party photo sharing",
    h1: "The people who have known you longest still will not send the photos",
    lede: "A 25th or 50th pulls in a room of relatives who take pictures and then disappear into their camera rolls. Put a QR by the guest book. Collect the night while it is happening.",
    cta: "Create your anniversary album free",
    crumb: "Anniversaries",
    stepsTitle: "Built for mixed-age rooms",
    steps: [
      { h: "No app for parents and friends", p: "If they can scan a restaurant menu, they can add a photo. That is the bar, and it is the right bar." },
      { h: "Old photos plus new ones", p: "Guests sometimes photograph the display of old pictures. Those shots of the room belong in the same album as the toasts." },
      { h: "A link for people who could not travel", p: "Send it. Live photos are how you include the sibling who had a reason they could not fly." }
    ],
    split: {
      h: "One night, not a subscription",
      ps: [
        "You do not need software that bills you monthly for a party you throw every 10 years. Free or $19.99 once.",
        "The paid gallery stays up a year, which is long enough to make a book if you want one."
      ],
      quote: "My dad will not join another app. He will scan a card on the table. That decided it.",
      by: "The actual constraint"
    },
    faq: [
      { q: "Can we download everything after?", a: "On a paid album, yes. Download all in one click. Single photos can be saved even on free albums." }
    ],
    related: ["family-reunion", "retirement-party", "wedding", "birthday", "pricing", "how-it-works"]
  },
  {
    slug: "holiday-party",
    title: "Holiday Party Photo Sharing with a QR Code | Snapjar",
    description: "Collect Christmas, Hanukkah, and New Year party photos in one album. Guests scan a QR. No app, no work Slack dump. Free to start.",
    eyebrow: "Holiday party photo sharing",
    h1: "The office party photos do not belong in the work chat",
    lede: "Holiday parties mix coworkers, plus-ones, and people who will never log into the company Slack. A QR at the door makes a photo album that is not also a performance review archive.",
    cta: "Create your holiday album free",
    crumb: "Holiday parties",
    stepsTitle: "Work parties and family parties",
    steps: [
      { h: "Company holiday party", p: "Put the QR at check-in or the bar. People add photos without joining a Slack channel they do not want to be in on Saturday." },
      { h: "Family Christmas or Friendsgiving", p: "Same product. Tape a card to the sideboard. Stop asking who is making the iCloud album this year." },
      { h: "New Year's", p: "Midnight photos from 40 phones. One album. You will actually have them on January 1." }
    ],
    split: {
      h: "Keep work photos off work tools",
      ps: [
        "A dedicated album is kinder than 'drop them in the #social channel.' Guests who are not employees can still contribute.",
        "Start free. Upgrade if the party is the whole company."
      ],
      quote: "We used to lose the good photos in a thread nobody could search. The QR sat next to the nametags.",
      by: "Put it at the first stop"
    },
    faq: [
      { q: "Can we take the album down after the party?", a: "The host controls the album. Paid galleries stay a year unless you delete. Free galleries are short-lived by design." }
    ],
    related: ["office-party", "family-reunion", "birthday", "how-it-works", "pricing", "faq"]
  },
  {
    slug: "office-party",
    title: "Office Party and Corporate Event Photo Sharing | Snapjar",
    description: "QR code photo sharing for office parties, offsites, and corporate events. No app for employees or clients. $19.99 per event, not a company-wide SaaS contract.",
    eyebrow: "Office parties and offsites",
    h1: "A shared album that is not another tool on the IT list",
    lede: "Offsites, all-hands afterparties, client dinners. People take photos and they end up nowhere useful. Snapjar is one event, one QR, no software rollout.",
    cta: "Create an event album free",
    crumb: "Office parties",
    stepsTitle: "When a 'platform' is more than you need",
    steps: [
      { h: "No accounts for attendees", p: "Employees, plus-ones, and clients scan a code. They do not create logins. That is why it actually gets used." },
      { h: "You are not buying a year of seats", p: "Party is $19.99 for the event. You are not explaining a new vendor to finance for a Thursday happy hour." },
      { h: "Host controls the album", p: "Delete anything that should not live there. You are not at the mercy of an open Slack thread." }
    ],
    split: {
      h: "Offsites, conferences, dinners",
      ps: [
        "Print a QR for the welcome desk. Share the link in the day-of email. People add photos between sessions instead of promising a Drive folder that never appears.",
        "Try it free with 25 photos at the next small gathering. Upgrade when the room is big."
      ],
      quote: "We did not need a digital asset manager. We needed Friday's photos in one place on Monday.",
      by: "The actual brief"
    },
    faq: [
      { q: "Is this a company subscription?", a: "No. You pay per event album. Create a new one next time." },
      { q: "Can we brand it with our company name?", a: "The album name is whatever you type. Name it after the offsite. The printable sign uses your words." }
    ],
    related: ["holiday-party", "for-wedding-planners", "pricing", "how-it-works", "faq", "qr-code-photo-sharing"]
  },
  {
    slug: "gender-reveal",
    title: "Gender Reveal Photo Sharing | Snapjar",
    description: "Collect every angle of a gender reveal in one album. Guests scan a QR code. No app. Free to start.",
    eyebrow: "Gender reveal photo sharing",
    h1: "The reveal is one second. You want every camera that caught it.",
    lede: "Someone always misses the moment because they were holding the camera. A QR at the party means every phone that did catch it has a place to put the photo immediately.",
    cta: "Create your reveal album free",
    crumb: "Gender reveals",
    stepsTitle: "A short event with a lot of cameras",
    steps: [
      { h: "Before the moment", p: "Share the link in the invite so people already have the album open. The reveal is a bad time to explain a new app." },
      { h: "QR on the dessert table", p: "After the pop or the cake, people hover. That is when they upload." },
      { h: "Family who streamed it badly", p: "They still want the stills. Send the album. The good frames show up from the people who were standing in the right spot." }
    ],
    split: {
      h: "Often the same weekend as a shower",
      ps: [
        "Keep this as its own album if you want the reveal as a clean set. Use a second album for the shower.",
        "Free is usually enough. Upgrade if the backyard is packed."
      ],
      quote: "We had 14 photos of the exact second. Without the QR we would have had mine and my sister's.",
      by: "That is the whole product"
    },
    faq: [
      { q: "Can we hide the album until after the reveal?", a: "Do not print the QR until you want photos flowing. You control when people get the link." }
    ],
    related: ["baby-shower", "birthday", "how-it-works", "pricing", "wedding", "faq"]
  },
  {
    slug: "retirement-party",
    title: "Retirement Party Photo Sharing | Snapjar",
    description: "Collect retirement party photos from coworkers and family in one QR album. No app, no shared drive that nobody uses. Free to start.",
    eyebrow: "Retirement party photo sharing",
    h1: "Coworkers will take photos. They will not email you a zip file.",
    lede: "A retirement room is full of people who have known each other for decades and still cannot agree on a photo app. A QR on the gift table is simpler than a shared drive named 'Bob party pics FINAL v3'.",
    cta: "Create the party album free",
    crumb: "Retirement parties",
    stepsTitle: "Work people and family people",
    steps: [
      { h: "Two guest lists, one album", p: "Office friends and actual family often meet for the first time at this party. They should not need two apps to contribute photos." },
      { h: "The roast, the cake, the hallway hugs", p: "Those photos are the ones that get lost because nobody is 'in charge of pictures.'" },
      { h: "A link for people who had to work", p: "Send the album to the teammates who could not leave the desk. They still get the night." }
    ],
    split: {
      h: "You do not need a corporate photo platform",
      ps: [
        "This is one party. Pay once if you need unlimited, or stay free if it is a small lunch.",
        "The host can delete anything that is more roast than kindness."
      ],
      quote: "We put the QR next to the sign-in sheet. People scanned it with the same hand they used for the pen.",
      by: "Meet them at the door"
    },
    faq: [
      { q: "Can former coworkers add photos later?", a: "If they have the link, yes, as long as the album is still up. Paid albums last a year." }
    ],
    related: ["office-party", "anniversary", "birthday", "how-it-works", "pricing", "holiday-party"]
  },
  {
    slug: "how-it-works",
    title: "How Snapjar Works | QR Code Photo Sharing",
    description: "How Snapjar QR photo sharing works: create an album, print a code, guests scan and upload. No app, no guest accounts. Free to start.",
    eyebrow: "The whole product, in plain order",
    h1: "Create an album. Print a QR. Collect every photo.",
    lede: "Snapjar is not a social network and not a new camera. It is a shared album with a code you can put on a table. Guests use the phone they already have.",
    cta: "Create your album free",
    crumb: "How it works",
    stepsTitle: "Three steps, including having the party",
    steps: [
      { h: "Name the event", p: "You get a private album and a QR code in about 30 seconds. Print the card or put the link in a text." },
      { h: "Guests scan and add photos", p: "The code opens a web page. They pick photos from their camera roll. No App Store, no account, no 'sign in with Google' wall." },
      { h: "You keep the gallery", p: "Photos show up live. You can delete anything. Paid albums stay for a year and you can download the whole set." }
    ],
    split: {
      h: "Why not a group chat or iCloud?",
      ps: [
        "Group chats crush quality and miss whoever is not in the thread. iCloud and Google shared albums ask people to log into an ecosystem they may not use. A QR in the camera app is the one thing almost every guest already understands.",
        "You can try it tonight on 25 free photos. If it works, you already know what to do for the wedding."
      ],
      quote: "If they can scan a menu, they can add photos. Grandma can do it.",
      by: "The design constraint"
    },
    extra: `<section class="section">
      <h2>What guests see</h2>
      <p class="section-sub">A gallery, a button to add photos, and not much else. That is on purpose.</p>
      <div class="steps">
        <div class="step"><div class="step-num">1</div><h3>Scan</h3><p>Phone camera opens the album link. It is a normal web page, so it works on iPhone and Android.</p></div>
        <div class="step"><div class="step-num">2</div><h3>Add</h3><p>They tap Add photos and pick from the camera roll. Optional name, so you know who shot what.</p></div>
        <div class="step"><div class="step-num">3</div><h3>Watch it fill</h3><p>New photos appear for everyone with the link. Good for a laptop on the gift table if you want a live screen.</p></div>
      </div>
    </section>`,
    faq: [
      { q: "Do guests need to download an app?", a: "No. The QR opens a web page." },
      { q: "Can strangers find our album?", a: "Only people with the link or QR. Album codes are random." },
      { q: "What if someone uploads something dumb?", a: "The host can delete any photo." },
      { q: "Do photos get compressed like in Texts?", a: "We keep them at high quality, well above what messaging apps do." }
    ],
    related: ["pricing", "faq", "qr-code-photo-sharing", "wedding", "for-photographers", "guestpix-alternative"]
  },
  {
    slug: "pricing",
    title: "Snapjar Pricing | $19.99 Per Event, No Subscription",
    description: "Snapjar pricing: free for 25 photos, Party $19.99 one time for unlimited photos, Pro $29.99 with table QR signs. No monthly fee.",
    eyebrow: "Simple pricing",
    h1: "Pay once for the party. Not every month after.",
    lede: "Most guest photo apps charge $60 to $250 per event, or they hide the real number in tiers. Snapjar is free to try, $19.99 for unlimited, $29.99 if you want a QR sign for every table.",
    cta: "Start free",
    crumb: "Pricing",
    stepsTitle: "What you are actually buying",
    steps: [
      { h: "Free to see if guests will use it", p: "25 photos, QR included, gallery up 7 days. Run it at dinner. If nobody scans, you learned that for $0." },
      { h: "Party for the real event", p: "$19.99 once. Unlimited photos and guests, download all, gallery for a year, printable sign." },
      { h: "Pro if you have assigned tables", p: "$29.99 once. Everything in Party plus a unique QR per table so photos tag themselves." }
    ],
    split: {
      h: "No seat licenses. No annual plan.",
      ps: [
        "You are not a photography studio buying software. You are hosting a night. The price should look like a night.",
        "Upgrade from inside the album whenever you want, including after guests have already started adding photos."
      ],
      quote: "Spend the difference on the open bar.",
      by: "The honest comparison"
    },
    extra: PRICE_PLANS,
    faq: [
      { q: "Is Party really one time?", a: "Yes. One payment per album. Not a subscription." },
      { q: "What happens after a year on Party?", a: "Download your photos while the gallery is up. This is a sharing product, not a forever archive." },
      { q: "Can I refund if it fails during the event?", a: "Email support@getsnapjar.com within 7 days of the event and we will refund you in full if the paid product failed you." },
      { q: "Do guests pay anything?", a: "No. Only the host pays, and only if they upgrade." }
    ],
    related: ["how-it-works", "guestpix-alternative", "wedibox-alternative", "pov-alternative", "faq", "wedding"]
  },
  {
    slug: "faq",
    title: "Snapjar FAQ | Guest Photo Sharing Questions",
    description: "Answers about Snapjar QR photo albums: apps, privacy, pricing, downloads, guests, and what happens to photos after the event.",
    eyebrow: "FAQ",
    h1: "The questions people ask before they print a QR",
    lede: "Short answers. If yours is missing, email support@getsnapjar.com and include your album code if you have one.",
    cta: "Create an album free",
    crumb: "FAQ",
    stepsTitle: null,
    steps: [],
    split: {
      h: "Still stuck?",
      ps: [
        "Album help, refunds, and privacy requests all go to the same inbox. A real person reads it.",
        "Include the 6-character code from your album link if the question is about a specific event."
      ],
      quote: "One inbox: support@getsnapjar.com",
      by: "Contact and support are the same address"
    },
    extra: "",
    faq: [
      { q: "Do my guests need to download an app?", a: "No. The QR code opens a web page and they upload from there. iPhone and Android." },
      { q: "Can strangers see our photos?", a: "Only people with your album link or QR code. Codes are random, so people do not stumble in." },
      { q: "What if someone uploads something dumb?", a: "You are the host. Delete any photo." },
      { q: "Do photos get compressed like in group chats?", a: "No. We keep high quality, well above what messaging apps do." },
      { q: "Can I use this for something that is not a wedding?", a: "Yes. Birthdays, graduations, reunions, showers, office parties. If people are taking photos, it works." },
      { q: "How much does it cost?", a: "Free for 25 photos. Party is $19.99 one time for unlimited. Pro is $29.99 with per-table QR signs." },
      { q: "Do guests need an account?", a: "No. Hosts can optionally make an account. Guests do not have to." },
      { q: "Can I download all the photos?", a: "Yes on a paid album, in one zip. Single photos can be saved from the gallery." },
      { q: "Where do I print the QR?", a: "From your album after you create it. There is a printable sign, and Pro can print a unique card per table." },
      { q: "What if wifi at the venue is bad?", a: "Guests upload when they have signal, including later on cellular. The album does not require a venue network." },
      { q: "Who owns the photos?", a: "You do. We host them so invited people can see them. We do not sell them or train AI on them." },
      { q: "How do I get help?", a: "Email support@getsnapjar.com. Refunds: if paid features failed during your event, write within 7 days." }
    ],
    related: ["how-it-works", "pricing", "contact", "privacy", "wedding", "qr-code-photo-sharing"]
  },
  {
    slug: "qr-code-photo-sharing",
    title: "QR Code Photo Sharing for Events | Snapjar",
    description: "QR code photo sharing for weddings and parties. Guests scan a code, photos land in one album, no app to download. Free to start, $19.99 unlimited.",
    eyebrow: "QR code photo sharing",
    h1: "A QR on the table is the whole trick",
    lede: "People already scan codes for menus and wifi. Snapjar uses that habit to collect guest photos: one album, live updates, no app store detour.",
    cta: "Create your QR album free",
    crumb: "QR photo sharing",
    stepsTitle: "Why a QR beats a text that says 'send pics'",
    steps: [
      { h: "It is in the room", p: "A card on the table gets used. A follow-up text on Monday does not." },
      { h: "It works on the phones people have", p: "Camera app, browser, upload. No 'which shared album app are we using.'" },
      { h: "It scales past your friends", p: "Weddings and reunions are full of people you cannot add to a chat. They can still scan a code." }
    ],
    split: {
      h: "Use it at more than weddings",
      ps: [
        "The same QR flow works anywhere a crowd is taking pictures: showers, graduations, office parties, quinceañeras.",
        "Start on the free plan. Print a card. See if people scan. Then decide."
      ],
      quote: "The QR is not the product. The album filling up during the party is the product.",
      by: "What you are actually buying"
    },
    extra: `<section class="section">
      <h2>Where people use it</h2>
      <div class="use-grid">
        ${LINKS.events.map(([href, label]) => `<a href="${href}"><strong>${label}</strong><span>QR album for this kind of night</span></a>`).join("")}
      </div>
    </section>`,
    faq: [
      { q: "Does the QR expire?", a: "It points at your album. Free albums are short-lived. Paid albums stay a year. Print a new card if you create a new album." },
      { q: "Can I put the QR on a poster or a sticker?", a: "Yes. It is a normal code. Tape it anywhere guests will look." }
    ],
    related: ["how-it-works", "wedding", "pricing", "for-photographers", "guestpix-alternative", "faq"]
  },
  {
    slug: "guestpix-alternative",
    title: "Guestpix Alternative at $19.99 Per Event | Snapjar",
    description: "Looking for a cheaper Guestpix alternative? Snapjar does QR code guest photo sharing for $19.99 one time per event, with unlimited photos and no app for guests to download.",
    eyebrow: "Comparing guest photo apps?",
    h1: "The $19.99 alternative to Guestpix and friends",
    lede: "Guestpix, POV, Wedibox and the rest all do the same core job: guests scan a QR code, photos land in a shared album. They typically charge $60 to $250 per event for it, depending on the tier. Snapjar does that job for $19.99, one time.",
    cta: "Try it free first",
    crumb: "Guestpix alternative",
    stepsTitle: "What you get for $19.99",
    steps: [
      { h: "The same core product", p: "QR code, shared album, live uploads, no app for guests, host controls. The stuff every guest photo service is actually judged on." },
      { h: "No tier maze", p: "One paid plan for unlimited photos and guests, gallery up for a year. You don't need a pricing spreadsheet for a one-night event." },
      { h: "Try before you pay", p: "The free album holds 25 photos with the full experience. Run it at dinner tonight and decide for yourself before your event." }
    ],
    split: {
      h: "What the extra $100+ buys elsewhere",
      ps: [
        "To be fair to the bigger services: some bundle extras like slideshow apps for venue screens, video guestbooks, or longer storage tiers. If you need those specific things today, they might be worth it to you. Check their current pricing and decide.",
        "But if what you want is every guest photo in one album without making 80 people download an app, that's the whole product, and it shouldn't cost as much as the cake."
      ],
      quote: "I compared four of these apps for my sister's wedding. They all do the same thing. The price was the only real difference.",
      by: "The conclusion most people reach"
    },
    extra: `<section class="section">
      <h2>Pricing, side by side</h2>
      <p class="section-sub">One event, unlimited photos, no app for guests.</p>
      <div class="plans">
        <div class="plan">
          <h3>Typical guest photo service</h3>
          <div class="price">$60+ <span>per event, tiered</span></div>
          <ul>
            <li>QR code photo collection</li>
            <li>Price climbs with photo and guest limits</li>
            <li>Extras bundled into upper tiers</li>
          </ul>
        </div>
        <div class="plan plan-featured">
          <div class="plan-tag">Snapjar</div>
          <h3>Party</h3>
          <div class="price">$19.99 <span>one time, per event</span></div>
          <ul>
            <li>QR code photo collection</li>
            <li>Unlimited photos and guests</li>
            <li>Gallery stays up 1 year</li>
            <li>Free 25-photo album to try first</li>
          </ul>
          <a href="/create" class="btn">Start free</a>
        </div>
      </div>
    </section>`,
    faq: [
      { q: "Is Snapjar trying to be Guestpix?", a: "Same job, lower price, fewer extras. If you need a venue slideshow package, look at the bigger tools. If you need the photos, start here." },
      { q: "Will my guests notice a difference?", a: "They scan a QR and add photos. That is what they notice." }
    ],
    related: ["wedibox-alternative", "pov-alternative", "pricing", "wedding", "how-it-works", "google-photos-shared-album"]
  },
  {
    slug: "wedibox-alternative",
    title: "Wedibox Alternative | QR Guest Photos for $19.99 | Snapjar",
    description: "Looking for a Wedibox alternative? Snapjar collects wedding guest photos with a QR code for $19.99 one time. No app for guests. Free to try.",
    eyebrow: "Wedibox alternative",
    h1: "Wedding guest photos without the wedding-app price",
    lede: "Wedibox is built for couples who want a polished guest-photo setup. Snapjar is for couples who want the same core outcome, a QR and a shared album, without paying event-industry rates.",
    cta: "Try Snapjar free",
    crumb: "Wedibox alternative",
    stepsTitle: "What to compare, honestly",
    steps: [
      { h: "The job to be done", p: "Guests scan, photos land in one place, you download later. If that is the job, you do not need a 4-tier menu to do it." },
      { h: "The extras", p: "Some wedding apps sell slideshows, prompts, or longer hosting. Pay for those if you will use them. Do not pay for them by accident." },
      { h: "The tryout", p: "Snapjar lets you run a real album for free with 25 photos. Test it at the rehearsal dinner before you commit for Saturday." }
    ],
    split: {
      h: "Pick the tool that matches the night",
      ps: [
        "If you want a big production with screens and prompts, a specialist wedding app might fit. If you want every candid from the tables, print a QR.",
        "Party is $19.99 once. Check Wedibox's current packages and do the math for your guest count."
      ],
      quote: "We did not need a media suite. We needed the dance-floor photos off of people's phones.",
      by: "A fair split"
    },
    extra: `<section class="section">
      <h2>At a glance</h2>
      <div class="compare-wrap"><table class="compare">
        <thead><tr><th></th><th>Snapjar</th><th>Typical wedding guest app</th></tr></thead>
        <tbody>
          <tr><td>Guest app download</td><td>No</td><td>Often no, sometimes yes for extras</td></tr>
          <tr><td>How guests add photos</td><td>Scan QR, upload in the browser</td><td>Scan QR, upload in the browser</td></tr>
          <tr><td>Price shape</td><td>$0 to try, $19.99 unlimited</td><td>Usually $60 to $250 by tier</td></tr>
          <tr><td>Table-by-table QR</td><td>Pro, $29.99</td><td>Often an add-on</td></tr>
        </tbody>
      </table></div>
    </section>`,
    faq: [
      { q: "Can I switch from another app mid-planning?", a: "Yes. Create a Snapjar album and print new cards. Guests only see whatever QR is on the table that night." }
    ],
    related: ["guestpix-alternative", "pov-alternative", "wedding", "pricing", "for-photographers", "how-it-works"]
  },
  {
    slug: "pov-alternative",
    title: "POV App Alternative for Guest Photos | Snapjar",
    description: "Need a POV alternative for wedding guest photos? Snapjar is QR photo sharing for $19.99 per event, no guest app, free 25-photo trial.",
    eyebrow: "POV alternative",
    h1: "Guest candids without another wedding-vendor invoice",
    lede: "POV and tools like it sell a full guest-capture experience. Snapjar sells the part most couples actually use: a QR code and an album that fills up during the reception.",
    cta: "Start a free album",
    crumb: "POV alternative",
    stepsTitle: "Decide in an hour, not a sales call",
    steps: [
      { h: "Make an album now", p: "No demo calendar. Name the event, get a QR, send it to yourself." },
      { h: "Test with real people", p: "Add 25 photos for free. If your family can do it, your reception can do it." },
      { h: "Upgrade if Saturday will be big", p: "$19.99 unlimited. $29.99 if you want a unique sign per table." }
    ],
    split: {
      h: "When to stay with a bigger app",
      ps: [
        "If you want a heavily designed guest journey, prompts, or venue-screen packages, look at POV's current offering and see if those extras are in your budget.",
        "If the brief is 'get the photos off the phones,' Snapjar is built for that brief and nothing else."
      ],
      quote: "The guests do not care which logo is on the card. They care that scanning it works.",
      by: "The only review that matters that night"
    },
    extra: `<section class="section">
      <h2>What Snapjar does not pretend to be</h2>
      <p class="section-sub" style="margin-bottom:0;text-align:left;max-width:720px;margin-left:auto;margin-right:auto">We are not a photographer, not a live-video crew, and not a 40-page brand system. We are the jar you drop the guest photos in. That is why it is $19.99.</p>
    </section>`,
    faq: [
      { q: "Will guests have to make a POV-style profile?", a: "No. Snapjar guests do not create accounts." }
    ],
    related: ["guestpix-alternative", "wedibox-alternative", "wedding", "pricing", "how-it-works", "faq"]
  },
  {
    slug: "google-photos-shared-album",
    title: "Google Photos Shared Album Alternative | Snapjar",
    description: "Google Photos shared albums need Google accounts and still miss half the guest list. Snapjar uses a QR code anyone can scan. No app, $19.99 per event.",
    eyebrow: "vs Google Photos and iCloud",
    h1: "A shared album that does not require the right login",
    lede: "Google Photos shared albums work when everyone already lives in Google. Weddings and reunions are full of people who do not. A QR code does not ask what ecosystem they bought into.",
    cta: "Create a QR album free",
    crumb: "vs Google Photos",
    stepsTitle: "Where shared albums fall down at events",
    steps: [
      { h: "The account wall", p: "iCloud shared albums want Apple. Google wants Google. A plus-one with the other kind of phone sits it out." },
      { h: "The invite mess", p: "You end up emailing links, chasing addresses, and still missing the table of cousins." },
      { h: "The quality tax in chats", p: "When the shared album fails, people dump photos in texts, which crush them. Snapjar is built so that is not the fallback." }
    ],
    split: {
      h: "Use Google Photos for your own library. Use a QR for the room.",
      ps: [
        "After the event you can download Snapjar photos and put keepers in Google Photos or iCloud yourself. That is a good workflow.",
        "During the event, the constraint is guests, not your personal backup stack."
      ],
      quote: "We sent a Google album link. Half the table said they would join later. Later never came.",
      by: "The usual ending"
    },
    extra: `<section class="section">
      <h2>Side by side</h2>
      <div class="compare-wrap"><table class="compare">
        <thead><tr><th></th><th>Snapjar</th><th>Google Photos shared album</th><th>Group chat</th></tr></thead>
        <tbody>
          <tr><td>Guest setup</td><td>Scan QR</td><td>Google account</td><td>Must already be in the chat</td></tr>
          <tr><td>Works on any phone</td><td>Yes</td><td>Awkward if they are not in Google</td><td>Yes, with compression</td></tr>
          <tr><td>In the room reminder</td><td>Printed card</td><td>A link you hope they open</td><td>None</td></tr>
          <tr><td>Price</td><td>Free or $19.99 once</td><td>Free, with account friction</td><td>Free, with lost photos</td></tr>
        </tbody>
      </table></div>
    </section>`,
    faq: [
      { q: "Can I export to Google Photos after?", a: "Download the photos from a paid album and add them wherever you keep your library." },
      { q: "Is Snapjar a backup product?", a: "No. It is sharing for an event. Download what you want to keep." }
    ],
    related: ["how-it-works", "qr-code-photo-sharing", "wedding", "family-reunion", "pricing", "guestpix-alternative"]
  },
  {
    slug: "for-photographers",
    title: "Guest Photo QR Albums for Wedding Photographers | Snapjar",
    description: "Give couples a QR guest-photo album without adding a $100 app to their invoice. Snapjar is $19.99 per event, no guest app. Built for photographers to recommend.",
    eyebrow: "For wedding photographers",
    h1: "You shoot the wedding. Their guests still take 400 photos you will never see.",
    lede: "Those candids are not a threat to your gallery. They are the reception the couple actually lived. Hand them a QR album so you are not also on the hook for collecting Uncle Dave's camera roll.",
    cta: "Make a sample album",
    crumb: "For photographers",
    stepsTitle: "How photographers use it",
    steps: [
      { h: "Recommend, do not operate", p: "Couples create the album. You are not running a second business at midnight. You look prepared because you had an answer when they asked." },
      { h: "Keep your job distinct", p: "Your photos stay your photos. Guest uploads live in a separate album with a random code, not mixed into your delivery." },
      { h: "A kind add-on", p: "If you want to include it, Party is $19.99. That is cheaper than most print credits and it solves a question you already get." }
    ],
    split: {
      h: "This is not a second shooter in an app",
      ps: [
        "Snapjar does not grade color, pose families, or replace coverage. It collects the messy guest photos so the couple stops asking you if you 'got that moment from the back table.' You did not. Someone's phone did.",
        "Create a demo album with your studio name and send the link when a couple asks how to gather guest photos."
      ],
      quote: "I would rather they have a plan than email me 80 screenshots in January.",
      by: "The January inbox"
    },
    extra: `<section class="section">
      <h2>What to tell couples</h2>
      <p class="section-sub">Copy this if you want.</p>
      <div class="quote-card" style="max-width:720px;margin:0 auto;transform:none">
        <p>"I handle the professional gallery. For guest candids, put a Snapjar QR on the tables. They scan, photos land in one album, no app. It's $19.99 if they want unlimited."</p>
        <span>getsnapjar.com</span>
      </div>
    </section>`,
    faq: [
      { q: "Will guest photos leak into my gallery?", a: "No. Different album, different link. Your contract and delivery stay yours." },
      { q: "Can my studio be credited?", a: "The album name and printable sign are the couple's. If you want a line on a sign, they can write it." }
    ],
    related: ["for-wedding-planners", "wedding", "pricing", "how-it-works", "rehearsal-dinner", "faq"]
  },
  {
    slug: "for-wedding-planners",
    title: "QR Guest Photo Albums for Wedding Planners | Snapjar",
    description: "A simple guest-photo plan to give couples: QR codes on reception tables, no app, $19.99 per event. Snapjar for wedding planners.",
    eyebrow: "For wedding planners",
    h1: "When couples ask how guests share photos, have an answer that is not 'a Facebook album'.",
    lede: "You already run a hundred details. Guest photo chaos should not become another vendor call. Snapjar is a QR card and a link. Couples can set it up themselves in a minute.",
    cta: "Preview an album",
    crumb: "For wedding planners",
    stepsTitle: "Drop it into the timeline",
    steps: [
      { h: "Week-of reminder", p: "Couples create the album, print cards, put one per table with the numbers. Pro prints a unique QR per table if they want photos tagged." },
      { h: "No guest app in the welcome bag", p: "You do not have to explain a download. The camera app is enough." },
      { h: "You are not on photo duty", p: "They own the album. You are not collecting files after send-off." }
    ],
    split: {
      h: "Looks organized because it is small",
      ps: [
        "Planners get blamed when the 'shared album' nobody joined fails. A physical QR on the table is visible, which is what anxious couples want.",
        "Point them at getsnapjar.com. Free to test at the shower. $19.99 for the reception."
      ],
      quote: "The best guest-photo system is the one on the table, not the one in an email from May.",
      by: "Week-of reality"
    },
    faq: [
      { q: "Does this need venue wifi?", a: "No. Phones use cellular. Wifi helps, it is not required." },
      { q: "Can we add it to a day-of timeline?", a: "Yes. 'Place QR cards with table numbers' is a real line item. It takes a few minutes." }
    ],
    related: ["for-photographers", "wedding", "pricing", "how-it-works", "qr-code-photo-sharing", "faq"]
  }
];

function sitemapXml(slugs) {
  const urls = [
    { loc: `${ORIGIN}/`, priority: "1.0", changefreq: "weekly" },
    ...slugs.map((slug) => ({
      loc: `${ORIGIN}/${slug}`,
      priority: slug === "pricing" || slug === "how-it-works" || slug === "wedding" || slug === "qr-code-photo-sharing" ? "0.8" : "0.7",
      changefreq: "monthly"
    })),
    { loc: `${ORIGIN}/contact`, priority: "0.4", changefreq: "yearly" },
    { loc: `${ORIGIN}/privacy`, priority: "0.3", changefreq: "yearly" },
    { loc: `${ORIGIN}/terms`, priority: "0.3", changefreq: "yearly" }
  ];
  const body = urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>2026-08-27</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

for (const page of pages) {
  writeFileSync(join(ROOT, `${page.slug}.html`), wrap(page));
}
writeFileSync(join(ROOT, "sitemap.xml"), sitemapXml(pages.map((p) => p.slug)));
console.log(`Wrote ${pages.length} pages plus sitemap.xml`);
