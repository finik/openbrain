#!/usr/bin/env python3
"""Generate mock-data.json for Open Brain viewer demo mode.

Uses sentence-transformers to embed ~200 personal knowledge base entries,
computes pairwise cosine similarity, and stores top-N neighbors.

Fictional person: Alex Chen, freelance product consultant in Portland, OR.
"""

import json
import uuid
import random
import os
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

TOP_N = 15  # neighbors per thought

# ── Alex Chen's brain ──────────────────────────────────────────────────────
# Freelance product consultant, runs FocusFlow SaaS on the side
# Married to Jamie (Senior PM at Osprey), kids: Lily (8), Sam (5)
# Clients: Meridian Health, TerraLogic (logistics), Bloom (DTC skincare)
# Hobbies: cycling, woodworking, reading

THOUGHTS = [
    # ── TASKS ──
    ("Follow up with Sarah at Meridian on Q2 roadmap",
     "Sarah mentioned they want to add patient portal features in Q2. Need to send proposal by Friday. She's leaning toward React Native for mobile.",
     "task", ["Meridian Health", "proposal", "mobile"], ["Sarah Kim"]),

    ("Fix FocusFlow onboarding drop-off",
     "Analytics show 40% drop at step 3 (calendar integration). Hypothesis: OAuth consent screen scares users. Test a skip option with delayed prompt.",
     "task", ["FocusFlow", "onboarding", "analytics"], []),

    ("Schedule dentist for Lily and Sam",
     "Both due for checkups. Dr. Patel's office — call before 2pm. Lily needs sealants discussed.",
     "task", ["family", "health"], ["Lily", "Sam", "Dr. Patel"]),

    ("Send invoice to TerraLogic for March",
     "32 hours at $175/hr. Include the extra workshop day (Mar 12). Net 30 terms. Contact: Dave in accounting.",
     "task", ["TerraLogic", "invoicing"], ["Dave"]),

    ("Renew car insurance before April 20",
     "Current policy with State Farm expires Apr 20. Jamie got a quote from GEICO that's $40/mo cheaper. Compare coverage levels before switching.",
     "task", ["insurance", "finance"], ["Jamie"]),

    ("Prepare board deck for FocusFlow",
     "Monthly update for advisors. Key metrics: MRR $4.2k (up 12%), churn down to 6%, 340 active users. Highlight the Notion integration launch.",
     "task", ["FocusFlow", "board", "metrics"], []),

    ("Buy lumber for bookshelf project",
     "Need 8ft walnut boards x6, wood glue, new 1/4\" chisel. Check Woodcraft on Saturdays — they had a sale last month.",
     "task", ["woodworking"], []),

    ("Book flights for summer vacation",
     "Need to book before May or prices jump. Looking at Portland to Maui direct on Alaska Airlines. Check if we have enough miles for one ticket.",
     "task", ["travel", "family", "finance"], ["Jamie"]),

    ("Submit Q1 estimated taxes",
     "Quarterly estimated payment due April 15. Rachel calculated $8,200 federal + $2,100 state. Pay via EFTPS.",
     "task", ["taxes", "finance"], ["Rachel"]),

    ("Order new cycling shoes",
     "Current Shimano RC5s are worn out after 3,000 miles. Looking at RC7 or Giro Empire. Need to order before century training ramps up.",
     "task", ["cycling", "gear"], []),

    ("Get Sam signed up for swim lessons",
     "Portland Parks has openings for June session. Tuesday/Thursday 3:30pm works best. Sam is nervous about water — start with Level 1.",
     "task", ["family", "activities"], ["Sam"]),

    ("Review Bloom's ingredient database schema",
     "Alex Rivera sent the ERD. Need to check normalization approach and suggest INCI standard naming before they build the recommendation engine.",
     "task", ["Bloom", "data", "architecture"], ["Alex Rivera"]),

    ("Fix garage door opener",
     "Left side track is misaligned — door sticks halfway up. Could be a DIY fix or might need to call Precision Door. Check YouTube first.",
     "task", ["home", "maintenance"], []),

    ("Plan team offsite for TerraLogic",
     "Chen Wei wants a 2-day strategy session in May. Need to find a venue outside Portland. Budget: $5k. 8 attendees. Somewhere with good wifi and whiteboards.",
     "task", ["TerraLogic", "planning"], ["Chen Wei"]),

    ("Renew FocusFlow SSL certificate",
     "Expires May 1. Currently on Let's Encrypt auto-renewal but got a warning email. Check certbot config on the Railway deployment.",
     "task", ["FocusFlow", "infrastructure"], []),

    # ── CLIENT NOTES: MERIDIAN HEALTH ──
    ("Meridian Health: org chart and key contacts",
     "CEO: David Park. VP Product: Sarah Kim (main contact). CTO: Raj Gupta (technical decisions). PM: Lisa Wong (day-to-day). Sarah reports to David, has budget authority up to $50k without board approval.",
     "note", ["Meridian Health", "CRM", "org chart"], ["David Park", "Sarah Kim", "Raj Gupta", "Lisa Wong"]),

    ("Meridian onboarding session notes",
     "Walked through current patient intake flow. Paper forms still used in 3 of 7 clinics. Raj wants API-first approach. Lisa flagged HIPAA concerns about cloud storage — need BAA with any vendor.",
     "note", ["Meridian Health", "onboarding", "HIPAA"], ["Raj Gupta", "Lisa Wong"]),

    ("Sarah prefers async communication",
     "Sarah mentioned she's in back-to-back meetings Mon-Wed. Best to send Loom videos or detailed emails. She reads everything Thursday morning. Don't call unannounced.",
     "note", ["Meridian Health", "CRM", "communication"], ["Sarah Kim"]),

    ("Meridian Q1 review — exceeded targets",
     "Patient intake time reduced 35% (target was 25%). Sarah very happy. David Park joined the call — first time he's attended. Hinted at expanding scope to billing module.",
     "note", ["Meridian Health", "review", "billing"], ["Sarah Kim", "David Park"]),

    ("HIPAA compliance checklist for Meridian",
     "Compiled checklist: BAA signed, encryption at rest (AES-256), audit logging enabled, access controls by role, breach notification process documented. Raj reviewed and approved.",
     "note", ["Meridian Health", "HIPAA", "compliance"], ["Raj Gupta"]),

    ("Meridian's legacy EMR system is a nightmare",
     "They're on a 15-year-old EMR (MedStar Pro) with no API. Data exports are CSV only, run overnight. Any integration will need a polling adapter. Raj estimates 6 months to replace fully.",
     "note", ["Meridian Health", "EMR", "legacy", "integration"], ["Raj Gupta"]),

    ("Lisa Wong is the hidden decision maker at Meridian",
     "Even though Sarah has budget authority, Lisa controls the implementation timeline. If Lisa doesn't buy in, projects stall. She values detailed specs over vision decks. Adjust my approach.",
     "note", ["Meridian Health", "CRM", "stakeholder"], ["Lisa Wong", "Sarah Kim"]),

    ("Meridian patient satisfaction scores trending up",
     "NPS went from 32 to 47 since we started. Sarah attributes it to shorter wait times from the new intake system. Want to use this data in a case study — need permission from David.",
     "note", ["Meridian Health", "metrics", "NPS"], ["Sarah Kim", "David Park"]),

    ("Raj Gupta's technical philosophy",
     "Raj is deeply opinionated about architecture: microservices over monolith, PostgreSQL over everything, typed APIs (GraphQL preferred). Hates vendor lock-in. Always asks about exit strategies.",
     "note", ["Meridian Health", "CRM", "architecture"], ["Raj Gupta"]),

    # ── CLIENT NOTES: TERRALOGIC ──
    ("TerraLogic: company background",
     "Regional logistics company, 200 employees, Portland HQ. Moving from legacy Oracle system to modern stack. My engagement: advise on product strategy for their customer-facing tracking portal. Budget: $80k for 6-month engagement.",
     "note", ["TerraLogic", "CRM", "logistics"], []),

    ("TerraLogic stakeholder map",
     "CEO: Marcus Webb (hands-off). VP Ops: Chen Wei (sponsor, makes decisions). Tech lead: Priya Sharma (builds everything, opinionated about tech stack). PM: Jordan Hayes (new hire, still learning the domain).",
     "note", ["TerraLogic", "CRM", "org chart"], ["Marcus Webb", "Chen Wei", "Priya Sharma", "Jordan Hayes"]),

    ("Priya wants to use Rust for the new API",
     "Priya is pushing hard for Rust rewrite of the tracking API. Chen Wei is skeptical — worried about hiring. Suggested a compromise: Rust for the performance-critical routing engine, Node for the REST layer. Both seemed open to it.",
     "note", ["TerraLogic", "architecture", "Rust"], ["Priya Sharma", "Chen Wei"]),

    ("TerraLogic warehouse integration issues",
     "The WMS (Manhattan Associates) has a terrible API — SOAP only, rate limited to 100 req/min. Need a queue-based adapter. Priya estimated 3 weeks. I think 5 is more realistic given their test environment access.",
     "note", ["TerraLogic", "integration", "WMS"], ["Priya Sharma"]),

    ("Chen Wei's management style",
     "Chen Wei is data-driven but impatient with long presentations. Prefers 1-pagers with recommendations. Always asks 'what's the risk if we don't do this?' Frame everything in terms of operational risk.",
     "note", ["TerraLogic", "CRM", "communication"], ["Chen Wei"]),

    ("TerraLogic last-mile delivery optimization",
     "Their last-mile costs are 3x industry average. Root cause: manual route planning. Showed them what Route4Me and OptimoRoute can do. Chen Wei wants a build-vs-buy analysis by end of month.",
     "note", ["TerraLogic", "optimization", "delivery"], ["Chen Wei"]),

    ("Jordan Hayes is growing fast",
     "Jordan went from barely running standups to owning the entire tracking portal backlog in 3 months. Still needs help with stakeholder management — tends to agree to everything. Working on that.",
     "note", ["TerraLogic", "mentoring", "growth"], ["Jordan Hayes"]),

    ("TerraLogic driver app prototype feedback",
     "Tested the driver app prototype with 5 drivers. Main feedback: too many taps to mark delivery complete. Needs offline mode for rural routes. GPS drain is a concern — optimize polling interval.",
     "note", ["TerraLogic", "mobile", "user research"], []),

    ("TerraLogic's Oracle migration timeline",
     "Oracle contract expires December 2026. Chen Wei wants to be fully migrated by October to avoid renewal. That's aggressive — 7 months for a system that's been running 12 years. Flagged the risk.",
     "note", ["TerraLogic", "migration", "Oracle", "risk"], ["Chen Wei"]),

    ("Priya's side project could be useful",
     "Priya built a container orchestration tool on weekends that handles their dev environment. It's rough but works. Could evolve into their deployment pipeline if she gets time to polish it.",
     "note", ["TerraLogic", "DevOps", "tools"], ["Priya Sharma"]),

    # ── CLIENT NOTES: BLOOM ──
    ("Bloom: engagement kickoff notes",
     "DTC skincare brand, Series A ($8M). Want to build a personalization engine for product recommendations. Team is tiny: 4 engineers, 1 data scientist. Founder/CEO: Mika Tanaka. Head of Eng: Alex Rivera (yes, also Alex).",
     "note", ["Bloom", "CRM", "skincare"], ["Mika Tanaka", "Alex Rivera"]),

    ("Mika's vision for Bloom personalization",
     "Mika wants skin quiz → ingredient matching → personalized routine. Inspired by Curology model but with OTC products. Key constraint: must work without user accounts (guest checkout is 60% of orders).",
     "note", ["Bloom", "personalization", "product"], ["Mika Tanaka"]),

    ("Bloom tech stack assessment",
     "Shopify Plus frontend, Node.js backend on Railway, Postgres. Data science work in Jupyter notebooks — nothing in production yet. Alex Rivera wants to move to Next.js. I recommended against replatforming mid-feature build.",
     "note", ["Bloom", "architecture", "Shopify"], ["Alex Rivera"]),

    ("Bloom: ingredient database is a mess",
     "Their ingredient DB has 2,400 entries but inconsistent naming (Vitamin C vs L-ascorbic acid vs ascorbyl glucoside). Need normalization before the recommendation engine can work. Suggested using INCI standard names.",
     "note", ["Bloom", "data quality", "ingredients"], []),

    ("Bloom's customer retention problem",
     "Repeat purchase rate is only 22% (industry avg 35%). Exit surveys show: customers don't know when to reorder, products last different amounts of time. Idea: predictive reorder reminders based on product size and usage frequency.",
     "note", ["Bloom", "retention", "metrics"], []),

    ("Mika Tanaka's leadership style",
     "Mika is intensely focused on brand. Every feature must pass the 'would this feel premium?' test. She reviews every customer-facing copy personally. High bar but sometimes slows things down.",
     "note", ["Bloom", "CRM", "leadership"], ["Mika Tanaka"]),

    ("Bloom Series B planning has started",
     "Mika mentioned they're starting Series B prep. Target: $25M at $100M valuation. The personalization engine is central to the pitch — 'AI-powered skincare' is the narrative. My work directly impacts their fundraise.",
     "note", ["Bloom", "fundraising", "strategy"], ["Mika Tanaka"]),

    ("Alex Rivera's frustration with technical debt",
     "Alex Rivera vented about Bloom's codebase. No tests, no CI/CD, deployments are manual SSH. He wants to pause features for 2 weeks to set up infrastructure. Mika won't approve it. Classic startup tension.",
     "note", ["Bloom", "tech debt", "engineering"], ["Alex Rivera", "Mika Tanaka"]),

    ("Bloom influencer campaign results",
     "Mika shared results from the March influencer push: 15 micro-influencers, $12k spend, 3,200 new visitors, 180 conversions. CAC of $67 — not great. The quiz completion rate from influencer traffic was only 30% vs 55% organic.",
     "note", ["Bloom", "marketing", "metrics"], ["Mika Tanaka"]),

    # ── FOCUSFLOW (SIDE PROJECT) ──
    ("FocusFlow: product vision",
     "A productivity tool that blocks distractions during deep work and auto-schedules focus blocks based on calendar gaps. Key differentiator: learns your energy patterns from typing speed and app switching.",
     "note", ["FocusFlow", "product", "vision"], []),

    ("FocusFlow pricing decision",
     "Going with $12/mo for individuals, $8/seat for teams (min 5). Free tier: 3 focus blocks/day, no analytics. Premium: unlimited blocks, energy insights, calendar sync. Annual discount: 20%.",
     "note", ["FocusFlow", "pricing", "business"], []),

    ("FocusFlow: Notion integration shipped",
     "Finally shipped the Notion integration. Auto-creates a focus log entry after each session. Took 2 weeks longer than expected because Notion's API rate limits are brutal. 12 beta users testing it.",
     "note", ["FocusFlow", "Notion", "integration", "launch"], []),

    ("FocusFlow competitor analysis",
     "Main competitors: Freedom ($8.99/mo, just blocking), Centered ($12/mo, coaching), Sunsama ($20/mo, daily planning). Our edge: automatic scheduling + energy tracking. Nobody else does the energy pattern thing.",
     "note", ["FocusFlow", "competition", "market"], []),

    ("FocusFlow user interview — Maria (designer)",
     "Maria uses FocusFlow 4-5x/day. Loves the calendar blocking. Hates that it doesn't pause Slack notifications (only browser). She'd pay $20/mo if it could manage Slack. Worth exploring Slack integration.",
     "note", ["FocusFlow", "user research", "Slack"], ["Maria"]),

    ("FocusFlow MRR hit $4k",
     "Milestone! $4,012 MRR as of March 1. Growth mostly from Product Hunt traffic still trickling. CAC is basically $0 right now but won't scale. Need to think about paid acquisition soon.",
     "note", ["FocusFlow", "metrics", "revenue"], []),

    ("Should FocusFlow support Windows?",
     "60% of signups are Mac. But enterprise prospects keep asking about Windows. Electron wrapper would take ~4 weeks. Or could do a web-only version first. Leaning toward web-only to test demand.",
     "note", ["FocusFlow", "platform", "Windows"], []),

    ("FocusFlow + calendar integration architecture",
     "Google Calendar API for reading events, creating focus blocks. Need OAuth consent. Store tokens encrypted. Refresh token rotation every 7 days. Same pattern Sarah wants for Meridian patient portal.",
     "note", ["FocusFlow", "calendar", "OAuth", "architecture"], ["Sarah Kim"]),

    ("FocusFlow churn analysis",
     "Analyzed 45 churned users. Top reasons: 1) Forgot about it (38%), 2) Too many false focus blocks (25%), 3) Didn't work with their calendar (20%). The 'forgot about it' cohort suggests we need better re-engagement.",
     "note", ["FocusFlow", "churn", "analytics"], []),

    ("FocusFlow energy tracking algorithm",
     "Current approach: track keystroke intervals and app switches as proxy for focus level. 5-min rolling windows. Score 0-100. Problem: doesn't account for reading (low keystrokes, high focus). Need a better signal.",
     "note", ["FocusFlow", "algorithm", "product"], []),

    ("Product Hunt launch retrospective",
     "Launched Jan 15. #3 Product of the Day, 450 upvotes. Got 1,200 signups in 48 hours but only 8% converted to active users. The free tier might be too generous. Next time: launch on Tuesday, not Thursday.",
     "note", ["FocusFlow", "launch", "Product Hunt"], []),

    ("FocusFlow: Slack integration scoping",
     "Slack API allows DND status management. Could auto-set DND during focus blocks. Would need workspace admin approval for install. Complexity: medium. Maria and 3 other users specifically requested this.",
     "note", ["FocusFlow", "Slack", "integration"], ["Maria"]),

    ("FocusFlow infrastructure costs",
     "Railway: $28/mo. Supabase (auth + DB): $25/mo. Vercel (landing page): free. Postmark (emails): $10/mo. Total: $63/mo. At $4k MRR that's <2% of revenue. Very healthy for now.",
     "note", ["FocusFlow", "infrastructure", "costs"], []),

    # ── FAMILY & PERSONAL ──
    ("Jamie's birthday plan",
     "Jamie turns 36 on May 15. She mentioned wanting a weekend at the coast — check Cannon Beach rentals. Backup: cooking class at Sur La Table. Kids can stay with Jamie's mom (Helen).",
     "note", ["family", "birthday"], ["Jamie", "Helen"]),

    ("Lily's parent-teacher conference notes",
     "Mrs. Patterson says Lily is reading above grade level but struggles with group work. Recommended more playdates. She's interested in the school's coding club — starts in April.",
     "note", ["family", "school", "education"], ["Lily", "Mrs. Patterson"]),

    ("Sam's soccer season starts April 12",
     "U6 league, games on Saturdays at Delta Park. Coach is Tom Brennan (Ethan's dad). Need to buy cleats — Sam grew out of last year's. Practice Wednesdays 4-5pm.",
     "note", ["family", "soccer", "sports"], ["Sam", "Tom Brennan"]),

    ("Kitchen renovation ideas",
     "Jamie wants open shelving, I want more cabinets. Compromise: open shelving on one wall, cabinets everywhere else. Quartz countertops, not granite. Budget: $25k. Got a referral to Mike Chen (contractor) from neighbors.",
     "note", ["home", "renovation", "kitchen"], ["Jamie", "Mike Chen"]),

    ("Family vacation planning — summer 2026",
     "Options: 1) Hawaii (Maui, Jamie's pick), 2) Vancouver + Whistler (my pick), 3) Yellowstone (road trip, kids would love it). Budget: $6k. Need to book by May if Hawaii. Lily wants to see whales.",
     "note", ["family", "vacation", "travel"], ["Jamie", "Lily"]),

    ("Meal prep system that actually works",
     "Sunday: prep proteins and grains for the week. Wednesday: restock veggies, prep second batch. Key insight: don't try to prep everything — just the time-intensive stuff. Instant Pot is the MVP.",
     "note", ["cooking", "meal prep", "productivity"], []),

    ("Jamie got promoted to Senior PM",
     "Jamie's promotion came through! Senior Product Manager at Osprey. 15% raise + RSUs. She's now leading the enterprise platform team. Celebration dinner at Canard on Friday.",
     "note", ["family", "career"], ["Jamie"]),

    ("Lily wants to learn piano",
     "Lily heard piano at a friend's house and is obsessed. Looked into teachers: Portland Piano Company offers 30-min lessons, $40/session. Or could start with Simply Piano app ($120/yr) to test commitment first.",
     "note", ["family", "music", "education"], ["Lily"]),

    ("Sam's speech therapy progress",
     "Sam's therapist (Dr. Evans) says he's made great progress on 'r' sounds. Down to biweekly sessions from weekly. Should be discharged by summer if progress continues.",
     "note", ["family", "health", "speech"], ["Sam", "Dr. Evans"]),

    ("Jamie's work-life balance concerns",
     "Jamie mentioned she's working until 9pm most nights since the promotion. We need to set boundaries — agreed on no laptops after 8pm on weekdays. She's also skipping lunch. Worried about burnout.",
     "note", ["family", "work-life balance", "health"], ["Jamie"]),

    ("Halloween costume ideas for the kids",
     "Lily wants to be a marine biologist (with lab coat and stuffed octopus). Sam wants to be a fire truck — not a firefighter, the actual truck. Challenge accepted.",
     "note", ["family", "holidays"], ["Lily", "Sam"]),

    ("Our babysitter rates went up",
     "Emma (our go-to sitter) raised her rate from $18 to $22/hr. Fair — she's been with us 2 years and is great with the kids. But a date night is now $110+ with dinner. Maybe find a backup sitter for casual evenings.",
     "note", ["family", "childcare", "budget"], ["Emma"]),

    ("Thinking about getting a dog",
     "Kids have been asking for months. Jamie is on board if it's a low-shedding breed. Looked into goldendoodles and Portuguese water dogs. Main concern: who walks it when we're all busy? Maybe wait until summer.",
     "note", ["family", "pets"], ["Jamie"]),

    # ── READING & LEARNING ──
    ("Book notes: The Mom Test",
     "Key takeaway: don't ask people if they'd use your product — ask about their actual behavior and problems. Bad: 'Would you use X?' Good: 'Tell me about the last time you had problem Y.' Apply this to FocusFlow user interviews.",
     "note", ["books", "product", "user research"], []),

    ("Book notes: Shape Up (Basecamp)",
     "6-week cycles with 2-week cooldowns. Pitches instead of backlogs. Appetite-based scoping — decide the time budget first, then shape the work to fit. Considering this for FocusFlow development.",
     "note", ["books", "product", "methodology"], []),

    ("Podcast: Lenny's with Shreyas Doshi on pre-mortems",
     "Pre-mortem exercise: imagine the project failed, work backwards to identify why. Shreyas suggests doing this for any project over 2 weeks. Used it with TerraLogic last week — Chen Wei loved it.",
     "note", ["learning", "product", "risk management"], ["Shreyas Doshi", "Chen Wei"]),

    ("Article: Why most personalization fails",
     "Most recommendation engines optimize for engagement, not user value. Bloom should focus on outcome-based recommendations (did the product work for your skin?) not click-based. Sent to Mika.",
     "note", ["reading", "personalization", "Bloom"], ["Mika Tanaka"]),

    ("Book notes: Thinking in Bets (Annie Duke)",
     "Decisions should be evaluated by process, not outcome. A good decision can have a bad outcome and vice versa. 'Resulting' = judging decision quality by what happened. Catch myself doing this with FocusFlow features.",
     "note", ["books", "decision making", "psychology"], []),

    ("Book notes: Working in Public (Nadia Eghbal)",
     "Open source maintainers face the same scaling problems as content creators. Commons-based peer production only works when contribution is easy. Relevant to FocusFlow's planned plugin system.",
     "note", ["books", "open source", "community"], []),

    ("Article: The cold start problem in marketplaces",
     "Andrew Chen's framework: find your 'atomic network' — the smallest group that can sustain itself. For FocusFlow teams: need at least 3 people on a team to create peer accountability. Below that, it's just individual use.",
     "note", ["reading", "marketplaces", "growth"], []),

    ("Podcast: How I Built This — Canva",
     "Melanie Perkins pitched 100+ investors before getting funded. Key pivot: went from school yearbook tool to general design tool. Lesson: the specific use case is your wedge, not your destiny.",
     "note", ["learning", "startups", "fundraising"], ["Melanie Perkins"]),

    ("Book notes: Four Thousand Weeks (Oliver Burkeman)",
     "We have roughly 4,000 weeks to live. Productivity isn't about doing more — it's about choosing what matters. Accept that you'll never clear the backlog. This changed how I think about FocusFlow's mission.",
     "note", ["books", "productivity", "philosophy"], []),

    ("Article: JTBD framework for product development",
     "Jobs to Be Done: people 'hire' products to make progress in their lives. FocusFlow's job: 'help me protect my best thinking hours from interruptions.' Not about blocking — about protecting.",
     "note", ["reading", "product", "JTBD"], []),

    # ── HEALTH & FITNESS ──
    ("Cycling goal: Portland Century in August",
     "Registered for the Portland Century ride (100 miles, Aug 16). Current longest ride: 45 miles. Need to build up to 75 by July. Training plan: 3 rides/week, long ride on Sundays.",
     "note", ["cycling", "fitness", "goals"], []),

    ("Annual physical results",
     "Everything normal except vitamin D is low (22 ng/mL, should be 30+). Dr. Novak recommended 2000 IU daily. Cholesterol fine: LDL 110, HDL 58. Blood pressure 118/76.",
     "note", ["health", "medical"], ["Dr. Novak"]),

    ("Morning routine that works",
     "5:30 wake, 5:45 ride or run, 6:45 shower, 7:00 breakfast with kids, 7:30 deep work block. The key: phone stays in kitchen until after the first focus session. Productivity went up noticeably.",
     "note", ["productivity", "routine", "fitness"], []),

    ("Back pain is gone since standing desk",
     "Three months with the Uplift V2 standing desk and the back pain I've had for 2 years is completely gone. I alternate: 25 min standing, 35 min sitting. Walking pad during calls was a game changer.",
     "note", ["health", "ergonomics", "home office"], []),

    ("Sunday long ride — Sauvie Island loop",
     "Did the Sauvie Island loop: 42 miles, 1,100 ft elevation. Averaged 16.8 mph. Legs felt good until mile 35. Need to eat more during rides — bonked a little at the end. Beautiful weather though.",
     "note", ["cycling", "training"], []),

    ("Sleep quality experiment",
     "Tried 2 weeks with phone out of bedroom. Results: fall asleep 20 min faster, wake up once instead of 2-3 times. The urge to check email at 11pm is the real issue. Keeping this habit.",
     "note", ["health", "sleep", "habits"], []),

    ("Dr. Novak recommended strength training",
     "At my physical, Dr. Novak said cycling is great for cardio but I need resistance training for bone density. Especially important starting in your 40s. Looking into a simple 2x/week routine.",
     "note", ["health", "fitness", "strength training"], ["Dr. Novak"]),

    ("Tried the Wim Hof breathing method",
     "Did the breathing exercises for a week. Felt great immediately after but no lasting difference I could measure. Cold showers are brutal but I'm sleeping better. Not sure if correlation or causation.",
     "note", ["health", "wellness", "experiment"], []),

    # ── FINANCES ──
    ("Q1 2026 consulting revenue summary",
     "Meridian: $28k, TerraLogic: $22.4k, Bloom: $14k. Total consulting: $64.4k. FocusFlow: $11.2k (MRR growth). Expenses: $8.1k (tools, hosting, insurance). Net: ~$67.5k pre-tax.",
     "note", ["finance", "revenue", "quarterly"], []),

    ("Tax strategy discussion with accountant",
     "Met with Rachel (CPA). Recommendations: max out SEP-IRA ($66k limit), consider S-corp election for FocusFlow if MRR exceeds $8k sustained, track home office deduction (dedicated room = $1,800/yr estimate).",
     "note", ["finance", "taxes", "planning"], ["Rachel"]),

    ("Emergency fund status",
     "Current: $42k in HYSA (4.5% APY). Target: 6 months expenses = $48k. Should hit target by June if no surprises. Jamie's promotion helps — her income covers mortgage + insurance.",
     "note", ["finance", "savings"], ["Jamie"]),

    ("Should I raise my consulting rate?",
     "Currently at $175/hr. Market rate for product consultants in Portland: $150-250. My clients are happy and not price-sensitive. But I'm afraid of losing Bloom — they're a startup. Maybe raise for new clients only.",
     "note", ["consulting", "pricing", "business"], []),

    ("Investment portfolio rebalance needed",
     "Currently 80% index funds, 15% bonds, 5% individual stocks. The tech stocks (AAPL, MSFT) have grown disproportionately. Need to sell some and rebalance to target allocation. Ask Rachel about tax implications.",
     "note", ["finance", "investing", "portfolio"], ["Rachel"]),

    ("FocusFlow needs a separate bank account",
     "Running FocusFlow revenue through personal account is getting messy. Need to open a business checking account. Mercury or Relay are popular with indie SaaS founders. Also need to set up proper bookkeeping.",
     "note", ["FocusFlow", "finance", "business"], []),

    ("Mortgage refinance: probably too late",
     "Rates are at 6.8%, our current rate is 3.2%. Absolutely no reason to refinance. But if rates drop below 5% it could be worth it. Set a reminder to check in September.",
     "note", ["finance", "mortgage", "home"], []),

    ("Kids' 529 plans contributions",
     "Currently putting $250/mo into each kid's 529. Oregon gives a state tax deduction up to $4,865/beneficiary. We're under that. Could increase to $350/mo and max the deduction. Discuss with Jamie.",
     "note", ["finance", "education", "savings"], ["Jamie", "Lily", "Sam"]),

    # ── IDEAS & OBSERVATIONS ──
    ("Idea: Open Brain for teams",
     "What if there was a shared brain for teams? Everyone captures thoughts, the system finds connections across people. Like Slack search but semantic. Could be huge for distributed teams.",
     "note", ["ideas", "product", "AI"], []),

    ("Observation: all my clients struggle with the same thing",
     "Meridian, TerraLogic, and Bloom all have the same core problem: their data is siloed across tools and nobody has a single source of truth. Maybe there's a consulting framework I could productize here.",
     "note", ["consulting", "patterns", "opportunity"], []),

    ("Portland tech scene is heating up",
     "Three new coworking spaces opened downtown. Met two founders at the PDX Product meetup who moved from SF. Rents are still half of SF. Good time to build community here.",
     "note", ["Portland", "tech", "community"], []),

    ("AI tools I'm actually using daily",
     "Claude for writing proposals and code review. Midjourney for FocusFlow marketing images. Granola for meeting notes. That's it — tried 20+ tools, these three stuck. The rest were solutions looking for problems.",
     "note", ["AI", "tools", "productivity"], []),

    ("Data privacy is becoming a selling point",
     "Bloom's customers care deeply about what happens with their skin quiz data. Mika wants to make privacy a brand differentiator. Same theme at Meridian (HIPAA) and TerraLogic (shipping data). Pattern worth exploring.",
     "note", ["privacy", "consulting", "trend"], ["Mika Tanaka"]),

    ("Slack vs async: the eternal debate",
     "TerraLogic team is on Slack 8+ hours/day. Bloom barely uses it — they do async Loom videos. Meridian is somewhere in between. The async teams seem happier and ship more. Correlation? Causation?",
     "note", ["communication", "productivity", "async"], []),

    ("Note to self: energy is highest before noon",
     "Tracked my focus scores in FocusFlow for 30 days. Clear pattern: best work happens 7-11am. Post-lunch slump is real (1-2:30pm). Second wind at 3pm. Schedule client calls in the afternoon, deep work in the morning.",
     "note", ["productivity", "energy", "FocusFlow"], []),

    ("The consulting-to-product pipeline is real",
     "Every product idea I've had in the last year came from client work. FocusFlow came from my own productivity struggles while consulting. The next product will probably come from a pattern I'm seeing across clients.",
     "note", ["consulting", "product", "strategy"], []),

    ("Idea: 'Second brain' audit as a consulting offering",
     "Could offer a service where I audit a company's knowledge management: where info lives, how it flows, where it gets lost. Deliverable: a knowledge graph + recommendations. Ties into the Open Brain concept.",
     "note", ["ideas", "consulting", "knowledge management"], []),

    ("Why small SaaS beats big consulting",
     "Consulting: linear income, high stress, always selling the next gig. SaaS: compounds, runs while I sleep, builds equity. Goal: get FocusFlow to $20k MRR by end of year so I can drop one client.",
     "note", ["business", "strategy", "FocusFlow"], []),

    ("Interesting pattern: all three clients need better onboarding",
     "Meridian's patient intake, TerraLogic's driver onboarding, Bloom's skin quiz — all are essentially onboarding flows. I've built deep expertise in this without realizing it. Could specialize.",
     "note", ["consulting", "onboarding", "specialization"], []),

    # ── NETWORKING & COMMUNITY ──
    ("Networking: met interesting people at PDX Product meetup",
     "Hannah Park — runs a B2B SaaS for veterinary clinics. Similar stage to FocusFlow. Good to compare notes on pricing. James Liu — ex-Stripe, now consulting. Potential referral partner.",
     "note", ["networking", "community"], ["Hannah Park", "James Liu"]),

    ("Coffee with Hannah Park",
     "Great conversation about indie SaaS challenges. She's at $6k MRR with VetFlow. Her trick: partners with veterinary schools for distribution. I should think about channel partnerships for FocusFlow.",
     "note", ["networking", "SaaS", "distribution"], ["Hannah Park"]),

    ("James Liu might send TerraLogic-type referrals",
     "James does payments consulting. His clients often need product strategy help too. Agreed to a mutual referral arrangement — 10% finder's fee for the first 3 months. Handshake deal for now.",
     "note", ["networking", "referrals", "consulting"], ["James Liu"]),

    ("Portland Founders Slack group is active",
     "Joined the Portland Founders Slack (invite from Hannah). ~400 members. Channels for fundraising, hiring, product. Already got useful feedback on FocusFlow pricing from 3 founders. Worth participating weekly.",
     "note", ["community", "Portland", "networking"], ["Hannah Park"]),

    ("Considered joining a mastermind group",
     "James Liu invited me to his mastermind group — 5 consultants, meets biweekly. $200/mo. Hesitant about the cost but the accountability and peer feedback could be valuable. Trial for one month.",
     "note", ["networking", "mastermind", "growth"], ["James Liu"]),

    # ── WOODWORKING & HOBBIES ──
    ("Woodworking: dovetail joint practice",
     "Finally got clean dovetails after 6 attempts. Key: marking gauge must be dead accurate, and cut on the waste side of the line. The $15 Japanese dozuki saw was a game changer vs my old backsaw.",
     "note", ["woodworking", "crafts"], []),

    ("Weekend project: build a standing desk shelf",
     "Want a small shelf above the desk for plants and a clock. Walnut to match the desk. Simple floating design with French cleats. Could be a 2-hour Saturday project.",
     "note", ["woodworking", "home office"], []),

    ("Woodworking: bookshelf design plans",
     "Mid-century modern style, walnut with maple accents. Five shelves, 36\" wide x 72\" tall. Dados for shelf joints. Need to dimension all the lumber first. Estimated material cost: $280.",
     "note", ["woodworking", "furniture", "design"], []),

    ("The meditation of hand tools",
     "There's something about using hand tools — the plane, the chisel, the saw — that empties my mind in a way power tools don't. It's the closest thing to meditation I've found. Same focus state as deep coding.",
     "note", ["woodworking", "mindfulness", "creativity"], []),

    ("Took Lily to the woodshop",
     "Lily helped me sand the cutting board project. She loved it — very meticulous with the sandpaper. Made her safety goggles and let her try the hand plane. Could be our thing.",
     "note", ["woodworking", "family", "parenting"], ["Lily"]),

    # ── HOME & LIFE ADMIN ──
    ("Home office ergonomic setup",
     "Standing desk (Uplift V2), Herman Miller Aeron chair, monitor arm for 27\" display. Added a walking pad last month — use it during calls. Back pain is basically gone. Total investment: ~$2,800.",
     "note", ["home office", "health", "setup"], []),

    ("Jamie and I need a date night system",
     "Haven't been out just the two of us since January. Idea: alternate who plans it, every other Friday. One person picks restaurant + activity, other person arranges sitter. Put it in the calendar.",
     "note", ["family", "relationship"], ["Jamie"]),

    ("Insight from coaching call with Marcus",
     "Marcus (my business coach) asked: 'What would you do if you could only keep one client?' I immediately said Meridian. Tells me something about where I should focus growth.",
     "note", ["coaching", "business", "strategy"], ["Marcus Webb"]),

    ("Car maintenance schedule",
     "Subaru Outback: oil change due at 78k (currently 77,200). Tires rotated last month. Brake pads have ~15k miles left. Jamie's Civic: oil change overdue by 500 miles. Schedule both this week.",
     "note", ["car", "maintenance", "home"], ["Jamie"]),

    ("Portland rain season survival guide",
     "Year 5 in Portland. What works: good rain jacket (not umbrella), waterproof cycling gear, SAD lamp from October-March, vitamin D supplements. What doesn't: complaining about it.",
     "note", ["Portland", "lifestyle", "health"], []),

    ("We need a better family calendar system",
     "Google Calendar shared calendars work but Jamie and I keep creating duplicate events. Trying Cozi — it's designed for families. Color coding: blue=Alex, pink=Jamie, green=Lily, orange=Sam, purple=shared.",
     "note", ["family", "productivity", "calendar"], ["Jamie"]),

    ("Neighborhood block party was great",
     "Met the Hendersons (just moved in, two kids similar ages) and the Okamotos (they have a dog, Sam was thrilled). Mike Chen (contractor neighbor) offered to look at our kitchen for free estimate.",
     "note", ["community", "neighbors", "social"], ["Mike Chen"]),

    ("Thinking about solar panels",
     "Oregon has good solar incentives. Got a quote from SunPower: $18k after tax credits for a 7kW system. Payback period: ~8 years. Main hesitation: we might move before then. Roof is south-facing though.",
     "note", ["home", "solar", "finance"], []),

    # ── CONSULTING META / METHODOLOGY ──
    ("My consulting discovery process",
     "Week 1: stakeholder interviews (30 min each). Week 2: observe actual workflows. Week 3: synthesize findings into a 1-pager. Week 4: present recommendations. This 4-week cadence works for every client.",
     "note", ["consulting", "methodology", "process"], []),

    ("Why I don't do fixed-price consulting",
     "Tried it once with a startup. Scope crept 3x, I ate the cost. Now it's always time & materials with weekly check-ins. Clients who insist on fixed price aren't a good fit — they're usually trying to transfer risk.",
     "note", ["consulting", "pricing", "lessons"], []),

    ("Template: client kickoff checklist",
     "1) Signed contract + NDA. 2) Intro calls with all stakeholders. 3) Access to tools (Slack, Jira, repo). 4) Org chart + decision-making authority map. 5) Current metrics baseline. 6) 90-day success criteria.",
     "note", ["consulting", "process", "templates"], []),

    ("How I manage three clients simultaneously",
     "Monday/Wednesday: TerraLogic (their standup days). Tuesday/Thursday mornings: Meridian. Bloom: flexible, mostly async. Friday: FocusFlow + admin. The key: strict calendar blocking. No context-switching within a half-day.",
     "note", ["consulting", "time management", "productivity"], []),

    ("The 'quiet CTO' pattern",
     "Noticed this across clients: the technical leader who doesn't speak up in group meetings but has strong opinions in 1:1s. Raj at Meridian, Priya at TerraLogic. Always schedule solo time with the quiet CTO.",
     "note", ["consulting", "stakeholder management", "pattern"], ["Raj Gupta", "Priya Sharma"]),

    # ── MISC TECHNICAL NOTES ──
    ("OAuth 2.0 implementation notes",
     "PKCE flow for public clients. Authorization code flow for server-side. Always use state parameter to prevent CSRF. Refresh token rotation prevents replay attacks. Learned this the hard way on FocusFlow.",
     "note", ["OAuth", "security", "technical"], []),

    ("PostgreSQL jsonb performance tips",
     "GIN indexes on jsonb columns are essential for query performance. Use @> operator for containment queries. Avoid -> chain for deeply nested access — flatten the schema instead. Applied this at Bloom.",
     "note", ["PostgreSQL", "database", "performance"], []),

    ("API rate limiting strategies",
     "Token bucket for steady traffic. Fixed window for simplicity. Sliding window for accuracy. Used sliding window at TerraLogic for the WMS adapter. The Notion API uses fixed window — annoying for batch operations.",
     "note", ["API", "architecture", "technical"], []),

    ("Why I recommend Railway over Heroku now",
     "Railway has better DX: GitHub auto-deploy, easy env vars, built-in Postgres. Pricing is usage-based (no idle dyno tax). FocusFlow runs on Railway for $28/mo. Heroku would be $50+ for the same setup.",
     "note", ["infrastructure", "Railway", "hosting"], []),

    ("React Server Components are confusing but powerful",
     "Spent a weekend understanding RSC. The mental model: server components are templates, client components are interactive widgets. You can nest client in server but not vice versa. Alex Rivera at Bloom should learn this.",
     "note", ["React", "technical", "frontend"], ["Alex Rivera"]),

    # ── EMOTIONAL / REFLECTIVE ──
    ("Grateful for the flexibility of freelancing",
     "Dropped Lily off at school this morning, had coffee with Jamie, started work at 9. No commute, no permission needed. The trade-off (no safety net, variable income) is worth it. Year 3 of freelancing and I'd never go back.",
     "note", ["freelancing", "lifestyle", "gratitude"], ["Jamie", "Lily"]),

    ("Imposter syndrome hit hard this week",
     "Bloom asked me to design their ML pipeline architecture. I know product, not ML. Spent 3 days learning before admitting I should bring in a specialist. Mika appreciated the honesty. Note: honesty > pretending.",
     "note", ["psychology", "growth", "consulting"], ["Mika Tanaka"]),

    ("The loneliness of solo work",
     "Working alone 4 days a week is great for focus but terrible for energy. Started going to a coffee shop on Tuesdays just to be around people. Also joined the Portland Founders Slack — async community helps.",
     "note", ["freelancing", "mental health", "community"], []),

    ("Three years since leaving my full-time job",
     "Left Stripe on March 15, 2023. Revenue has tripled since year 1. Still no regrets. The scariest part was telling Jamie — she said 'finally.' She saw it before I did.",
     "note", ["career", "reflection", "milestone"], ["Jamie"]),

    ("Jordan from TerraLogic reminds me of early-career me",
     "Jordan is eager but overwhelmed. Keeps saying yes to everything. Shared the 'Shape Up' approach with them — appetite-based scoping resonated. Offered to do a 1:1 mentoring session.",
     "note", ["TerraLogic", "mentoring"], ["Jordan Hayes"]),

    # ── ADDITIONAL THOUGHTS TO REACH 200 ──
    ("Client communication template: weekly update",
     "Format I use for all clients: 1) What we did this week, 2) What's next, 3) Blockers/decisions needed, 4) Metrics update. Takes 15 min to write, saves hours of back-and-forth. All clients love it.",
     "note", ["consulting", "communication", "templates"], []),

    ("Idea: 'Focus Friday' for FocusFlow marketing",
     "Weekly newsletter/social post: one productivity tip + one FocusFlow feature highlight. Content marketing is free and compounds. Could start a community around deep work culture.",
     "note", ["FocusFlow", "marketing", "content"], []),

    ("Lily's coding club first session",
     "Lily came home excited from coding club. They used Scratch. She made a cat chase a mouse across the screen. Already asking when the next session is. This could be her thing.",
     "note", ["family", "education", "coding"], ["Lily"]),

    ("Bloom's A/B test on skin quiz length",
     "Tested 5-question vs 8-question quiz. The shorter quiz had 28% higher completion but the longer quiz led to 15% higher purchase conversion. Recommendation: keep 8 questions but add a progress bar.",
     "note", ["Bloom", "A/B testing", "optimization"], []),

    ("The power of 'I don't know yet'",
     "Chen Wei asked me last week about the best approach for real-time tracking. Instead of guessing, I said 'I don't know yet, let me research it.' He respected that more than a hasty answer. Clients value honesty.",
     "note", ["consulting", "communication", "honesty"], ["Chen Wei"]),

    ("FocusFlow bug: timezone handling in calendar sync",
     "Users in non-US timezones are seeing focus blocks at wrong times. Root cause: storing times in local time instead of UTC. Classic bug. Fix: store everything in UTC, convert on display. 2-day fix estimate.",
     "note", ["FocusFlow", "bug", "timezone"], []),

    ("Rethinking my business structure",
     "Currently sole proprietor for consulting, LLC for FocusFlow. Rachel suggests merging into one S-corp once combined revenue exceeds $150k consistently. Tax savings: ~$8k/year on self-employment tax.",
     "note", ["business", "structure", "taxes"], ["Rachel"]),

    ("Meridian wants a mobile app now",
     "Sarah called — the board wants a patient-facing mobile app by Q3. React Native is the obvious choice (shared codebase with web portal). Raj wants native but the timeline is too tight. Need to mediate.",
     "note", ["Meridian Health", "mobile", "product"], ["Sarah Kim", "Raj Gupta"]),

    ("Walking meetings are underrated",
     "Started doing walking meetings (1:1s while walking around the neighborhood). Benefits: no screen fatigue, conversations flow more naturally, I get steps in. Chen Wei tried it and is now a convert.",
     "note", ["productivity", "meetings", "health"], ["Chen Wei"]),

    ("FocusFlow needs better error messages",
     "Got 3 support emails this week that were all 'it's not working.' The error states are too generic. Need contextual error messages: what went wrong, why, and what to do about it.",
     "note", ["FocusFlow", "UX", "support"], []),

    ("Comparative analysis: Meridian vs TerraLogic culture",
     "Meridian is cautious, process-heavy, needs buy-in from multiple stakeholders. TerraLogic is move-fast, Chen Wei decides, ship it. Neither is wrong — I just need to adapt my approach. This is the real skill of consulting.",
     "note", ["consulting", "culture", "observation"], ["Chen Wei"]),

    ("Weekend cycling route: Banks-Vernonia trail",
     "Beautiful rail trail, 21 miles each way. Flat, paved, through forest. Perfect for a long training ride. Brought Sam on the tag-along for the first 5 miles — he loved it.",
     "note", ["cycling", "Portland", "family"], ["Sam"]),

    ("FocusFlow user count hit 500",
     "500 registered users, 340 active (68% activation rate). Most active user segments: designers (28%), developers (22%), writers (18%). The energy tracking feature is most-used by developers.",
     "note", ["FocusFlow", "metrics", "growth"], []),

    ("Bloom checkout funnel optimization",
     "Current funnel: landing → quiz → results → cart → checkout. Drop-off is highest at cart (45% abandon). Hypothesis: shipping cost surprise. Testing: show estimated shipping on the results page.",
     "note", ["Bloom", "conversion", "optimization"], []),

    ("How to say no to scope creep (gracefully)",
     "The magic phrase: 'That's a great idea. Let's add it to the backlog and prioritize it against everything else.' Acknowledges without committing. Works every time with Lisa Wong at Meridian.",
     "note", ["consulting", "scope", "communication"], ["Lisa Wong"]),

    ("TerraLogic ETA prediction model",
     "Priya built a basic ETA model using historical delivery data. Accuracy: 73% within 30-min window. Not great. Next step: incorporate traffic data from HERE Maps API. Budget approved by Chen Wei.",
     "note", ["TerraLogic", "ML", "product"], ["Priya Sharma", "Chen Wei"]),

    ("My top 5 consulting tools",
     "1) Notion — client wikis and project tracking. 2) Loom — async updates and walkthroughs. 3) Miro — workshop facilitation. 4) Linear — lightweight project management. 5) Claude — everything else.",
     "note", ["consulting", "tools", "productivity"], []),

    ("Parenting insight: structured choices work",
     "Instead of 'what do you want for dinner?' → meltdown, try 'pasta or tacos?' → instant decision. Same with getting dressed, choosing activities. Reduces decision fatigue for everyone. Works on clients too (ha).",
     "note", ["parenting", "psychology", "family"], []),

    ("FocusFlow team plan: first enterprise prospect",
     "Got an inbound from a 15-person design agency in Seattle. They want FocusFlow for the whole team. Need to build: admin dashboard, team analytics, SSO. This could be the path to $20k MRR.",
     "note", ["FocusFlow", "enterprise", "growth"], []),

    ("Rain ride: lessons learned",
     "Got caught in a downpour on Sunday's ride. Lessons: fenders are not optional, bright lights matter more in rain, brake earlier (wet rims!), and a rain jacket that vents is worth the $200.",
     "note", ["cycling", "gear", "Portland"], []),

    ("Bloom's ingredient sourcing ethics",
     "Mika wants 100% sustainably sourced ingredients by 2027. Current: ~60%. The biggest challenge is palm oil derivatives (in 30% of their products). Alternatives exist but cost 2x more. Real tension between values and margins.",
     "note", ["Bloom", "sustainability", "ethics"], ["Mika Tanaka"]),

    ("Why I journal in the morning, not at night",
     "Switched from evening journaling to morning. At night I'm tired and it feels like a chore. In the morning it's reflective and sets intention for the day. 10 minutes with coffee. No phone until after.",
     "note", ["habits", "journaling", "productivity"], []),

    ("Lily asked 'what is money?'",
     "Had a surprisingly deep conversation with Lily about money. Explained earning, saving, and spending with her allowance ($3/week). She immediately wanted to save for a telescope. Proud dad moment.",
     "note", ["family", "education", "finance"], ["Lily"]),

    ("The best decision I made this year: blocking Fridays",
     "No client calls on Fridays. It's FocusFlow day, admin day, and thinking day. Clients initially pushed back but now they plan around it. My best product ideas happen on Fridays.",
     "note", ["productivity", "time management", "business"], []),

    ("Exploring Cursor AI for coding",
     "Tried Cursor for a week of FocusFlow development. The AI autocomplete is shockingly good for React. But it sometimes generates plausible-looking code that's subtly wrong. Trust but verify. Net positive so far.",
     "note", ["AI", "tools", "development"], []),

    ("Meridian: EHR integration vendor selection",
     "Narrowed to three vendors for the EHR integration: Redox (enterprise, expensive), Health Gorilla (mid-market, good FHIR support), custom build (cheap but maintenance burden). Recommending Redox despite cost — HIPAA compliance is worth it.",
     "note", ["Meridian Health", "EHR", "vendor selection"], []),

    ("Sam drew a picture of our family",
     "Sam drew all four of us plus a dog we don't have. He also drew a robot next to me — said it's 'daddy's computer friend.' I might be talking to Claude too much.",
     "note", ["family", "kids", "humor"], ["Sam"]),

    ("TerraLogic customer satisfaction survey results",
     "NPS: 31 (up from 24 last quarter). Top complaint: delivery time estimates are unreliable (67% mentioned this). Validates the ETA prediction project. Second: package tracking updates are too infrequent.",
     "note", ["TerraLogic", "metrics", "NPS", "customer feedback"], []),

    ("Learning Rust on weekends",
     "Inspired by Priya at TerraLogic. Working through 'The Rust Programming Language' book. Ownership model is wild but makes sense for systems code. No plans to use it professionally — just expanding my mental toolkit.",
     "note", ["learning", "Rust", "programming"], ["Priya Sharma"]),

    ("Idea: productize my consulting discovery process",
     "My 4-week discovery process could be a productized service. Fixed price ($8k), fixed scope, fixed timeline. Deliverable: a 10-page report + recommendation roadmap. Lower risk for clients, easier to sell.",
     "note", ["consulting", "productization", "business"], []),

    ("Jamie's mom Helen visiting next month",
     "Helen arrives May 10, stays through Jamie's birthday (May 15). She'll help with the kids. Need to clear the guest room (it's become a storage disaster). She's allergic to cats — not a problem yet but relevant if we get a pet.",
     "note", ["family", "planning"], ["Helen", "Jamie"]),

    ("Why velocity metrics are harmful",
     "Bloom's engineering team started measuring story points per sprint. Predictable result: points inflated, quality dropped. Told Mika to track outcomes (features shipped to users) not output. She agreed to try it.",
     "note", ["engineering", "metrics", "management"], ["Mika Tanaka"]),

    ("FocusFlow's best hidden feature: the daily summary email",
     "The end-of-day email showing total focus time, distraction attempts blocked, and energy curve is our stickiest feature. Users who enable it have 3x lower churn. Should make it the default.",
     "note", ["FocusFlow", "product", "retention"], []),

    ("Dinner party recipes that always work",
     "Crowd pleasers for hosting: 1) Slow-roasted salmon with herb crust, 2) Mushroom risotto (vegetarian-friendly), 3) Jamie's lemon tart. Always double the wine estimate. People bring salad, we do mains + dessert.",
     "note", ["cooking", "entertaining", "family"], ["Jamie"]),

    ("Observations on Portland's food scene",
     "Best new restaurants this year: Gado Gado (Indonesian), Canard (wine bar), Langbaan (Thai tasting menu). Portland punch above its weight for a city this size. The food cart scene is still the best value though.",
     "note", ["Portland", "food", "lifestyle"], []),

    ("The compound effect of daily habits",
     "Cycling, journaling, deep work blocks — none of these felt significant in week 1. But 6 months later the compound effect is dramatic. I'm fitter, more creative, and more productive than I've been in years.",
     "note", ["habits", "productivity", "reflection"], []),

    # ── ADDITIONAL THOUGHTS TO REACH 200 ──
    ("Bloom's subscription box idea",
     "Mika is exploring a monthly subscription box: curated skincare routine shipped automatically. Pricing: $45/mo (products worth $70+). Retention play — locks in repeat purchases. Need to model unit economics.",
     "note", ["Bloom", "subscription", "business model"], ["Mika Tanaka"]),

    ("TerraLogic carbon footprint tracking",
     "Chen Wei brought up sustainability reporting. Clients are asking for carbon footprint per shipment. Doable with distance + vehicle type data they already have. Could be a differentiator in RFPs.",
     "note", ["TerraLogic", "sustainability", "feature"], ["Chen Wei"]),

    ("Lily's science fair project: plant growth",
     "Lily wants to test if music affects plant growth. We'll set up 3 plants: silence, classical, rock. She's already writing a hypothesis. Science fair is May 20. Need to start growing now.",
     "note", ["family", "education", "science"], ["Lily"]),

    ("FocusFlow API for integrations",
     "Several users asked for an API to integrate FocusFlow with their own tools. Building a simple REST API: GET /sessions, POST /focus-block, GET /stats. API keys for auth. Could unlock a developer community.",
     "note", ["FocusFlow", "API", "platform"], []),

    ("Meridian billing module scoping",
     "David Park confirmed the billing module project. Budget: $45k. Timeline: Q3. Scope: insurance claim submission, copay tracking, payment processing via Stripe. Need to bring in a payments specialist.",
     "note", ["Meridian Health", "billing", "project"], ["David Park"]),

    ("Best podcasts for product people",
     "My rotation: Lenny's Podcast (interviews), How I Built This (inspiration), Acquired (deep dives), The Product Podcast (tactics). Listen during cycling — dual productivity hack.",
     "note", ["learning", "podcasts", "product"], []),

    ("Sam's imaginary friend 'Captain Rocket'",
     "Sam has been talking to Captain Rocket for two weeks now. Dr. Evans says it's normal and healthy at his age. Captain Rocket apparently doesn't like broccoli either. Jamie is charmed by it.",
     "note", ["family", "kids", "development"], ["Sam", "Dr. Evans", "Jamie"]),

    ("Contractor Mike Chen kitchen estimate",
     "Mike came by and quoted $22k for the kitchen renovation. That's $3k under budget. Includes demo, new cabinets, quartz counters, backsplash. Doesn't include appliances. Can start June 1. 3-week timeline.",
     "note", ["home", "renovation", "kitchen"], ["Mike Chen"]),

    ("FocusFlow data export feature",
     "GDPR requires data portability. Built a CSV export of all focus sessions. Also added account deletion. Took a day but it's the right thing to do. Surprised how many users actually use the export — 12% monthly.",
     "note", ["FocusFlow", "GDPR", "privacy", "feature"], []),

    ("Meridian patient portal wireframes review",
     "Shared wireframes with Sarah and Lisa. Sarah loves the appointment booking flow. Lisa wants more detail on the insurance verification step. Raj asked about the tech stack — confirmed React + Node.",
     "note", ["Meridian Health", "design", "product"], ["Sarah Kim", "Lisa Wong", "Raj Gupta"]),

    ("Why I use a paper notebook alongside digital tools",
     "Digital for reference and search. Paper for thinking. Something about writing by hand engages different parts of the brain. My best ideas come from paper sketches, then I digitize what matters.",
     "note", ["productivity", "tools", "creativity"], []),

    ("TerraLogic driver retention problem",
     "Driver turnover is 40% annually. Exit interviews say: unpredictable schedules, low pay, no growth path. Chen Wei asked me to brainstorm retention features for the driver app. This is outside my usual scope but important.",
     "note", ["TerraLogic", "HR", "retention", "product"], ["Chen Wei"]),

    ("Bloom's TikTok strategy is working",
     "Mika's bet on TikTok is paying off. Their skincare routine videos are getting 50k-100k views. One went viral (2M views) — led to their biggest sales day ever. The brand voice on TikTok is authentic and fun.",
     "note", ["Bloom", "marketing", "social media"], ["Mika Tanaka"]),

    ("Teaching Sam to ride a bike",
     "Took the training wheels off this weekend. He crashed 4 times, cried twice, then suddenly got it. The look on his face when he rode 50 feet solo was priceless. Jamie filmed the whole thing.",
     "note", ["family", "milestones", "parenting"], ["Sam", "Jamie"]),

    ("The anxiety of client concentration risk",
     "Meridian is 43% of my revenue. If they churned, I'd be in trouble. Goal: no single client above 30%. Either grow TerraLogic/Bloom or find a 4th client. The FocusFlow growth helps diversify too.",
     "note", ["business", "risk", "strategy"], []),

    ("Open Brain could be FocusFlow's secret weapon",
     "What if FocusFlow had a knowledge capture layer? You're in deep focus, have an insight, capture it without breaking flow. Then Open Brain finds connections. Productivity tool + second brain. Nobody has this.",
     "note", ["FocusFlow", "Open Brain", "ideas", "product"], []),

    ("Jamie's book club recommendation: Educated",
     "Jamie's book club read 'Educated' by Tara Westover. She said it's the best book she's read this year. Added to my reading list. She also recommended 'Klara and the Sun' for something lighter.",
     "note", ["books", "family", "reading"], ["Jamie"]),

    ("Priya's talk at Portland Rust meetup",
     "Went to support Priya at the Portland Rust meetup. Her talk on async Rust in production was excellent. She's a much better speaker than she thinks. Encouraged her to submit to RustConf.",
     "note", ["community", "Rust", "events"], ["Priya Sharma"]),

    ("Spring cleaning: garage organization",
     "Spent Saturday organizing the garage. Built a lumber rack (leftover 2x4s), mounted bike hooks, added pegboard for tools. Sam 'helped' by sorting screws into cups. The garage is actually usable now.",
     "note", ["home", "organization", "woodworking"], ["Sam"]),

    ("FocusFlow's first feature request from a team",
     "The Seattle design agency wants: shared focus rooms (like Zoom but silent), team focus scores, and manager dashboards. The shared focus room is interesting — virtual co-working while in deep work mode.",
     "note", ["FocusFlow", "enterprise", "feature requests"], []),

    ("Observation: my best clients were all referrals",
     "Meridian: referral from a former colleague. TerraLogic: referral from Marcus Webb. Bloom: referral from a VC. Zero clients from cold outreach or content marketing. Relationships > marketing for consulting.",
     "note", ["consulting", "sales", "referrals"], ["Marcus Webb"]),

    ("Health insurance renewal: switching to Kaiser",
     "Current plan (Providence) is $1,400/mo for family. Kaiser HMO is $980/mo with better pediatric coverage. Trade-off: can't keep Dr. Novak. But the $5k/yr savings is hard to ignore. Jamie wants to stay with Providence.",
     "note", ["health", "insurance", "finance"], ["Jamie", "Dr. Novak"]),

    ("FocusFlow testimonial from Maria",
     "Maria wrote an unsolicited testimonial: 'FocusFlow helped me ship my portfolio redesign in 2 weeks instead of 2 months. The energy tracking showed me I was wasting my peak hours on email.' Gold for the landing page.",
     "note", ["FocusFlow", "testimonial", "marketing"], ["Maria"]),

    ("Quarterly planning ritual",
     "Every quarter: 1) Review last quarter's goals (hit/miss/why). 2) Update financial projections. 3) Set 3 big goals for next quarter. 4) Share with Jamie for accountability. Simple but keeps me on track.",
     "note", ["planning", "productivity", "business"], ["Jamie"]),

    ("The Portland Century training is going well",
     "Week 8 of training. Did 62 miles last Sunday — longest ever. Averaged 15.5 mph with 2,400 ft climbing. Legs recovered in 2 days. On track for 75 miles by July. The early mornings are paying off.",
     "note", ["cycling", "training", "fitness"], []),
]


def main():
    print(f"Loaded {len(THOUGHTS)} thoughts")

    random.seed(42)
    base_date = datetime(2026, 4, 8)

    thoughts = []
    for i, (title, content, ttype, topics, people) in enumerate(THOUGHTS):
        tid = str(uuid.uuid5(uuid.NAMESPACE_URL, title))
        days_ago = random.randint(0, 120)
        created = base_date - timedelta(days=days_ago, hours=random.randint(0, 23), minutes=random.randint(0, 59))

        thoughts.append({
            "id": tid,
            "title": title,
            "content": content,
            "created_at": created.isoformat() + "Z",
            "metadata": {
                "type": ttype,
                "topics": topics,
                "people": people,
            }
        })

    thoughts.sort(key=lambda t: t["created_at"], reverse=True)

    # Generate embeddings
    print("Loading model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Embed title + content together for best semantic matching
    texts = [f"{t['title']}. {t['content']}" for t in thoughts]
    print(f"Embedding {len(texts)} thoughts...")
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

    # Compute pairwise cosine similarity
    print("Computing similarity matrix...")
    sim_matrix = cosine_similarity(embeddings)

    # Build neighbor map: top N for each thought
    print(f"Building neighbor map (top {TOP_N} per thought)...")
    neighbors = {}
    id_list = [t["id"] for t in thoughts]

    for i, tid in enumerate(id_list):
        sims = sim_matrix[i]
        ranked = np.argsort(sims)[::-1]
        top = []
        for j in ranked:
            if j == i:
                continue
            top.append({
                "id": id_list[j],
                "similarity": round(float(sims[j]), 4)
            })
            if len(top) >= TOP_N:
                break
        neighbors[tid] = top

    output = {
        "thoughts": thoughts,
        "neighbors": neighbors,
    }

    out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "mock-data.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\nWritten {out_path}")
    print(f"  {len(thoughts)} thoughts ({sum(1 for t in thoughts if t['metadata']['type'] == 'task')} tasks, {sum(1 for t in thoughts if t['metadata']['type'] == 'note')} notes)")
    print(f"  {sum(len(v) for v in neighbors.values())} neighbor entries")
    print(f"  {size_kb:.0f} KB")

    # Show some interesting connections
    print("\nSample connections:")
    for t in thoughts[:5]:
        top3 = neighbors[t["id"]][:3]
        print(f"\n  '{t['title']}'")
        for n in top3:
            nt = next(x for x in thoughts if x["id"] == n["id"])
            print(f"    -> {n['similarity']:.2f} '{nt['title']}'")


if __name__ == "__main__":
    main()
