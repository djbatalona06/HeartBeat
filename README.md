# HeartBeat

A gamified life tracker for two people. Moods, workouts, cycles and calendars in
one place, on both phones, with nudges that arrive whether the app is open or not.

If you got here from a birthday present: hey babe :). Start below.

---

## Getting it on your phone

It installs like an app but arrives through Safari. Four steps.

**1 · Open the app link in Safari.** Not Chrome, and not the browser inside
Instagram or Messages — actual Safari. If you couldn't find it yet, it's in the bio section of this repo 
iPhone only allows web apps to install from there. 

**2 · Tap Share, then Add to Home Screen.** This step is not cosmetic. iOS
refuses to deliver notifications to a web app unless it has been added to the
Home Screen and opened from that icon.

**3 · Open it from the icon and allow notifications.** iOS only shows the
permission prompt on a tap inside the installed app. If you decline by accident,
the only way back is to delete the icon and add it again — so say yes.

**4 · Tap the invite link.** One tap and the two phones are paired. No account,
no password, no phone number. (If this deploy has sign-in switched on, you can
also connect a GitHub or Google account afterwards — purely as a way back in if
the phone is lost. It is never how you get *in*.)

Android is simpler: Chrome will offer to install it, and notifications work
without the Home Screen step.

## What's on it

The home screen is your pet, in the middle, with six doors evenly spaced in a
ring around it. A door wears a dot when there is something logged behind it
today, and says nothing otherwise.

| Door | What it holds |
|---|---|
| **Mood** | Three sliders, 1–10: hunger, joy, moody. Both of you, side by side |
| **Move** | A workout log, and camera proof — front and back — that you did it |
| **Work** | A shared calendar, filled from a file you export from your own |
| **Cycle** | Period tracking, behind its own PIN if you want one |
| **Party** | The two of you as a party: gear, pets, and the boss you are fighting |
| **Settings** | Pairing, the theme picker, your partner's name and photo, calendar |
| **Study** | 226 flashcards on programming, spaced out so they stick, plus a timed quiz |

The **pet** is the point. It gains XP when either of you logs something, and
levels up on quests that get set from a few questions during setup. Rep ranges,
streaks, achievements worth a big bonus. Neglect it and it sulks.

## Themes

Five, switchable any time under Settings: Hello Kitty, SpongeBob, Naruto, The
Last Airbender, My Little Pony. Each is a palette plus a hand-drawn animated
backdrop. Every artwork is original — see [NOTICE.md](NOTICE.md).

Each comes **both ways**: every theme has a dark palette and a white one, and a
Light / Dark / System control under the picker chooses between them. System is
the default and follows your phone, so it turns over when your phone does. The
backdrops are drawn differently in each — a pale sparkle on a white page is not
a subtle sparkle, it is an invisible one.

Backdrops pause when the app is in the background, respect your phone's
reduced-motion setting, and damp under **Calm mode**. Palette contrast is
enforced by tests, so a theme cannot ship with text you can't read.

## Privacy

Your phone holds the record. The server holds a copy so the other phone can read
it, and that is the whole reason it exists — a shared tracker that shares nothing
is just two separate apps.

Concretely: mood, exercise, cycle and calendar entries are stored on the server,
readable only by the two devices paired to your couple.

**Images are stored on the server too.** Workout proof and your profile photo
are synced, because a shared tracker whose photographs only one person can see
is not shared. Both are downscaled on the phone before they are sent — proof to
roughly 180 KB, a profile photo to 64 KB — and both are readable only by the two
devices paired to your couple, exactly like every other entry. If you would
rather a photograph stayed on your phone, do not take it in the app.

There are no accounts, no analytics, and no email addresses.

There is **one optional third party**, and only if the person deploying it turns
it on: sign-in with GitHub or Google, as a way back in if you lose your phone.
It is off unless a client ID and secret are configured, and when it is off the
app never contacts either company. Even switched on it is not a login — the
pairing code is still the only way into a couple, and signing in with an account
nobody connected gets you told so and nothing else. Google is asked for `openid`
alone and GitHub for no scope at all, so what is stored is an opaque account id
and never an address, a name or a photograph.

Invite links expire after fifteen minutes and work exactly once. A couple is two
people; a third join is refused.

---

## The gift

[`gift/`](gift) holds the birthday piece this repo grew out of.
`gift/birthday.html` is one self-contained file — every photograph, both
typefaces and three.js are inside it. Download it, double-click it, and it works
with no internet, forever.

Six screens: a gate, a title, an envelope, a letter that types itself, the
records, and the guide to installing the app. The records are the middle of it —
every photograph pressed as vinyl, standing in a file box you flip
through — dragged sideways with a mouse, swiped up and down with a thumb. On a
desktop you tap one; on a phone you hold it and carry it across. Either way it
lands on a pink turntable, the arm swings over, and it turns at a real 33⅓ rpm. Tap it again to see the photograph full
screen. Play them all, or press *make the heart*, and the records rise out of
the box and re-form the heart the original piece was built around.

How to rebuild it is in [`docs/DEVELOPING.md`](docs/DEVELOPING.md#the-gift).

## The study page

[`study/index.html`](study) is the app's Study screen built as one self-contained
file — React, the theme engine, both typefaces and all 226 cards inside it.
Download it, double-click it, and it works with no internet.

One caveat worth knowing: opened straight off the disk, Chrome treats the page
as having no origin and refuses it any storage at all, so the sitting works but
a reload starts over. The page says so, and has **Save progress** for exactly
that. Opened from a web address — the link on the front door — it remembers
normally.

How it is built is in [`docs/DEVELOPING.md`](docs/DEVELOPING.md#the-study-page).

## For developers

Installing, running, testing and deploying all live in
[`docs/DEVELOPING.md`](docs/DEVELOPING.md).

## Licence

MIT. See [NOTICE.md](NOTICE.md) for the artwork and trademark position.
