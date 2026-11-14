# KinTrace demo video script (2 minutes 40 seconds)

Audience: judges who are senior engineers and architects. Tone: plain, specific, no hype. Every claim on screen is something the viewer can check in the repository.

Voice-over is about 390 words, a comfortable pace for 2:40. Times are cumulative.

## Pre-recording checklist

- [ ] Browser window at exactly 1440 x 900, zoom 100%, a clean profile (no extensions, no bookmarks bar, no saved data for the site).
- [ ] Open the live site. If a tree is saved from a rehearsal, use Clear everything on the builder first.
- [ ] Language set to English (the Language menu in the header shows English).
- [ ] On the home page, click **Try the sample family** so the sample data is loaded (mother with breast cancer at 38, father with a heart attack at 57, maternal aunt with ovarian cancer at 44, maternal grandmother with breast cancer at 52, paternal uncle with bypass surgery at 54).
- [ ] The AI switch in Quick add is **off** (the default). The demo uses the offline parser, so it works with no key and no network.
- [ ] Rehearse the Quick add sentence once, then Undo it, so the tree is back to the sample family: `My brother had a heart attack at 48.`
- [ ] DevTools docked at the bottom, closed, with the Network panel selected and "Preserve log" on, ready to open with one shortcut at 1:55.
- [ ] A terminal window ready with the repository open, font size 18, showing the last `npm run verify` table (PASS lines) and the test numbers.
- [ ] An editor tab open at `src/guidelines/profiles/cardio.ts`, scrolled to the CG71 rule, font size 18.
- [ ] Notifications off, cursor highlighting on, microphone level checked.
- [ ] End card image ready: KinTrace name, tagline, live URL and repository URL.

## Shot list

| # | Time | Shot | Screen |
| --- | --- | --- | --- |
| 1 | 0:00 to 0:15 | Home page, slow scroll to the sample tree figure | Browser |
| 2 | 0:15 to 0:45 | Builder with the sample family; Quick add | Browser |
| 3 | 0:45 to 1:15 | Findings: evidence rings, rule steps, What we don't know | Browser |
| 4 | 1:15 to 1:40 | Compare guidelines, heart guidelines, the father at 57 | Browser |
| 5 | 1:40 to 1:55 | Report for your doctor | Browser |
| 6 | 1:55 to 2:30 | Rule code, AI switch, Network panel, verify table, BUGS_FOUND | Editor, browser, terminal |
| 7 | 2:30 to 2:40 | Limitations and roadmap section of the README | Browser |
| 8 | 2:40 | End card (still, 3 seconds, no voice-over) | Image |

## Script

### 0:00 Hook

**On screen:** the KinTrace home page. Scroll slowly down to the figure of the sample family with three relatives ringed.

**Voice-over:** "Family history is the cheapest screening test in medicine, and most people don't know which of their relatives actually matter."

### 0:15 The tree and Quick add

**On screen:**
1. Click **Start your tree** (or the builder link in the header). The sample family is on the canvas: ten people, conditions and ages under each symbol.
2. Hover the mother: her label reads breast cancer at 38.
3. Click into **Describe your family in your own words** and type: `My brother had a heart attack at 48.`
4. Click **Suggest entries**. One suggestion appears: a new person, brother, heart attack at 48, with the quoted text under it.
5. Click **Accept**. The brother appears on the tree.

**Voice-over:** "This is a family tree in KinTrace: the sample family, ten people, with ages and conditions. You can draw it, or just type. I'll write one sentence: my brother had a heart attack at forty-eight. That was parsed in the browser, with no AI and no network, and nothing goes on the tree until I accept it. Every suggestion shows the exact words it came from."

### 0:45 Findings, evidence rings and what we don't know

**On screen:**
1. Click **See findings**.
2. The breast and ovarian cancer guideline (NICE CG164) shows the **Meets criteria** sticker. The mother, maternal aunt and maternal grandmother are ringed on the tree.
3. Expand the finding: the rule steps are listed, each marked passed, with the relatives named.
4. Move to the **What we don't know** panel: point at Data completeness and the list of gaps (the paternal grandparents unknown, missing ages).
5. Point at the CG164 rule about both breasts, marked **Worth discussing**: it is open because it is not recorded whether one or both of the mother's breasts were affected. Show its "What would change this" line.

**Voice-over:** "Findings are only ever three words: meets criteria, worth discussing, or no criteria met. Never a percentage, never a diagnosis. Here, NICE CG164 is met, and the relatives it rests on are ringed on the tree, with every rule step spelled out. And this panel shows what we don't know: unknown grandparents, missing ages. Unknown is never treated as healthy. This rule is still open only because we don't know whether one or both breasts were affected, so it says worth discussing, and exactly what would settle it."

### 1:15 Compare guidelines: the father at 57

**On screen:**
1. Click **Compare guidelines** and choose the heart guidelines.
2. The table shows NICE CG71, the DLCN family-history item and NICE NG238 side by side.
3. Point at the **What it counts** column: CG71 and NG238 say under 60; DLCN says under 55 for men, under 60 for women.
4. Point at **Relatives counted**: CG71 and NG238 count the father and the brother; DLCN counts only the brother. Point at **Seen but not counted** under DLCN: the father, 57.
5. Point at **Why they differ**: "Their age limits are not the same".

**Voice-over:** "Guidelines disagree, and KinTrace shows why. Same father, heart attack at fifty-seven. The two NICE guidelines count him, because their limit is sixty. The Dutch Lipid Clinic item doesn't, because its limit for men is fifty-five. Before I added the brother, that item said no criteria met; now it counts only him. The app doesn't pick a winner. It shows each rule and lets the clinician decide."

### 1:40 The doctor report

**On screen:**
1. Click **Report for your doctor**. The one-page report appears: tree, findings with their rule steps, the gaps, guideline sources and review dates.
2. Tick **Hide names**; the names become relationships.
3. Hover **Print / Save as PDF** (do not open the print dialog).

**Voice-over:** "The output is one page for the doctor: the tree, each finding with its rule steps and sources, and what's still unknown. Names can be hidden, and it always prints on a single page."

### 1:55 Under the hood

**On screen:**
1. Editor: `src/guidelines/profiles/cardio.ts`, the CG71 rule with its age limit. Hold two seconds.
2. Browser, builder page: point at the Quick add switch **Use AI for longer or non-English text**, off.
3. Open DevTools, Network panel. Reload the findings page and click through to the report. Sort by Domain: every request is the site's own domain.
4. Terminal: the `npm run verify` table, all PASS. Then the README Testing table with the counts.
5. Browser: `docs/BUGS_FOUND.md` on GitHub, scroll the bug headings.

**Voice-over:** "Under the hood: every finding comes from a plain TypeScript function, tested at each age threshold and either side of it. No model decides anything. AI is used in exactly one place, turning text into proposed entries, it's off until you switch it on, and any failure falls back to the offline parser. The tree never leaves the browser: a test walks the whole app and asserts zero requests to any other origin. There are 999 unit, property and fuzz tests, 266 browser tests across three engines and five screen widths, and a mutation score of 78.4% on the rules. The edge-case tests found 15 real bugs, like two tabs silently overwriting each other's tree, and a report dated the wrong day in some time zones. Each is fixed, with a test."

### 2:30 Limits and roadmap

**On screen:** the README section **Limitations and caveats**, then **Roadmap**.

**Voice-over:** "It's not a medical device. The guidelines are from UK, Dutch and international sources, so local guidance may differ. Next: more conditions, more guidelines and reviewed translations."

### 2:40 End card

**On screen:** still image for 3 seconds: KinTrace, "Your family tree, checked against clinical guidelines", the live URL and the repository URL. No voice-over, soft music out.
