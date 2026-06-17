import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { trackCost } from "../costTracker";

const router = Router();

const getClient = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: key });
};

const PEDIGREE_CONTEXT = `
PEDIGREE REFERENCE (extract these fields for every resume):
TIER 1 COLLEGES — India: All IITs (Indian Institute of Technology), Indian Institute of Science (IISc), Birla Institute of Technology and Science(BITS) Pilani, BITS Hyderabad Campus, BITS Goa Campus, International Institute of Information Technology Hyderabad (IIIT Hyderabad), International Institute of Information Technology Bangalore (IIIT Bangalore), Indraprastha Institute of Information Technology Delhi (IIIT Delhi), Indian Institute of Information Technology Allahabad (IIIT Allahabad), Indian Institute of Information Technology Lucknow (IIIT Lucknow), Atal Bihari Vajpayee Indian Institute of Information Technology and Management Gwalior (ABV-IIITM Gwalior), Indian Institute of Information Technology Design and Manufacturing Jabalpur (IIITDM Jabalpur), Indian Institute of Information Technology Design and Manufacturing Kancheepuram (IIITDM Kancheepuram), National Institute of Technology Tiruchirappalli (NIT Trichy), National Institute of Technology Karnataka Surathkal (NITK Surathkal), National Institute of Technology Warangal (NIT Warangal), National Institute of Technology Rourkela (NIT Rourkela), National Institute of Technology Calicut (NIT Calicut), Motilal Nehru National Institute of Technology Allahabad (MNNIT Allahabad), Malaviya National Institute of Technology Jaipur (MNIT Jaipur), Visvesvaraya National Institute of Technology Nagpur (VNIT Nagpur), National Institute of Technology Durgapur (NIT Durgapur), National Institute of Technology Kurukshetra (NIT Kurukshetra), Delhi Technological University, Netaji Subhas University of Technology, Jadavpur University, Indian Institute of Management Ahmedabad (IIM Ahmedabad), Indian Institute of Management Bangalore (IIM Bangalore), Indian Institute of Management Calcutta (IIM Calcutta), Indian Institute of Management Lucknow (IIM Lucknow), Indian Institute of Management Kozhikode (IIM Kozhikode), Indian Institute of Management Indore (IIM Indore), Indian Institute of Management Mumbai (IIM Mumbai), Indian Institute of Management Shillong (IIM Shillong), Indian School of Business (ISB), NLSIU, Indian Institute of Science Bengaluru (IISc), Indian Statistical Institute Kolkata (ISI), Tata Institute of Fundamental Research Mumbai (TIFR), Indian Institute of Science Education and Research Pune (IISER Pune), Indian Institute of Science Education and Research Kolkata (IISER Kolkata), Indian Institute of Science Education and Research Mohali (IISER Mohali), Indian Institute of Science Education and Research Bhopal (IISER Bhopal), Indian Institute of Science Education and Research Thiruvananthapuram (IISER TVM), Indian Institute of Science Education and Research Tirupati (IISER Tirupati), Indian Institute of Science Education and Research Berhampur (IISER Berhampur), Shri Ram College of Commerce Delhi (SRCC), St. Stephen's College Delhi (St. Stephen's), Lady Shri Ram College for Women Delhi (LSR), Hindu College Delhi (Hindu College), Miranda House Delhi (Miranda House), Loyola College Chennai (Loyola College). International: MIT, Stanford, Carnegie Mellon, UC Berkeley, Harvard, Oxford, Cambridge, Imperial College London, ETH Zurich, NUS, NTU, University of Waterloo, Georgia Tech, Caltech, Columbia, Cornell, Yale, Princeton, University of Michigan, University of Edinburgh.

TIER 2 COLLEGES — India: NIT (all other campuses)- National Institute of Technology Agartala (NIT Agartala), National Institute of Technology Andhra Pradesh (NIT Andhra Pradesh), National Institute of Technology Arunachal Pradesh (NIT Arunachal Pradesh), National Institute of Technology Goa (NIT Goa), National Institute of Technology Manipur (NIT Manipur), National Institute of Technology Meghalaya (NIT Meghalaya), National Institute of Technology Mizoram (NIT Mizoram), National Institute of Technology Nagaland (NIT Nagaland), National Institute of Technology Puducherry (NIT Puducherry), National Institute of Technology Sikkim (NIT Sikkim), National Institute of Technology Uttarakhand (NIT Uttarakhand), National Institute of Technology Arunachal Pradesh (NIT Arunachal Pradesh), IIIT (all other campuses)- Indian Institute of Information Technology Pune (IIIT Pune), Indian Institute of Information Technology Guwahati (IIIT Guwahati), Indian Institute of Information Technology Sri City (IIIT Sri City), Indian Institute of Information Technology Nagpur (IIIT Nagpur), Indian Institute of Information Technology Kota (IIIT Kota), Indian Institute of Information Technology Bhubaneswar (IIIT Bhubaneswar), Indian Institute of Information Technology Vadodara (IIIT Vadodara), Indian Institute of Information Technology Ranchi (IIIT Ranchi), Indian Institute of Information Technology Kalyani (IIIT Kalyani), Indian Institute of Information Technology Una (IIIT Una), Indian Institute of Information Technology Sonepat (IIIT Sonepat), Indian Institute of Information Technology Dharwad (IIIT Dharwad), Indian Institute of Information Technology Kottayam (IIIT Kottayam), Indian Institute of Information Technology Tiruchirappalli (IIIT Trichy), Birla Institute of Technology Mesra (BIT Mesra), Vellore Institute of Technology Vellore (VIT Vellore)(NOT VIT Bhopal or VIT Amravati/AP/Andhra Pradesh), Manipal Institute of Technology Manipal (MIT Manipal)(NOT Manipal University Jaipur or Sikkim MIT), PSG College of Technology Coimbatore (PSG Tech), Thapar Institute of Engineering and Technology Patiala (TIET/Thapar), SRM Institute of Science and Technology Chennai (SRM), College of Engineering Pune (COEP), P. E. S. University Bengaluru (PES University), Ramaiah Institute of Technology Bengaluru (MSRIT), R. V. College of Engineering Bengaluru (RVCE), B. M. S. College of Engineering Bengaluru (BMSCE), DA-IICT Gandhinagar (DA-IICT), LNMIIT Jaipur (LNMIIT), Jaypee Institute of Information Technology Noida (JIIT), International Institute of Information Technology Bhubaneswar (IIIT Bhubaneswar), Shiv Nadar University (SNU), Ashoka University (Computer Science), Chandigarh University, KIIT Bhubaneswar, Amrita Vishwa Vidyapeetham Coimbatore, College of Engineering Pune (COEP), Veermata Jijabai Technological Institute Mumbai (VJTI), University Institute of Engineering and Technology Chandigarh (UIET), Institute of Engineering and Technology Lucknow (IET Lucknow), Government College of Engineering Pune (GCOE), Walchand College of Engineering Sangli (WCE), Punjab Engineering College Chandigarh (PEC), MBA / Management - Indian Institute of Management Udaipur (IIM Udaipur), Indian Institute of Management Tiruchirappalli (IIM Trichy), Indian Institute of Management Raipur (IIM Raipur), Indian Institute of Management Ranchi (IIM Ranchi), Indian Institute of Management Kashipur (IIM Kashipur), Indian Institute of Management Rohtak (IIM Rohtak), Indian Institute of Management Visakhapatnam (IIM Visakhapatnam), Indian Institute of Management Nagpur (IIM Nagpur), Indian Institute of Management Sambalpur (IIM Sambalpur), Indian Institute of Management Amritsar (IIM Amritsar), Indian Institute of Management Bodh Gaya (IIM Bodh Gaya), Indian Institute of Management Jammu (IIM Jammu), Indian Institute of Management Sirmaur (IIM Sirmaur) Management Development Institute Gurgaon (MDI Gurgaon), Indian Institute of Foreign Trade Delhi (IIFT Delhi), Jamnalal Bajaj Institute of Management Studies Mumbai (JBIMS), Tata Institute of Social Sciences Mumbai (TISS Mumbai), Xavier Institute of Management Bhubaneswar (XIMB), Institute of Rural Management Anand (IRMA), Great Lakes Institute of Management Chennai (Great Lakes), Department of Management Studies IIT Delhi (DMS IIT Delhi), Department of Management Studies IIT Madras (DoMS IIT Madras), Shailesh J. Mehta School of Management IIT Bombay (SJMSOM IIT Bombay)
Commerce / Economics / Humanities - Hansraj College Delhi (Hansraj College), Kirori Mal College Delhi (KMC), Ramjas College Delhi (Ramjas College), Sri Venkateswara College Delhi (Sri Venkateswara College), Jesus and Mary College Delhi (JMC), Gargi College Delhi (Gargi College), Delhi College of Arts and Commerce Delhi (DCAC), Christ University Bengaluru (Christ University), Narsee Monjee College of Commerce and Economics Mumbai (NM College), Mithibai College Mumbai (Mithibai College), Madras Christian College Chennai (MCC), Presidency University Kolkata (Presidency University), Symbiosis School for Liberal Arts Pune (SSLA), FLAME University Pune (FLAME University), Ashoka University Sonipat (Ashoka University)
Science / Research - National Institute of Science Education and Research Bhubaneswar (NISER), Chennai Mathematical Institute Chennai (CMI), Indian Institute of Science Education and Research Berhampur (IISER Berhampur), Indian Institute of Science Education and Research Tirupati (IISER Tirupati), Indian Institute of Science Education and Research Bhopal (IISER Bhopal), Indian Institute of Science Education and Research Thiruvananthapuram (IISER TVM), University of Hyderabad Hyderabad (UoH), Jawaharlal Nehru University New Delhi (JNU), Presidency University Kolkata (Presidency University), University of Delhi Science Departments (DU Science)
Law - National Law Institute University Bhopal (NLIU), National University of Study and Research in Law Ranchi (NUSRL), Hidayatullah National Law University Raipur (HNLU), Gujarat National Law University Gandhinagar (GNLU), National Law University Odisha Cuttack (NLUO), Rajiv Gandhi National University of Law Patiala (RGNUL)
Design - National Institute of Design Ahmedabad (NID Ahmedabad), National Institute of Design Gandhinagar (NID Gandhinagar), National Institute of Design Bengaluru (NID Bengaluru), MIT Institute of Design Pune (MIT ID), Srishti Manipal Institute of Art, Design and Technology Bengaluru (Srishti)
Economics-Focused - Delhi School of Economics Delhi (DSE), Madras School of Economics Chennai (MSE), Gokhale Institute of Politics and Economics Pune (GIPE), Ashoka University Sonipat (Ashoka University), St. Xavier's College Mumbai (St. Xavier's College), Presidency University Kolkata (Presidency University)

ALL OTHER COLLEGES ARE CONSIDERED TIER 3 AND BELOW!

TIER 1 COMPANIES — 
Tier 1 Global Tech
Google, Meta, Microsoft, Amazon, Apple, Netflix, NVIDIA, OpenAI, Anthropic, Databricks, Snowflake, Stripe, Airbnb, Uber, LinkedIn, Atlassian, Salesforce, Adobe, Oracle, Palantir, Dropbox, Cloudflare, HubSpot, Twilio, MongoDB, Confluent, Figma
Tier 1 Indian Product / Startup Companies
Flipkart, PhonePe, Razorpay, CRED, Swiggy, Zomato, Zepto, Meesho, Groww, Dream11, MPL, CoinSwitch, Pine Labs, Navi, Policybazaar, Nykaa, Ola, Ola Electric, Unacademy, Urban Company, Porter, NoBroker, Apna
Tier 1 Indian SaaS
Zoho, Freshworks, Postman, BrowserStack, Chargebee, Whatfix, Darwinbox, Hasura, Innovaccer, Gupshup, MoEngage, WebEngage
Tier 1 Consulting
McKinsey & Company, Boston Consulting Group, Bain & Company, Kearney, Oliver Wyman, Strategy&
Tier 1 Finance
Goldman Sachs, J.P. Morgan, Morgan Stanley, American Express, BlackRock, DE Shaw India, Tower Research Capital, Jane Street, Hudson River Trading, WorldQuant
Tier 1 Semiconductor / Hardware
NVIDIA, AMD, Intel, Qualcomm, Texas Instruments, Broadcom, Samsung Semiconductor
EVEN ALL FORTUNE 500 COMPANIES ARE TIER 1 COMPANIES

NON-WORK ENTRY DETECTION — scan the entire resume (not just the Work Experience section) and identify entries that are NOT real paid employment. Flag these even if they use a job title matching the role being hired for.
Patterns to flag: online courses (Coursera, Udemy, edX, LinkedIn Learning, Scaler, Newton School, Masai School, etc.), bootcamps, fellowships (Teach For India, Acumen, policy fellowships, etc.), research programs (college-run or funded, not at a company), career breaks listed as "freelance" or "consulting" with no named clients or deliverables, volunteer programs, incubators/accelerators where the candidate was a participant (not an employee), certificate programs, part-time side-learning listed as a role title. These could have mentioned all kinds of keywords and skills that the role asks for so flag them
Do NOT flag: legitimate company employment, paid internships at actual companies, startup founding/co-founding, contract work with named clients.

ALWAYS include these fields in your JSON output:
- college_name: candidate's most prestigious degree institution name (string)
- college_tier: "tier_1" | "tier_2" | "other"
- tier_1_companies: array of tier 1 company names the candidate has worked at (empty array if none)
- non_work_entries: array of { type: "course"|"bootcamp"|"fellowship"|"research"|"career_break"|"volunteering"|"other", name: string, duration_months: number|null } — empty array if none detected
`;

const RECALIBRATE_SYSTEM_PROMPT = `You are an expert hiring rubric engineer with 25+ yrs of experience
You will be given an evaluator prompt and HR feedback on a set of candidate evaluations.

Each feedback item includes the AI's decision, the AI's reasoning, whether the HR agrees, and if disagreeing — the direction and specific target:
- "higher": HR thinks the candidate deserved a BETTER rating than what AI gave (AI was too harsh)
- "lower": HR thinks the candidate deserved a WORSE rating than what AI gave (AI was too generous)
- hr_target: the exact rating HR believes is correct — "P0", "P1", "Reject", or "Baseline"
  - "Baseline" means: this case has exposed a problem with the non-negotiable / hard-requirement criteria — the baseline itself needs to change. HR is NOT picking a rating; they are saying the foundational pass/fail bar is miscalibrated.

Your job: make targeted, surgical adjustments to the evaluator prompt based on what HR corrected.

HOW TO USE hr_target FOR TARGETED EDITS:
- AI said P0, HR target is P1 → tighten P0 criteria: whatever HR flagged must now be required for P0. Add a specific, concrete criterion to the P0 section. Do NOT touch P1.
- AI said P0, HR target is Reject → both P0 and P1 bars were too low. Add a hard requirement or rejection trigger based on what HR described.
- AI said P1, HR target is P0 → the P0 bar is too strict for candidates like this. Loosen or clarify P0 criteria so candidates with the described strengths qualify.
- AI said P1, HR target is Reject → tighten the minimum bar. What HR described should become a rejection trigger or hard requirement in the non-negotiables section.
- AI said Reject, HR target is P0/P1 → the rejection was too aggressive. Loosen the specific hard requirement or non-negotiable that caused the over-rejection.
- Any target "Baseline" → the non-negotiable / hard-requirement criteria is wrong for this case. Based on HR's description, either: (a) a hard requirement is too strict and should be relaxed or removed, or (b) a missing hard requirement needs to be added. Edit the non-negotiables section specifically — do NOT touch P0/P1 criteria.

When HR provides a description (reject_reason), treat it as the root cause and translate it into a concrete prompt change — a new bullet point, a reworded threshold, or a new signal to look for.
Example: HR says "lacks impact metrics" and targets P1 → add to P0: "Must show measurable impact (quantified outcomes, scale of work, business results) — impressive-sounding roles without evidence of impact do not qualify for P0."
Example: HR targets Baseline and says "we should accept 1 year experience, not 2" → update the hard-requirements section to reflect the corrected minimum.

Rules:
- Look for patterns across multiple disagreements rather than reacting to each in isolation
- Do NOT change the overall structure of the prompt, but add or reword criteria where needed
- Do NOT change the output format (rating, score, reasoning, reject_reason, concerns must all stay)
- Focus on the actual work done and descriptions, not just job titles or company names
- Changes must be targeted and minimal — do not rewrite sections that are working

Return ONLY valid JSON with a single key "evaluator_prompt" containing the revised prompt string.
No markdown. No explanation.`;

const CONCURRENCY = 6;

// ── Cost tracking ─────────────────────────────────────────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.40, output: 1.60 },   // $ per 1M tokens
  "gpt-4o-mini":  { input: 0.15, output: 0.60  },
};

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { input: 0.40, output: 1.60 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

function logCostSummary(label: string, resumes: number, inputTokens: number, outputTokens: number, model: string) {
  const cost = calcCost(model, inputTokens, outputTokens);
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\n┌─ ${label} ${"─".repeat(Math.max(0, 52 - label.length))}`);
  console.log(`│  ${pad("Resumes evaluated:", 22)} ${resumes}`);
  console.log(`│  ${pad("Input tokens:", 22)} ${inputTokens.toLocaleString()}`);
  console.log(`│  ${pad("Output tokens:", 22)} ${outputTokens.toLocaleString()}`);
  console.log(`│  ${pad("Estimated cost:", 22)} $${cost.toFixed(4)}`);
  console.log(`└${"─".repeat(55)}\n`);
}

// Worker-pool: runs fn on every item with at most `concurrency` in flight at once.
async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// Safely parse an evaluator response that may be truncated mid-JSON.
// Tries full parse first; on failure extracts the rating field via regex so
// the resume still gets a result rather than a hard error.
function safeParseEval(raw: string): { rating: string; score: number | null; reject_reason: string | null; reasoning: string[]; concerns: string[] } {
  try {
    return JSON.parse(raw);
  } catch {
    // Extract just the rating from truncated JSON
    const ratingMatch = raw.match(/"rating"\s*:\s*"(P0|P1|Reject)"/);
    const rating = ratingMatch?.[1] ?? "Reject";

    const rejectMatch = raw.match(/"reject_reason"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);
    const reject_reason = rejectMatch?.[1]?.replace(/\\n/g, " ").replace(/\\"/g, '"') ?? null;

    // Extract partial reasoning array — grab any complete quoted strings inside it
    const reasoningBlock = raw.match(/"reasoning"\s*:\s*\[([^\]]*)/)?.[1] ?? "";
    const reasoning = [...reasoningBlock.matchAll(/"([^"\\]*(\\.[^"\\]*)*)"/g)]
      .map(m => m[1].replace(/\\n/g, " ").replace(/\\"/g, '"'))
      .filter(Boolean)
      .slice(0, 4);

    return { rating, score: null, reject_reason, reasoning, concerns: [] };
  }
}

/* ── Per-field vagueness check (replaced by clarifying questions flow) ────────
const VAGUENESS_CHECK_PROMPT = `...`;
router.post("/check-criteria-vagueness", ...) { ... }
──────────────────────────────────────────────────────────────────────────── */

// ── Clarifying questions generator ───────────────────────────────────────────
const CLARIFYING_QUESTIONS_PROMPT = `You are an expert hiring criteria interviewer.

Your job is to read hiring criteria written by an HR or hiring manager and identify phrases that are too vague to screen resumes accurately.

You are NOT rewriting the criteria yet. Your job is to ask sharp follow-up questions that force the hiring manager to define the real screening bar.

You will be given:
- the role title
- the role family / department context if available
- the seniority
- minimum experience
- the JD
- the original natural-language hiring brief if available
- the current criteria fields
- optionally a specific focus field to question right now

A phrase is vague if it could mean many different things in practice.

Examples:
- “good product experience”
- “good level of work”
- “great work in college”
- “strong projects”
- “leadership experience”
- “good ownership”
- “decent exposure”
- “good communication”
- “startup mindset”
- “good with Python”
- “good in problem solving”

A phrase is ALSO vague if the expected level of proficiency depends on the role, seniority, experience, or job context.

For example:
“Strong Python” means very different things for:
- an intern
- a fresher
- a mid-level engineer
- a senior engineer
- a staff engineer

Similarly: leadership, ownership, Java, SQL, React, communication, system design, stakeholder management, product thinking — and basically any technical or skill proficiency required by the job — all require different evidence depending on the level expected for the role.

Your goal is to uncover these missing expectations.

────────────────────────────────────────────────────────────────────────────────
Before asking any question

For every criterion, think through these questions:
1. What capability is actually being evaluated?
2. What resume evidence would prove that capability?
3. What level of evidence should qualify for THIS role?
4. Would two experienced recruiters likely screen candidates consistently using the criterion exactly as written?

If the answer to #4 is YES, do not ask a clarification.
If the answer is NO, generate a clarification question.

────────────────────────────────────────────────────────────────────────────────
Always interpret criteria relative to the role

VERY IMPORTANT:
Never assume the same screening bar across all roles.
Always interpret every criterion relative to: role title, role family, seniority, minimum experience, job description, and original hiring brief.
The same criterion should produce different expectations depending on the role.

Example:
“Strong Python”
- Intern: coursework, college projects, hackathons
- Fresher: multiple projects, internships, practical backend work
- Senior Engineer: production systems, architecture, scalability, performance, mentoring, technical ownership

If the expected level is unclear, ask about it.

────────────────────────────────────────────────────────────────────────────────
Types of ambiguity you should identify

Generate clarification questions whenever a criterion has ambiguity in any of these dimensions:

1. Meaning ambiguity
   Examples: ownership, leadership, startup mindset, communication, strong, good, excellent, solid

2. Evidence ambiguity — the hiring manager has not defined what resume evidence should count.
   Example: “Good communication” — should this mean presentations, customer-facing work, stakeholder management, public speaking, documentation, cross-functional collaboration?

3. Proficiency ambiguity — the expected level depends on the role.
   Examples:
   - “Strong SQL” could mean: CRUD queries | joins & aggregations | optimization | warehouse design
   - “Strong Python” could mean: coursework | personal projects | production APIs | distributed systems

4. Threshold ambiguity — the hiring manager has not defined what minimum bar qualifies.
   Examples: How many projects? How many internships? Live deployment required? Production experience required? External recognition required?

5. Complexity ambiguity — especially important for technical roles.
   Ask whether the expectation is about: scale, complexity, production usage, ownership, architectural responsibility, performance, duration of work, depth of implementation.
   Example: “Python” is NOT enough. Clarify whether they expect: coursework | automation scripts | backend APIs | production services | distributed systems | infrastructure | ML pipelines

────────────────────────────────────────────────────────────────────────────────
Skill-specific clarification guidance

When technical skills are mentioned, ask about the actual evidence expected, not subjective proficiency.
- Bad: “What do you mean by Python?” / options: Beginner / Intermediate / Advanced
- Good: “What kind of Python work should count?” / options: College projects | Internship projects | Production applications | Large-scale systems

SQL:     Basic queries | Complex joins | Query optimization | Data warehouse work
React:   Academic projects | Production applications | Large frontend applications | Design systems
Java:    Coursework | Backend services | Distributed systems | Performance/concurrency-heavy systems
System Design: Learned concepts | Small applications | Production architecture | Large distributed systems

IN EACH OF IT YOU WILL NOT JUST TALK ABOUT THE SCALE OR OWNERSHIP OF WORK, IT IS ABOUT THE TECHNICAL SKILL LEVEL AND ABILITY TO APPLY THOSE TECHNICAL CONCEPTS TOO!
────────────────────────────────────────────────────────────────────────────────
Soft-skill clarification guidance

When clarifying soft skills, ask about observable evidence.
- Leadership:      Led a club | Managed a small team | Managed cross-functional teams | Built and scaled organizations
- Ownership:       Finished assigned work | Owned features | Owned products | Owned business outcomes
- Communication:   Team communication | Stakeholder management | Client-facing work | Executive communication
- Problem solving: Academic problems | Real-world projects | Large ambiguous problems | High-impact technical decisions

────────────────────────────────────────────────────────────────────────────────
Product-specific guidance

If the role is product or product-adjacent, useful evidence includes:
shipped features, product ownership, user research, prioritization, stakeholder coordination, experimentation, growth, metrics ownership, product thinking, end-to-end ownership

────────────────────────────────────────────────────────────────────────────────
Fresher / Intern guidance

If the role is intern, fresher, junior, or associate-level, acceptable evidence may include:
internships, personal projects, hackathons, research, clubs, societies, leadership roles, competitions, freelancing, events organized, open-source contributions, scholarships, Dean's List, communities built.

Do not assume production experience is required unless the hiring manager indicates it.

────────────────────────────────────────────────────────────────────────────────
Great work / Strong work guidance

If the hiring manager writes “great work”, “amazing work”, “strong work”, “exceptional work”, break it into interpretable dimensions such as:
ownership, initiative, execution quality, technical complexity, measurable impact, scale, external validation, recognition, user adoption, live deployment

────────────────────────────────────────────────────────────────────────────────
Question-writing rules

Every clarification question MUST:
- identify the vague phrase explicitly
- ask about one ambiguity only
- ask what evidence should count
- ask what level should qualify
- be immediately useful for resume screening
- sound like a smart recruiter trying to pin down the actual hiring bar
- NOT be a generic question like “Can you clarify?”

────────────────────────────────────────────────────────────────────────────────
Option-writing rules

VERY IMPORTANT: The questions and options should be extremely easy to read. Keep every option short. Avoid long explanations.

Options should represent increasing levels of evidence rather than subjective labels.
Never use: Good / Average / Excellent / Beginner / Intermediate / Advanced
Instead use observable resume signals.

Example — Ownership:
  ❌ Good ownership
  ✅ Worked on assigned tasks | Owned a feature | Owned a product area | Owned business outcomes

Example — Python:
  ❌ Beginner / Intermediate / Advanced
  ✅ College projects | Internship projects | Production applications | Large-scale systems

Options must be concrete, mutually distinguishable, and directly usable for screening resumes. Use 3–4 options per question.

────────────────────────────────────────────────────────────────────────────────
General rules

- Ask only about ambiguities that materially improve screening accuracy.
- Ask only high-impact questions.
- Maximum 9 questions total.
- Maximum 3 questions per criteria field.
- If focus_field is provided, ask questions ONLY for that field.
- If the criteria are already specific enough, return needs_clarification=false.
- Never rewrite the hiring criteria.
- Never infer hiring preferences that are not supported by the provided context.
- Every clarification should help produce a more objective, repeatable screening decision.

────────────────────────────────────────────────────────────────────────────────
Context:

Role title: {role_title}
Role family / department: {role_family}
Source role label: {source_role}
Seniority: {seniority}
Minimum experience: {min_experience_months} months
Original hiring brief: {source_context}
Job description:
{jd_context}

Current criteria:
P0 (Strong Hire): {p0_text}
P1 (Potential Hire): {p1_text}
Dealbreakers: {dealbreakers}

Focus field: {focus_field}

Return ONLY valid JSON:
{
  “needs_clarification”: boolean,
  “questions”: [
    {
      “id”: “q1”,
      “field”: “p0” | “p1” | “dealbreakers”,
      “vague_phrase”: “exact vague phrase”,
      “question”: “clear recruiter-style question”,
      “context”: “one short sentence explaining why this matters for screening accuracy”,
      “options”: [“option 1”, “option 2”, “option 3”, “option 4”]
    }
  ]
}`;
// ─────────────────────────────────────────────────────────────────────────────

router.post("/generate-clarifying-questions", async (req: Request, res: Response) => {
  const { p0_text, p1_text, dealbreakers, role_title, seniority, min_experience_months, jd_context, source_context, source_role, role_family, focus_field } = req.body as {
    p0_text?: string; p1_text?: string; dealbreakers?: string;
    role_title?: string; seniority?: string; min_experience_months?: number; jd_context?: string;
    source_context?: string; source_role?: string; role_family?: string;
    focus_field?: "p0" | "p1" | "dealbreakers";
  };

  if (!p0_text?.trim() && !p1_text?.trim() && !dealbreakers?.trim()) {
    return res.json({ needs_clarification: false, questions: [] });
  }

  let client: OpenAI;
  try { client = getClient(); } catch (e: any) { return res.status(500).json({ error: e.message }); }

  const filled = CLARIFYING_QUESTIONS_PROMPT
    .replace("{role_title}", role_title ?? "Not specified")
    .replace("{role_family}", role_family ?? "Not specified")
    .replace("{source_role}", source_role ?? "Not specified")
    .replace("{seniority}", seniority ?? "Not specified")
    .replace("{min_experience_months}", String(min_experience_months ?? 0))
    .replace("{source_context}", source_context?.trim() || "Not provided")
    .replace("{jd_context}", jd_context?.trim() || "Not provided")
    .replace("{p0_text}", p0_text?.trim() || "Not provided")
    .replace("{p1_text}", p1_text?.trim() || "Not provided")
    .replace("{dealbreakers}", dealbreakers?.trim() || "Not provided")
    .replace("{focus_field}", focus_field ?? "all");

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: filled }],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });
    const raw = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw);
    return res.json({
      needs_clarification: !!parsed.needs_clarification,
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "Failed to generate questions" });
  }
});

router.post("/recalibrate-prompt", async (req: Request, res: Response) => {
  const { evaluator_prompt, feedback } = req.body as {
    evaluator_prompt: string;
    feedback: Array<{
      filename: string;
      decision: string;
      reasoning: string[];
      hr_agrees: boolean;
      hr_direction?: "higher" | "lower" | null;
      hr_target?: "P0" | "P1" | "Reject" | "Baseline";
      reject_reason?: { category: string; description: string };
    }>;
  };

  if (!evaluator_prompt) {
    return res.status(400).json({ error: "evaluator_prompt is required." });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  const disagreements = (feedback ?? []).filter(f => !f.hr_agrees);
  const agreements = (feedback ?? []).filter(f => f.hr_agrees);

  const feedbackSummary = [
    disagreements.length > 0
      ? `HR DISAGREED with ${disagreements.length} decision(s):\n` +
        disagreements.map(f => {
          const directionNote = f.hr_direction
            ? ` [AI was ${f.hr_direction === "higher" ? "too harsh" : "too generous"}]`
            : "";
          const targetNote = f.hr_target
            ? ` [HR says correct outcome: ${f.hr_target}${f.hr_target === "Baseline" ? " — the non-negotiable/hard-requirement criteria needs to change based on this case" : ""}]`
            : "";
          const reasonNote = f.reject_reason
            ? ` [HR flagged: ${f.reject_reason.category} — "${f.reject_reason.description}"]`
            : "";
          return `- ${f.filename}: AI said ${f.decision}.${directionNote}${targetNote}${reasonNote} AI reasoning: ${(f.reasoning ?? []).join(" | ")}`;
        }).join("\n")
      : "",
    agreements.length > 0
      ? `HR AGREED with ${agreements.length} decision(s):\n` +
        agreements.map(f =>
          `- ${f.filename}: AI said ${f.decision}. Reasoning: ${(f.reasoning ?? []).join(" | ")}`
        ).join("\n")
      : "",
  ].filter(Boolean).join("\n\n");

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: RECALIBRATE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Current evaluator prompt:\n\n${evaluator_prompt}\n\n---\n\nHR Feedback:\n${feedbackSummary}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    trackCost("Recalibrate Prompt", "Taste Check", "gpt-4.1-mini", completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0);
    const raw = completion.choices[0].message.content ?? "";
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.evaluator_prompt) {
        return res.status(500).json({ error: "Model did not return an evaluator_prompt", raw_response: raw });
      }
      return res.json({ new_evaluator_prompt: parsed.evaluator_prompt });
    } catch {
      return res.status(500).json({ error: "Failed to parse recalibration response", raw_response: raw });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "OpenAI API error" });
  }
});

router.post("/bulk-screen-stream", async (req: Request, res: Response) => {
  const { resumes, compressor_prompt, evaluator_prompt, label = "SCREENING" } = req.body as {
    resumes: { text: string; filename: string }[];
    compressor_prompt: string;
    evaluator_prompt: string;
    label?: string;
  };

  if (!resumes?.length || !compressor_prompt || !evaluator_prompt) {
    return res.status(400).json({ error: "resumes, compressor_prompt, and evaluator_prompt are required." });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const total = resumes.length;
  const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  sendEvent({ type: "start", total });

  let completed = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const MODEL = "gpt-4.1-mini";

  await runConcurrent(resumes, CONCURRENCY, async (resume) => {
    try {
      const compressRes = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: compressor_prompt },
          { role: "user", content: `Today's date: ${new Date().toISOString().slice(0, 10)}\n${PEDIGREE_CONTEXT}\nResume text (return extracted signals as JSON):\n\n${resume.text}` },
        ],
        response_format: { type: "json_object" },
      });
      totalInput  += compressRes.usage?.prompt_tokens     ?? 0;
      totalOutput += compressRes.usage?.completion_tokens ?? 0;

      const signalJson = JSON.parse(compressRes.choices[0].message.content ?? "{}");

      const evalRes = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: evaluator_prompt },
          { role: "user", content: `Today's date: ${new Date().toISOString().slice(0, 10)}\n\nCandidate signal JSON:\n\n${JSON.stringify(signalJson)}\n\nReturn your evaluation as JSON.` },
        ],
        response_format: { type: "json_object" },
      });
      totalInput  += evalRes.usage?.prompt_tokens     ?? 0;
      totalOutput += evalRes.usage?.completion_tokens ?? 0;

      const rating = safeParseEval(evalRes.choices[0].message.content ?? "{}");
      completed++;
      sendEvent({
        type: "result",
        completed,
        total,
        data: {
          filename: resume.filename,
          name: signalJson.name ?? resume.filename,
          email: signalJson.email ?? null,
          phone: signalJson.phone ?? null,
          signal_json: signalJson,
          rating: rating.rating ?? "Reject",
          score: rating.score ?? null,
          reject_reason: rating.reject_reason ?? null,
          reasoning: Array.isArray(rating.reasoning) ? rating.reasoning : [],
          concerns: Array.isArray(rating.concerns) ? rating.concerns : [],
        },
      });
    } catch (e: any) {
      completed++;
      sendEvent({
        type: "result",
        completed,
        total,
        data: {
          filename: resume.filename,
          name: resume.filename,
          email: null,
          phone: null,
          rating: "Error",
          score: null,
          reject_reason: e.message ?? "Processing failed",
          reasoning: [],
          concerns: [],
        },
      });
    }
  });

  logCostSummary(label, total, totalInput, totalOutput, MODEL);
  trackCost(label, label.startsWith("FULL") ? "Full Pool" : "Taste Check", MODEL, totalInput, totalOutput, total);
  sendEvent({ type: "done", total });
  res.end();
});

function toNumberScore(score: unknown): number | null {
  if (typeof score === "number" && Number.isFinite(score)) return score;
  if (typeof score === "string") {
    const parsed = Number(score);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function categorizeForTasteSample(result: any): string {
  if (result.rating === "Error") return "processing_error";

  const score = toNumberScore(result.score);
  const concerns = Array.isArray(result.concerns) ? result.concerns : [];

  if (result.rating === "P0") return "passed_all_parameters";
  if (result.rating === "P1" && concerns.length > 0) return "edge_case_passed";
  if (result.rating === "P1") return "passed_many_parameters";
  if (result.rating === "Reject" && score !== null && score >= 55) return "borderline_reject";
  if (result.rating === "Reject" && concerns.length > 0) return "failed_some_parameters";
  if (result.rating === "Reject") return "clearly_bad_fit";

  return "mixed";
}

function selectDiverseSample(results: any[], n: number): string[] {
  const valid = results.filter(r => r.rating !== "Error");
  if (valid.length <= n) return valid.map(r => r.filename);

  const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
  const buckets = new Map<string, any[]>();

  for (const result of valid) {
    const category = categorizeForTasteSample(result);
    buckets.set(category, [...(buckets.get(category) ?? []), result]);
  }

  const preferredOrder = [
    "passed_all_parameters",
    "edge_case_passed",
    "passed_many_parameters",
    "borderline_reject",
    "failed_some_parameters",
    "clearly_bad_fit",
    "mixed",
  ];

  const selected: string[] = [];
  for (const category of preferredOrder) {
    if (selected.length >= n) break;
    const bucket = buckets.get(category) ?? [];
    const pick = shuffle(bucket).find(r => !selected.includes(r.filename));
    if (pick) selected.push(pick.filename);
  }

  if (selected.length < n) {
    const selectedSet = new Set(selected);
    const extras = shuffle(valid.filter(r => !selectedSet.has(r.filename)))
      .slice(0, n - selected.length)
      .map((r: any) => r.filename);
    selected.push(...extras);
  }

  return selected.slice(0, n);
}

router.post("/screen-and-sample", async (req: Request, res: Response) => {
  const { resumes, compressor_prompt, evaluator_prompt, sample_size = 6 } = req.body as {
    resumes: { text: string; filename: string }[];
    compressor_prompt: string;
    evaluator_prompt: string;
    sample_size?: number;
  };

  if (!resumes?.length || !compressor_prompt || !evaluator_prompt) {
    return res.status(400).json({ error: "resumes, compressor_prompt, and evaluator_prompt are required." });
  }

  let client: OpenAI;
  try { client = getClient(); } catch (e: any) { return res.status(500).json({ error: e.message }); }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const total = resumes.length;
  let completed = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const MODEL = "gpt-4.1-mini";
  const allResults: any[] = [];

  const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  sendEvent({ type: "start", total, sample_size });

  await runConcurrent(resumes, CONCURRENCY, async (resume) => {
    try {
      const compressRes = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: compressor_prompt },
          { role: "user", content: `Today's date: ${new Date().toISOString().slice(0, 10)}\n${PEDIGREE_CONTEXT}\nResume text (return extracted signals as JSON):\n\n${resume.text}` },
        ],
        response_format: { type: "json_object" },
      });
      totalInput  += compressRes.usage?.prompt_tokens     ?? 0;
      totalOutput += compressRes.usage?.completion_tokens ?? 0;

      const signalJson = JSON.parse(compressRes.choices[0].message.content ?? "{}");

      const evalRes = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: evaluator_prompt },
          { role: "user", content: `Today's date: ${new Date().toISOString().slice(0, 10)}\n\nCandidate signal JSON:\n\n${JSON.stringify(signalJson)}\n\nReturn your evaluation as JSON.` },
        ],
        response_format: { type: "json_object" },
      });
      totalInput  += evalRes.usage?.prompt_tokens     ?? 0;
      totalOutput += evalRes.usage?.completion_tokens ?? 0;

      const rating = safeParseEval(evalRes.choices[0].message.content ?? "{}");
      completed++;
      const result = {
        filename: resume.filename,
        name: signalJson.name ?? resume.filename,
        email: signalJson.email ?? null,
        phone: signalJson.phone ?? null,
        signal_json: signalJson,
        rating: rating.rating ?? "Reject",
        score: rating.score ?? null,
        reject_reason: rating.reject_reason ?? null,
        reasoning: Array.isArray(rating.reasoning) ? rating.reasoning : [],
        concerns: Array.isArray(rating.concerns) ? rating.concerns : [],
        sample_category: "",
      };
      result.sample_category = categorizeForTasteSample(result);
      allResults.push(result);
      sendEvent({ type: "result", completed, done: completed, total, data: result });
    } catch (e: any) {
      completed++;
      const errResult = {
        filename: resume.filename,
        name: resume.filename,
        email: null,
        phone: null,
        signal_json: {},
        rating: "Error",
        score: null,
        reject_reason: e.message ?? "Processing failed",
        reasoning: [],
        concerns: [],
        sample_category: "processing_error",
      };
      allResults.push(errResult);
      sendEvent({ type: "result", completed, done: completed, total, data: errResult });
    }
  });

  logCostSummary("TASTE CHECK — Screen & Sample", total, totalInput, totalOutput, MODEL);
  trackCost("Screen & Sample", "Taste Check", MODEL, totalInput, totalOutput, total);
  const safeSampleSize = Math.max(1, Math.min(10, Number(sample_size) || 6));
  const sampleFilenames = selectDiverseSample(allResults, safeSampleSize);
  const sampleResults = sampleFilenames
    .map(filename => allResults.find(r => r.filename === filename))
    .filter(Boolean);
  const errorCount = allResults.filter(r => r.rating === "Error").length;
  sendEvent({ type: "sample", filenames: sampleFilenames, results: sampleResults });
  sendEvent({ type: "done", total, error_count: errorCount, all_results: allResults });
  res.end();
});

router.post("/bulk-eval-stream", async (req: Request, res: Response) => {
  const { candidates, evaluator_prompt } = req.body as {
    candidates: { filename: string; name: string; email: string | null; phone: string | null; signal_json: object }[];
    evaluator_prompt: string;
  };

  if (!candidates?.length || !evaluator_prompt) {
    return res.status(400).json({ error: "candidates and evaluator_prompt are required." });
  }

  let client: OpenAI;
  try { client = getClient(); } catch (e: any) { return res.status(500).json({ error: e.message }); }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const total = candidates.length;
  const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  sendEvent({ type: "start", total });

  let completed = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const MODEL = "gpt-4.1-mini";

  await runConcurrent(candidates, CONCURRENCY, async (candidate) => {
    try {
      const evalRes = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: evaluator_prompt },
          { role: "user", content: `Today's date: ${new Date().toISOString().slice(0, 10)}\n\nCandidate signal JSON:\n\n${JSON.stringify(candidate.signal_json)}\n\nReturn your evaluation as JSON.` },
        ],
        response_format: { type: "json_object" },
      });
      totalInput  += evalRes.usage?.prompt_tokens     ?? 0;
      totalOutput += evalRes.usage?.completion_tokens ?? 0;
      const rating = safeParseEval(evalRes.choices[0].message.content ?? "{}");
      completed++;
      sendEvent({
        type: "result",
        completed,
        total,
        data: {
          filename: candidate.filename,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          college_name: (candidate as any).college_name ?? null,
          college_tier: (candidate as any).college_tier ?? null,
          rating: rating.rating ?? "Reject",
          score: rating.score ?? null,
          reject_reason: rating.reject_reason ?? null,
          reasoning: Array.isArray(rating.reasoning) ? rating.reasoning : [],
          concerns: Array.isArray(rating.concerns) ? rating.concerns : [],
        },
      });
    } catch (e: any) {
      completed++;
      sendEvent({
        type: "result",
        completed,
        total,
        data: {
          filename: candidate.filename,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          rating: "Error",
          score: null,
          reject_reason: e.message ?? "Processing failed",
          reasoning: [],
          concerns: [],
        },
      });
    }
  });

  logCostSummary("RE-EVALUATION (post-recalibration)", total, totalInput, totalOutput, MODEL);
  trackCost("Re-evaluate Batch", "Taste Check", MODEL, totalInput, totalOutput, total);
  sendEvent({ type: "done", total });
  res.end();
});

export { router as mockFlowRouter };
