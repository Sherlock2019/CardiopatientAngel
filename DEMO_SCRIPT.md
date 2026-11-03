# Demo script (≈10 minutes)

Start: `docker compose up --build`, open http://localhost:5180. Say up front: *synthetic data, not a medical device.*

1. **Login as Admin** → *Data Simulator* → **Start simulator** (defaults). Point out readings ingested, duplicates ignored, alarms raised, and the live event feed. *Switch user.*
2. **Login as RN A. Moreau** → **Command Center**.
   - KPIs: monitored patients, active / unacknowledged / critical alarms, repeated-alarm patients, median ack time.
   - Live alarm queue: severity is icon + label + colour; order = source severity → unacknowledged → oldest. Expand a row's chevron to show the *Operational Attention Indicator — Demo Only* factors.
   - Watch new simulator alarms appear (green **Live** dot, top right).
3. **Select an alarm → patient name** → Patient detail: demographics, vitals trends (24 h / 72 h / 7 d), clinical timeline, alarm timeline. **Acknowledge** the alarm; then **Review…** → choose a disposition → *Record review & resolve*.
4. **Switch to Dr. R. Chen** → *Settings → Audit log*: the nurse's patient view, acknowledgment and review are recorded.
5. **Command Center → Outcomes**: deceased vs. discharged alive. Switch dimensions (Age → Disease → Treatment). Show mortality with confidence intervals and "where the groups differ most" — then read the caveat box: e.g. *Cardiac rehabilitation* looks protective only because rehab starts later in longer stays (built-in survival bias).
6. **Risk Analytics**: top-burden cohorts; age chart toggles Rate / Count / % patients; pathology overlap note; treatment causality warning; heatmap 06–09 peak — switch timezone to UTC and watch it shift; age × pathology small-cohort flags; medication × alarm type; trends daily/weekly.
7. **Cohort Explorer**: Age 80–89 + 90+, Heart failure, Diuretics → *Run analysis*. Compare to all patients, show the weekly trend and drill into a contributing patient.
8. **Staffing Insights**: shift comparison, peak windows per unit, current backlog, and the "not a staffing recommendation" note.
9. Close with **Settings → Data notes**: every pattern shown was injected on purpose.

Reset the demo at any time: `docker compose exec backend python -m app.seed --reset` (or `uv run python -m app.seed --reset` locally).
