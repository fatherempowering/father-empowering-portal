# Week 0 / Portal Refinements — v2.3

- Centered Week 0 action buttons.
- Active Week 0 sub-tab now scrolls horizontally into view.
- Fixed calibration exercise list and preserved only the approved press choices.
- Replaced cardio estimate with the official Concept2 2000 m VO2max formula.
- Input uses pounds; conversion to kilograms is internal.
- Added sex and training-level fields (highly trained / not highly trained).
- Added average pace, watts, age/sex fitness classification, and CoachMax interpretation.
- Kept local save and CoachMax/Vercel send logic intact.
- Mobile Week 0 photo cards stack in one column and no longer overlap.
- Added orange-to-transparent area gradients only to Body Weight and Total Load charts.
- Preserved all existing Week 0 data through schema-compatible normalization.


## v2.4 — Week 0 scroll fix
- Removed vertical `scrollIntoView()` from Week 0 sub-tab changes.
- Kept horizontal centering of the active step tab only.
- After onboarding completion, Week 0 now opens at the top so the global DATA ACQUISITION hero is visible.
- Updated the service-worker cache version.


## v2.6 — Week 0 completion gate
- Added global Week 0 progress card and completion percentage.
- Send buttons stay disabled until Photos, Measurements, Loads, Cardio, and Mobility meet minimum requirements.
- Added a validation guard inside the send function to prevent incomplete submissions.
- Missing sections are listed and the client is directed to the first incomplete step.
- Existing local save, CoachMax endpoint, photos, and submitted-state logic preserved.
