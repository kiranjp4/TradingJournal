# Day 1 — Why FuSa? Scope and your learning item

**Read:** ISO 26262-1, Clause 1 (Scope) and Clause 3 (Terms — skim index only)  
**Time:** 30–40 min  

---

## Learning objectives

By end of today you can:

- Explain what functional safety is (vs occupational safety, cybersecurity).
- State what ISO 26262 covers and what it excludes.
- Name your personal "learning item" for the next 90 days.

---

## Step 1: Read (10 min)

Read **Scope** in Part 1. Note:

- What types of systems are covered?
- What is explicitly out of scope?
- How does it relate to motorcycle (Part 12) and semiconductors (Part 11)?

---

## Step 2: Practical exercise (20 min)

### A. List 5 systems that need functional safety

Examples: steering assist, airbag, battery contactor, robot arm, medical infusion pump.

| # | System | E/E related? | Why FuSa matters |
|---|--------|--------------|------------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

### B. Pick your learning item

Choose **one simple system** you will analyze for the next 3 weeks.

**My learning item:** ___________________________

Criteria: you understand its normal behavior; it has clear failure modes; not too complex.

### C. Create project file

Create `projects/learning-item.md` with:

```markdown
# Learning Item: [name]

## Normal function
What it should do for the driver/user.

## Boundaries
What's inside vs outside the item.

## Interfaces
Inputs/outputs to other systems.

## Why I picked this
One sentence.
```

---

## Step 3: Log (5 min)

1. Copy `templates/daily-log.md` → `logs/2026-07-11.md` (use today's date).
2. Fill in what you read and what you created.
3. Commit to GitHub.

---

## Self-check

- [ ] I can explain "functional safety" in one sentence.
- [ ] I know my learning item.
- [ ] `projects/learning-item.md` exists in my repo.

**Tomorrow:** Day 2 — block diagram and fault vs failure.
