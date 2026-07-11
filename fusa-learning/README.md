# Functional Safety (FuSa) — Daily Learning Hub

A GitHub-based system for learning functional safety **every day** with **practical exercises**, not just reading.

## How to use this repo

1. **Pick your track** — start with [ISO 26262 Track](curriculum/iso-26262-90-day.md) (automotive) or [IEC 61508 Track](curriculum/iec-61508-90-day.md) (general industrial baseline).
2. **Do today's lesson** — open the day file under `exercises/`.
3. **Log your work** — copy [templates/daily-log.md](templates/daily-log.md) into `logs/YYYY-MM-DD.md` and fill it in.
4. **Save section notes** — one file per clause under `notes/<standard>/part-XX/`.
5. **Track progress** — check off items in [PROGRESS.md](PROGRESS.md) and commit daily.

## Daily routine (30–45 min)

| Step | Time | Action |
|------|------|--------|
| Read | 10–15 min | One clause or subsection from the standard |
| Practice | 15–20 min | Complete the day's hands-on exercise |
| Log | 5–10 min | Write notes + commit to GitHub |

## GitHub workflow

```bash
# After completing today's lesson
git add logs/ notes/ PROGRESS.md
git commit -m "FuSa Day 12: ISO 26262-3 clause 6.4.2 + HARA exercise"
git push
```

## Repo structure

```
fusa-learning/
├── README.md              ← you are here
├── PROGRESS.md            ← master checklist
├── curriculum/            ← 90-day plans with daily exercises
├── exercises/             ← day-by-day practical tasks
├── templates/             ← copy-paste templates
├── notes/                 ← your clause summaries (create as you go)
├── logs/                  ← daily learning logs (create as you go)
├── projects/              ← mini safety case work (build over time)
└── glossary/              ← terms you define in your own words
```

## Rules for effective learning

1. **Summarize, don't copy** — never paste copyrighted standard text; cite clause numbers only.
2. **Always do the exercise** — reading alone won't stick; HARA, FMEA, and safety goals need practice.
3. **One commit per day** — even a small log counts; consistency beats intensity.
4. **Review weekly** — Saturday: re-read last 5 logs and update glossary.

## Start here

→ **Day 1:** [exercises/week-01/day-01.md](exercises/week-01/day-01.md)
