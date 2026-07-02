# Snapjar launch kit

Everything below is ready to paste. Edit lightly so it sounds like you, then ship it. Do not post all of it in one day; spread it across the week so each channel gets real attention and replies.

---

## 1. The demo video (do this first, everything else feeds off it)

You need 60 to 90 seconds of real footage. Host anything: taco night, game night, backyard hang. Four friends is enough.

Shot list:
1. Close-up: the printed QR card on a table (3 sec)
2. Someone scans it with their phone camera, album opens instantly (5 sec)
3. They snap a photo of the table and tap Add photos (5 sec)
4. THE MONEY SHOT: a laptop or TV showing the album, and the photo pops in live. Film the screen and the person together (8 sec)
5. Fast montage: different hands, different phones, photos stacking up in the gallery (10 sec)
6. Morning-after shot: scrolling a full gallery with coffee (5 sec)

Film everything vertical. Natural light. Do not add music in-app until you pick trending audio at post time.

### TikTok / Reels / Shorts, video 1 (the builder story)
Hook text on screen: "you take 400 photos at a party and see 12 of them. so i built this"
Caption: I got tired of never getting the photos back from my own parties, so I made a thing. You put a QR code on the table and every photo your guests take lands in one album. No app. Link in bio if you want it for your next party.
Hashtags: #weddingtok #weddingplanning #partyideas #buildinpublic #sidproject (check spelling: #sideproject)

### Video 2 (the wedding angle, post 2 days later)
Hook: "wedding photographers hate that the best photos of your wedding are on your guests' phones"
Caption: Your photographer gets the ceremony. Your guests get everything else. This collects all of it with one QR code on the tables. First 20 weddings get the unlimited plan free, DM me your album code.
Hashtags: #weddingplanning #brides2026 #weddingideas #weddinghack

### Video 3 (the morning after, post 2 days after that)
Hook: "POV: it's the morning after your party and you have every single photo"
Caption: 340 photos from one night. Zero group chats. Zero "can you send me those pics" texts. QR code on the table, that's the whole trick.

---

## 2. Reddit

### r/weddingplanning (read their self-promo rules first; if unsure, message the mods and ask)
Title: I built a cheap alternative to those $100+ guest photo QR apps, looking for feedback from people actually planning weddings

Body:
Hey all. I kept seeing posts here about Guestpix and similar apps being great but pricey, so I built a simpler version: guests scan a QR code on the table, every photo they take goes into one shared album, no app to download. Free for small stuff, $19 one time for unlimited photos.

I'm a solo dev and this launched this week, so I'd genuinely love brutal feedback. First 20 people who comment or DM get the unlimited plan free for their wedding, no strings. getsnapjar.com

(Reply to every single comment. Sort by new for the first 3 hours.)

### r/SideProject and r/InternetIsBeautiful (more launch-friendly)
Title: I made a QR photo album for parties because nobody ever sends you the photos after

Same body, less wedding-specific. These communities upvote honest solo-dev stories.

---

## 3. Facebook wedding groups

Search Facebook for: "wedding planning [your state/city]", "budget brides", "DIY wedding". Join 5 to 6, read the rules, participate genuinely for a day before posting.

Post:
Made something for my own party problem and figured brides here might want it: a QR code you put on reception tables, and every photo your guests take lands in one shared album. Nothing to download, works on grandma's phone. Free to try, $19 for unlimited (the similar apps I found were $60 to $250 so I priced it at what I'd actually pay). Happy to set anyone's album up personally if you tell me your wedding date. getsnapjar.com

---

## 4. Instagram DMs to vendors (30 photographers, 10 planners, 10 DJs)

Find them: search your city + "wedding photographer" on Instagram, pick active accounts with 1k to 20k followers (big enough to have clients, small enough to reply).

First message (photographers):
Hey [name], your [specific recent post] shot is gorgeous. Quick one: I built a QR photo-sharing tool for receptions (guests scan, all their candids land in one album). I'm giving wedding vendors unlimited albums free to offer their couples, and the album page can credit your studio. Zero catch, I'm a solo dev launching this month and vendor word of mouth is my whole marketing plan. Want me to set one up for your next wedding?

For planners and DJs, swap the middle: planners care that it makes THEM look organized, DJs care that the live gallery on a screen fills dead time. Adjust one sentence, keep the rest.

Follow-up after 3 days of silence, once only:
No worries if this isn't interesting! One-line version: free unlimited guest photo albums for your events, your branding on the page. If a couple ever asks you "how do we get everyone's photos", now you have an answer.

---

## 5. The free-upgrade fulfillment flow

When you give someone a free Party upgrade (Reddit, Facebook, vendors):
1. They send you their album code (6 characters, shown in their album link)
2. Firebase console > Firestore > events > their code > set paid to true
3. Reply: "Done, you're unlimited. Have an amazing one, and if it works well a mention in [group/thread] would mean the world."

That last sentence is the engine. Every freebie must ask for the mention.

## 6. Paid sales fulfillment

Stripe emails you on every payment. The payment shows client_reference_id = their album code.
1. Open Firestore, find events/{code}, set paid to true
2. If you want to be excellent: they paid from inside their album, so they're watching it. Flip it fast and the badge appears while they're still there.

Check Stripe on your phone hourly during launch days. Speed of fulfillment IS the product experience until the webhook exists.

---

## 7. The week, scheduled

- Day 1: Redeploy site. Film the demo at a real hangout. Set up Search Console + Bing, submit sitemap.
- Day 2: Edit and post video 1 (all three platforms). Reply to every comment.
- Day 3: Reddit posts (morning, US time). Facebook group joins. Reply all day.
- Day 4: Video 2. Start the 50 vendor DMs, 15 to 20 per day so Instagram doesn't flag you.
- Day 5: Facebook group posts (you've been a member 2 days now). Finish DMs.
- Day 6: Video 3. Follow-ups on DMs. Post the "morning after" gallery screenshot in the Reddit threads as an update comment.
- Day 7: Count money, thank everyone who helped, write down the one complaint you heard three times. That's next week's work.

Numbers to expect, honestly: videos are a lottery ticket (0 to 100k views), Reddit and Facebook are reliable single-digit sales, vendor DMs are slow but compound. Ten paid events is $190 and roughly 800 people who saw a QR card with your domain on it. The second week is easier than the first.
