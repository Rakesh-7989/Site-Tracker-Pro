# M-06: DPR — Compose with Voice + Photo + Preview

## Roles
- Tester roles: Architect, PM, Contractor (all can compose DPR)

## Pre-requisites
- [ ] Logged in as PM
- [ ] Project with DPR tab enabled
- [ ] Microphone + camera available (or test photos)
- [ ] Browser: Chrome (desktop)

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Open a project. Click "DPR" tab | DPR dashboard: calendar view or list of daily reports. "New DPR" / "Compose DPR" button | | |
| 2 | Click "New DPR" | DPR compose form: date picker (defaults to today), weather, work description, photos, voice note, milestone selector | | |
| 3 | Click microphone/voice input icon | Browser permission prompt: "Allow microphone access?" | | |
| 4 | Grant permission. Speak "Poured concrete for slab area" | Voice transcribed to text in work description field. Accuracy should be reasonable | | |
| 5 | Click photo upload / camera icon | File picker opens. Options: Take Photo (mobile) or Upload from disk | | |
| 6 | Upload 2 test photos | Thumbnails appear in upload area. Can rearrange or remove | | |
| 7 | Select a milestone from the dropdown | Milestone name appears in DPR summary | | |
| 8 | Click "Preview DPR" | Preview/modal shows full DPR as it will appear: date, weather icon, transcribed text, photos, milestone. Share buttons visible (WhatsApp, PDF) | | |
| 9 | Click "Submit DPR" | DPR saved. Redirected to DPR list. Toast: "DPR submitted". New entry appears in the list with today's date | | |
| 10 | Click on the just-submitted DPR entry | Detail view: full report. Photos viewable. Voice note playable. WhatsApp share button works | | |
| 11 | Click WhatsApp share | Opens WhatsApp (desktop or web) with pre-formatted message containing DPR summary + link | | |
