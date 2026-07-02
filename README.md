# Snapjar

QR photo sharing for weddings and parties. Guests scan a code on the table and every photo they take lands in one shared album. No app, no accounts, works on any phone.

**The business in one line:** hosts pay $19 one time per event. Competitors (Guestpix, POV, Wedibox) charge $60 to $250 for the same job, so $19 is an easy yes.

## What's in here

```
public/
  index.html      landing page
  create.html     host creates an album, gets a QR code, printable table card
  event.html      guest gallery: scan, upload, watch photos appear live
  assets/
    style.css
    firebase-init.js   <- paste your Firebase config here (the only file you must touch)
    create.js
    event.js
firestore.rules   locked down: guests can add photos, only you can flip paid flags
storage.rules     images only, 10 MB cap, signed-in users only
firebase.json     hosting + rules config
```

No build step. No npm install. It's static files plus Firebase, which means nothing to break at 11pm on a Saturday when someone's wedding is using it.

## Setup (about 20 minutes)

1. Create a Firebase project at console.firebase.google.com
2. Add a **web app**, copy the config object into `public/assets/firebase-init.js`
3. Enable **Authentication > Anonymous** sign-in
4. Create a **Firestore** database (production mode, the rules file handles access)
5. Enable **Storage** (heads up: new projects need the Blaze plan for Storage, which requires a card but stays free within the generous allowances; client-side compression keeps you well inside them)
6. Install the CLI and deploy:
   ```
   npm i -g firebase-tools
   firebase login
   firebase use --add        (pick your project)
   firebase deploy
   ```
7. Point your domain at it: Hosting > Add custom domain
8. Create one album yourself, upload 15 good photos, and use it as your live demo link everywhere

## How the money works this week

No payment code needed for launch:

1. The Stripe Payment Link lives in `public/assets/config.js` (already set)
2. Every upgrade link automatically appends the album code as `client_reference_id`, so each payment in your Stripe dashboard shows exactly which album bought it
3. When a payment lands, open Firestore in the console, find `events/{that code}`, set `paid` to `true`. Takes ten seconds.
4. Upgrade prompts appear in three places: the album-created success screen, the album header (hosts only), and the album-full notice.

Manually flipping a flag feels scrappy because it is. It's also the correct amount of engineering for week one. Automate it with a Stripe webhook + Cloud Function once you're doing a few sales a day.

The rules file makes this safe: nobody can flip their own `paid` flag, only you can, from the console.

## The 7-day plan

**Day 1 (today):** Deploy. Hook up the domain. Create the demo album and fill it with real-looking photos (host a taco night, invite 4 friends, that IS your demo content).

**Day 2:** Stripe payment link. Film everything at that taco night: someone scanning the QR, photos popping into the gallery live on a laptop screen. That footage is your entire marketing budget.

**Day 3:** Post the video. "I built an app so you actually get the photos from your own party" is the hook. TikTok, Reels, and Shorts, same clip, all three. Post the demo album link in the comments, not the caption.

**Day 4:** Go where the buyers already are. Facebook wedding planning groups and r/weddingplanning allow genuine "I made this" posts if you're upfront and useful. Offer the first 20 people a free Party upgrade for feedback. Free users at a wedding are 80 people seeing your QR code.

**Day 5:** DM 30 wedding photographers and planners on Instagram. Offer: free Party albums for their events, their business name on the album page. They have the clients you want and photo delivery is their constant headache.

**Day 6:** Follow up on everything. Post a second video: the "morning after" angle, waking up to 340 photos.

**Day 7:** Count the money, read every message you got, fix the one thing everyone complained about.

Realistic math: weddings alone are a huge market and every summer weekend has thousands of them. You don't need to go viral. Ten sales is $190, and every free event is a room full of people scanning your product.

## The iOS play (after this week)

The web app is the funnel, the iOS app is the moat:

- **Live slideshow mode:** iPad or Apple TV at the venue showing photos as they arrive. Hosts will pay extra for this alone.
- **Disposable camera mode:** photos lock until the morning after the event. This mechanic has gone viral before and it fits Snapjar perfectly.
- Same Firebase backend, so the web and iOS versions share every album.

## Notes for future you

- Free limit (25 photos) is enforced in the Firestore rules themselves, not just the browser. Parallel uploads racing the counter can slightly overshoot 25, which is fine; the point is that devtools can't get unlimited for free.
- Admin access requires a signed-in Google account with the exact admin email, verified. Keep 2FA on that Google account; it is the master key.
- QR codes come from api.qrserver.com (free, no key). If you ever want zero third-party calls, swap in a local QR library.
- Photos compress client-side to max 1920px JPEG at 85 quality, roughly 250 to 400 KB each. Firestore and Storage free allowances go a long way at that size.
- "Download everything in one click" on the pricing page is a promised Party feature. Ship it as a simple JSZip page when the first paying customer asks.
