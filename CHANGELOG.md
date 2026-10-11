# Maple Wordle changelog

## alpha v2.1 - 11 October 2026
- Each new guess flips in one card at a time, left to right (the answer flips in after your last guess if you run out); the result text and Best so far row wait until the flip is done
- Confetti when you win
- Game buttons light up when you hover over them

## alpha v2.0 - 11 October 2026
- New game: Guess the Class (Wordle style), 5 guesses, a new class every day at 00:00 UTC
- Columns: Faction, Job Branch, Main Stat, Release Year (GMS) and Region; Job Branch, Main Stat and Region show yellow when they partly match, Release Year has arrows and is yellow within 4 years
- 56 answers, including removed classes (Jett, Beast Tamer, Zen), event classes (Pink Bean, Yeti, Tanjiro, Saitama) and upcoming Iel
- Classes that match in every column share one card (Hero / Paladin / Dark Knight, Arch Mage (F/P) / Arch Mage (I/L) / Bishop, Bow Master / Marksman, Night Lord / Shadower); type any of their names to find it
- Class pictures: newest NPC portraits, plus artwork for classes without one
- Archive, win streak, Share, Best so far row and everyone's results, same as Guess the Boss
- Animation Attack mode for Guess the Class: coming soon
- Share links point to ima.moe; the github.io address now sends you to ima.moe and brings your saves and streaks along

## alpha v1.2.2 - 11 October 2026
- Extreme mode: new Difficulty column right after Boss (Easy < Normal < Hard/Chaos < Extreme/Hell) with arrows, yellow when one tier off; boss names in the table drop the "(difficulty)" part
- Boss dropdown is in alphabetical order (difficulties listed Easy, Normal, Hard/Chaos, Extreme), and searching matches the boss name only (not "(Hard)" / "(Chaos)")
- Click outside the Changelog or Archive window to close it
- Region fixes: Yakuza Boss and Frenzied Gigatoad are JMS / GMS / MSEA only, Malicia is also in MSEA
- Boss pictures for Yakuza Boss, Frenzied Gigatoad, Extreme Bigfoot, Inferno Wolf, Reina, Gerand Darmoor and Havoc
- Inferno Wolf is now one boss with Normal / Chaos / Extreme difficulties
- Reina and Havoc have difficulty "Unknown (Apostle)"; Gerand Darmoor is "Unknown (God-King)" with entry level 300+; Darmoor and Havoc are in All regions
- Removed Aufheben and Tweentona
- Meilin: boss picture added, now counts as 2 phases
- New Ursus picture
- Game selector: Guess the Class (working on it) now sits between Guess the Boss and Guess the Map

## alpha v1.2.1 - 11 October 2026
- "Best so far" row above your guesses: every category you've found in green, and the closest guess so far for Phases, HP and Entry Lv
- Search box unfocuses after a guess, so one click reopens the boss list

## alpha v1.2 - 11 October 2026
- Boss picker shows each boss's photo + name; clicking a boss guesses it (Guess button removed)
- Win streak per mode: Normal / Hard / Extreme reset only on a loss, Story resets if you miss a day
- Search box is hidden on the result screen

## alpha v1.1.1 - 11 October 2026
- Story mode hints: unlock one every 3 guesses; each adds a row revealing one answer category you don't have green yet (other boxes grey), then the first letter of the boss name once every category is known; hints used are shown at the end and in Share
- Fairer daily boss: from puzzle #3, every boss is picked once per cycle before any repeats, with no back-to-back repeats
- Zakum counts as 1 phase, HP is body only
- Difficulty priority: Hard/Chaos > Extreme > Normal > Easy
- Game selector (Guess the Map / Class coming soon)

## alpha v1.1 - 10 October 2026
- Everyone's results: bar chart of how many guesses players needed, with averages (Cloudflare Worker + D1 database)
- Custom domain: ima.moe/maplewordle
- Boss photo cards (Maple Guide icons)
- Archive with Story / Normal / Hard / Extreme tabs
- Same boss at another difficulty shows yellow (Extreme)

## alpha v1.0.3 - 10 October 2026
- MapleStory background with blurred game panel
- Discord feedback link

## alpha v1.0.2 - 10 October 2026
- Green / yellow / red tiles with close / far arrows
- In-page boss dropdown and mode buttons (visible on Discord streams)
- Daily reset timer, saved progress, answer reveal, Share button

## alpha v1.0.1 - 10 October 2026
- Centered layout, difficulty shown in boss names

## alpha v1.0.0 - 10 October 2026
- First playable version
