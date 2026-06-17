import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { trackCost } from "../costTracker";

const router = Router();

const getClient = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: key });
};

// ── Pedigree tier lists (used to inject explicit names into evaluator prompts) ─
const TIER1_COLLEGES = `All campuses of IITs (Indian Institute of Technology- any campus), Indian Institute of Science (IISc), Birla Institute of Technology and Science(BITS) Pilani, BITS Hyderabad Campus, BITS Goa Campus, International Institute of Information Technology Hyderabad (IIIT Hyderabad), International Institute of Information Technology Bangalore (IIIT Bangalore), Indraprastha Institute of Information Technology Delhi (IIIT Delhi), Indian Institute of Information Technology Allahabad (IIIT Allahabad), Indian Institute of Information Technology Lucknow (IIIT Lucknow), Atal Bihari Vajpayee Indian Institute of Information Technology and Management Gwalior (ABV-IIITM Gwalior), Indian Institute of Information Technology Design and Manufacturing Jabalpur (IIITDM Jabalpur), Indian Institute of Information Technology Design and Manufacturing Kancheepuram (IIITDM Kancheepuram), National Institute of Technology Tiruchirappalli (NIT Trichy), National Institute of Technology Karnataka Surathkal (NITK Surathkal), National Institute of Technology Warangal (NIT Warangal), National Institute of Technology Rourkela (NIT Rourkela), National Institute of Technology Calicut (NIT Calicut), Motilal Nehru National Institute of Technology Allahabad (MNNIT Allahabad), Malaviya National Institute of Technology Jaipur (MNIT Jaipur), Visvesvaraya National Institute of Technology Nagpur (VNIT Nagpur), National Institute of Technology Durgapur (NIT Durgapur), National Institute of Technology Kurukshetra (NIT Kurukshetra), Delhi Technological University, Netaji Subhas University of Technology, Jadavpur University, Indian Institute of Management Ahmedabad (IIM Ahmedabad), Indian Institute of Management Bangalore (IIM Bangalore), Indian Institute of Management Calcutta (IIM Calcutta), Indian Institute of Management Lucknow (IIM Lucknow), Indian Institute of Management Kozhikode (IIM Kozhikode), Indian Institute of Management Indore (IIM Indore), Indian Institute of Management Mumbai (IIM Mumbai), Indian Institute of Management Shillong (IIM Shillong), Indian School of Business (ISB), NLSIU, Indian Institute of Science Bengaluru (IISc), Indian Statistical Institute Kolkata (ISI), Tata Institute of Fundamental Research Mumbai (TIFR), Indian Institute of Science Education and Research Pune (IISER Pune), Indian Institute of Science Education and Research Kolkata (IISER Kolkata), Indian Institute of Science Education and Research Mohali (IISER Mohali), Indian Institute of Science Education and Research Bhopal (IISER Bhopal), Indian Institute of Science Education and Research Thiruvananthapuram (IISER TVM), Indian Institute of Science Education and Research Tirupati (IISER Tirupati), Indian Institute of Science Education and Research Berhampur (IISER Berhampur), Shri Ram College of Commerce Delhi (SRCC), St. Stephen's College Delhi (St. Stephen's), Lady Shri Ram College for Women Delhi (LSR), Hindu College Delhi (Hindu College), Miranda House Delhi (Miranda House), Loyola College Chennai (Loyola College). International: MIT, Stanford, Carnegie Mellon, UC Berkeley, Harvard, Oxford, Cambridge, Imperial College London, ETH Zurich, NUS, NTU, University of Waterloo, Georgia Tech, Caltech, Columbia, Cornell, Yale, Princeton, University of Michigan, University of Edinburgh.`;
const TIER2_COLLEGES = ` SOME CANDIDATES DON'T WRITE CAMPUS NAME THERE IN THE COLLEGE, THEY WRITE THE LOCATION OF IT- SO IF YOU CAN'T FIND CAMPUS FROM THE NAME OF THE COLLEGE, MAYBE LOOK FOR LOCATION OF THE COLLEGE IN THE RESUME
NIT (all other campuses)- National Institute of Technology Agartala (NIT Agartala), National Institute of Technology Andhra Pradesh (NIT Andhra Pradesh), National Institute of Technology Arunachal Pradesh (NIT Arunachal Pradesh), National Institute of Technology Goa (NIT Goa), National Institute of Technology Manipur (NIT Manipur), National Institute of Technology Meghalaya (NIT Meghalaya), National Institute of Technology Mizoram (NIT Mizoram), National Institute of Technology Nagaland (NIT Nagaland), National Institute of Technology Puducherry (NIT Puducherry), National Institute of Technology Sikkim (NIT Sikkim), National Institute of Technology Uttarakhand (NIT Uttarakhand), National Institute of Technology Arunachal Pradesh (NIT Arunachal Pradesh), IIIT (all other campuses)- Indian Institute of Information Technology Pune (IIIT Pune), Indian Institute of Information Technology Guwahati (IIIT Guwahati), Indian Institute of Information Technology Sri City (IIIT Sri City), Indian Institute of Information Technology Nagpur (IIIT Nagpur), Indian Institute of Information Technology Kota (IIIT Kota), Indian Institute of Information Technology Bhubaneswar (IIIT Bhubaneswar), Indian Institute of Information Technology Vadodara (IIIT Vadodara), Indian Institute of Information Technology Ranchi (IIIT Ranchi), Indian Institute of Information Technology Kalyani (IIIT Kalyani), Indian Institute of Information Technology Una (IIIT Una), Indian Institute of Information Technology Sonepat (IIIT Sonepat), Indian Institute of Information Technology Dharwad (IIIT Dharwad), Indian Institute of Information Technology Kottayam (IIIT Kottayam), Indian Institute of Information Technology Tiruchirappalli (IIIT Trichy), Birla Institute of Technology Mesra (BIT Mesra), Vellore Institute of Technology (VIT Vellore)(NOT VIT Bhopal or VIT Amravati/AP/Andhra Pradesh), Manipal Institute of Technology (MIT Manipal)(NOT Manipal University Jaipur or Sikkim MIT), PSG College of Technology Coimbatore (PSG Tech), Thapar Institute of Engineering and Technology Patiala (TIET/Thapar), SRM Institute of Science and Technology Chennai (SRM), College of Engineering Pune (COEP), P. E. S. University Bengaluru (PES University), Ramaiah Institute of Technology Bengaluru (MSRIT), R. V. College of Engineering Bengaluru (RVCE), B. M. S. College of Engineering Bengaluru (BMSCE), DA-IICT Gandhinagar (DA-IICT), LNMIIT Jaipur (LNMIIT), Jaypee Institute of Information Technology Noida (JIIT), International Institute of Information Technology Bhubaneswar (IIIT Bhubaneswar), Shiv Nadar University (SNU), Ashoka University (Computer Science), Chandigarh University, KIIT Bhubaneswar, Amrita Vishwa Vidyapeetham Coimbatore, College of Engineering Pune (COEP), Veermata Jijabai Technological Institute Mumbai (VJTI), University Institute of Engineering and Technology Chandigarh (UIET), Institute of Engineering and Technology Lucknow (IET Lucknow), Government College of Engineering Pune (GCOE), Walchand College of Engineering Sangli (WCE), Punjab Engineering College Chandigarh (PEC), MBA / Management - Indian Institute of Management Udaipur (IIM Udaipur), Indian Institute of Management Tiruchirappalli (IIM Trichy), Indian Institute of Management Raipur (IIM Raipur), Indian Institute of Management Ranchi (IIM Ranchi), Indian Institute of Management Kashipur (IIM Kashipur), Indian Institute of Management Rohtak (IIM Rohtak), Indian Institute of Management Visakhapatnam (IIM Visakhapatnam), Indian Institute of Management Nagpur (IIM Nagpur), Indian Institute of Management Sambalpur (IIM Sambalpur), Indian Institute of Management Amritsar (IIM Amritsar), Indian Institute of Management Bodh Gaya (IIM Bodh Gaya), Indian Institute of Management Jammu (IIM Jammu), Indian Institute of Management Sirmaur (IIM Sirmaur) Management Development Institute Gurgaon (MDI Gurgaon), Indian Institute of Foreign Trade Delhi (IIFT Delhi), Jamnalal Bajaj Institute of Management Studies Mumbai (JBIMS), Tata Institute of Social Sciences Mumbai (TISS Mumbai), Xavier Institute of Management Bhubaneswar (XIMB), Institute of Rural Management Anand (IRMA), Great Lakes Institute of Management Chennai (Great Lakes), Department of Management Studies IIT Delhi (DMS IIT Delhi), Department of Management Studies IIT Madras (DoMS IIT Madras), Shailesh J. Mehta School of Management IIT Bombay (SJMSOM IIT Bombay)
Commerce / Economics / Humanities - Hansraj College Delhi (Hansraj College), Kirori Mal College Delhi (KMC), Ramjas College Delhi (Ramjas College), Sri Venkateswara College Delhi (Sri Venkateswara College), Jesus and Mary College Delhi (JMC), Gargi College Delhi (Gargi College), Delhi College of Arts and Commerce Delhi (DCAC), Christ University Bengaluru (Christ University), Narsee Monjee College of Commerce and Economics Mumbai (NM College), Mithibai College Mumbai (Mithibai College), Madras Christian College Chennai (MCC), Presidency University Kolkata (Presidency University), Symbiosis School for Liberal Arts Pune (SSLA), FLAME University Pune (FLAME University), Ashoka University Sonipat (Ashoka University)
Science / Research - National Institute of Science Education and Research Bhubaneswar (NISER), Chennai Mathematical Institute Chennai (CMI), Indian Institute of Science Education and Research Berhampur (IISER Berhampur), Indian Institute of Science Education and Research Tirupati (IISER Tirupati), Indian Institute of Science Education and Research Bhopal (IISER Bhopal), Indian Institute of Science Education and Research Thiruvananthapuram (IISER TVM), University of Hyderabad Hyderabad (UoH), Jawaharlal Nehru University New Delhi (JNU), Presidency University Kolkata (Presidency University), University of Delhi Science Departments (DU Science)
Law - National Law Institute University Bhopal (NLIU), National University of Study and Research in Law Ranchi (NUSRL), Hidayatullah National Law University Raipur (HNLU), Gujarat National Law University Gandhinagar (GNLU), National Law University Odisha Cuttack (NLUO), Rajiv Gandhi National University of Law Patiala (RGNUL)
Design - National Institute of Design Ahmedabad (NID Ahmedabad), National Institute of Design Gandhinagar (NID Gandhinagar), National Institute of Design Bengaluru (NID Bengaluru), MIT Institute of Design Pune (MIT ID), Srishti Manipal Institute of Art, Design and Technology Bengaluru (Srishti)
Economics-Focused - Delhi School of Economics Delhi (DSE), Madras School of Economics Chennai (MSE), Gokhale Institute of Politics and Economics Pune (GIPE), Ashoka University Sonipat (Ashoka University), St. Xavier's College Mumbai (St. Xavier's College), Presidency University Kolkata (Presidency University)`;
const TIER1_COMPANIES = `Razorpay, CRED, Zepto, Swiggy, Zomato, Meesho, Groww, PhonePe, Paytm, Flipkart, Freshworks, Zoho, Postman, BrowserStack, Setu, Slice, Jupiter, Juspay, Sarvam AI, ShareChat, Dream11, MPL, InMobi, Smallcase. Global: Google, Meta, Apple, Microsoft, Amazon, Netflix, Stripe, Airbnb, Uber, Lyft, Coinbase, Robinhood, Notion, Figma, Linear, Vercel, Databricks, Snowflake, Palantir, OpenAI, Anthropic, DeepMind, Waymo, SpaceX, Two Sigma, Jane Street, Citadel, Jump Trading, Bridgewater, Razorpay, CRED, Zepto, Swiggy, Zomato, Meesho, Groww, PhonePe, Paytm, Flipkart, Freshworks, Zoho, Postman, BrowserStack, Setu, Slice, Jupiter, Juspay, Sarvam AI, ShareChat, Dream11, MPL, Haptik, Yellow.ai, Smallcase, InMobi, Dailyhunt, Navi. Global: Google, Meta, Apple, Microsoft, Amazon, Netflix, Stripe, Airbnb, Uber, Lyft, Coinbase, Robinhood, Notion, Figma, Linear, Vercel, Databricks, Snowflake, Palantir, OpenAI, Anthropic, DeepMind, Waymo, SpaceX, Two Sigma, Jane Street, Citadel, Jump Trading, Bridgewater, McKinsey, BCG, Bain, SAP, Oracle, Salesforce, Workday, ServiceNow, Twilio, Zendesk, HubSpot, Atlassian`;
const TIER2_COMPANIES = `India: Infosys, Wipro, TCS, HCL, Tech Mahindra, Capgemini, Accenture India, Cognizant, Mphasis, Hexaware, Persistent, Coforge, Mindtree, KPIT, LTI. Global: Accenture, IBM, Deloitte, PwC, EY, KPMG`;
// ─────────────────────────────────────────────────────────────────────────────

const META_SYSTEM_PROMPT = `You are a senior hiring rubric engineer with 20+ years of experience
building evaluation frameworks across every role type — SWE, Sales, Analytics, Product,
Operations, Design, Finance, Marketing, and more. You have worked directly with HRs and
hiring managers at startups, unicorns, and public companies.

YOUR TASK:
Read a Job Description and produce exactly THREE artifacts as a single JSON object:
  1. extracted_params  — structured hiring criteria derived from the JD
  2. compressor_prompt — a resume parser prompt tailored to this specific role
  3. evaluator_prompt  — a complete, strict hiring rubric prompt for this role

==================================================
ARTIFACT 1 — extracted_params
==================================================
Derive EVERYTHING from the JD. Nothing is hardcoded. A sales JD and a SWE JD
produce completely different criteria.

Structure:
{
  "role_title": string,
  "role_family": string,          // e.g. "engineering", "sales", "analytics", "product", "operations"
  "seniority": string,            // "intern", "junior", "mid", "senior", "lead", "executive"
  "hard_requirements": [         // failing ANY of these = Reject
    {
      "what": string,             // the requirement
      "what_counts": string,      // concrete evidence that satisfies it
      "what_does_not_count": string  // looks like it satisfies but does not
    }
  ],
  "min_experience_months": number,
  "experience_type": "internship_ok" | "full_time_required" | "either",
  "domain": string | null,               // primary domain context from JD, e.g. "B2C fintech", "B2B SaaS", null if not mentioned
  "p0_signals": [string],                // what makes someone exceptional, not just good
  "p1_signals": [string],               // what makes someone clearly interview-worthy
  "red_flags": [string],                // push toward Reject even if baseline met
  "resume_signal_fields": [string],     // what to extract from the resume for this role
  "acceptable_gap_options": [string],   // 4-6 role-specific P1 acceptable gap scenarios
  "skills": [string]                    // actual technical skills, tools, languages, frameworks required or preferred by this role
                                        // e.g. for SWE: ["backend", "Java", "cloud", "devops", "system design", "React"]
                                        // e.g. for PM: ["roadmap prioritization", "data analysis", "SQL", "A/B testing", "Figma"]
                                        // e.g. for Analytics: ["SQL", "Python", "Tableau", "Excel", "statistics"]
                                        // DO NOT include soft skills or behavioral traits like "communication", "ownership", "impact" — those go in p0_signals/p1_signals
}

For acceptable_gap_options:
- Produce exactly 4-6 options derived from JD context and role_family
- Each option is a short phrase describing a realistic scenario where a strong
  candidate has ONE gap that still qualifies them for P1 consideration
- Must be specific to the role and role_family — not generic filler
- Examples for product roles: ["No PM internship but strong product projects",
  "Domain mismatch but strong product fundamentals", "Impact not quantified but clear ownership",
  "Short tenure at one place", "Tools missing but execution strong"]
- Examples for SWE roles: ["No production experience but strong open source",
  "Language mismatch but strong fundamentals", "Short stints",
  "Academic projects only but strong problem-solving", "No system design evidence"]
- Examples for sales roles: ["No quota ownership but strong BD experience",
  "Industry mismatch", "No CRM evidence", "Short tenures", "Impact not quantified"]
- Derive these from the actual JD context — not from templates

HARD REQUIREMENTS RULES:
- Only mark something as a hard requirement if the JD explicitly says "must have",
  "required", "mandatory", or equivalent. Vague terms like "good to have",
  "preferred", or "looking for" go into p1_signals instead.
- For every hard requirement, define what_counts vs what_does_not_count precisely.
  Example — JD says "SQL required" for an analyst role:
    what_counts: "SQL for analytics — joins, aggregations, KPIs, cohort analysis,
                  funnels, EDA, reporting. Must be evident in work descriptions."
    what_does_not_count: "SQL for app backends, CRUD operations, ORM usage,
                          schema design, or just listing MySQL/Postgres as a skill."
  Example — JD says "Python required" for a data role:
    what_counts: "Python for data wrangling, EDA, automation, analysis — pandas,
                  numpy, matplotlib evident in work context."
    what_does_not_count: "Python for web dev, Django/Flask, scripts unrelated to data."
  Example — JD says "sales experience" for a sales role:
    what_counts: "Owned quota, closed deals, managed pipeline, revenue or conversion
                  numbers stated explicitly."
    what_does_not_count: "Attended sales calls, exposure to sales, BD without outcomes."
- Seniority matters for experience floor:
    intern → 0 months floor
    junior/associate → 6-12 months
    mid → 12-24 months
    senior → 36+ months
    lead/executive → 60+ months
- Quantified achievements must be RELEVANT quantification.
  For SWE: "Reduced API latency by 40%" is relevant. "Managed 5 people" is not.
  For Sales: "Closed $2M ARR" is relevant. "Built a dashboard" is not.

==================================================
ARTIFACT 2 — compressor_prompt
==================================================
A prompt that converts a raw resume into a compact signal JSON for THIS role.
It extracts facts only — zero judgment. The evaluator will do the judging.
Target output: under 400 tokens.

The compressor_prompt must instruct the model to extract:
- name, email, phone, total_experience_months, internship_experience_months, fulltime_experience_months, education (degree, institution, year)
  internship_experience_months: sum of duration_months for any work_history entry whose role title contains "intern", "internship", "trainee", or "apprentice" (case-insensitive). fulltime_experience_months: total_experience_months minus internship_experience_months (minimum 0).
- work_history: [{company, role, duration_months, key_signals[], ownership_language, impact_evidence}]
  COLLEGE ACTIVITY EXCLUSION- BASICALLY STUDENTS WHO ARE WORKING IN CLUBS, SOCIETIES AND ALL(People employed in that college as a full time employee or intern is totally fine)— apply this test to every role before extracting it:
    "Could this organisation exist and operate without this college?"
    If NO → exclude entirely. Do not add to work_history or count toward any experience total.
    If YES → include as real experience.
    If UNCERTAIN → EXCLUDE

    ALWAYS EXCLUDE — college activities regardless of how they are written or titled:
    • Student clubs and societies: any org whose membership is primarily students from one institution — coding clubs, entrepreneurship cells, debate societies, cultural committees, photography clubs, music societies, drama clubs, sports committees, finance clubs, consulting clubs, product clubs, marketing societies.
    • Student chapter branches: student-run branches of external bodies — Google DSC, GDSC, Microsoft Learn Student Ambassador, GitHub Campus Expert, IEEE Student Branch, ACM Student Chapter, Meta Student Ambassador, AWS Cloud Club, CFA Society Student Chapter, Toastmasters Student Club.
    • College events and fests: Techfest, Mood Indigo, Saarang, Zeitgeist, Shaastra, Antaragni, college TEDx events, college hackathons, inter-college competitions organised by student bodies.
    • Social work mandated or facilitated by college: NSS, NCC, Rotaract College Chapter, any social initiative run through college infrastructure.
    • Campus ambassador programs: "Brand Ambassador, CoinDCX" — student programs, not employment.

    HOW RESUMES DISGUISE THESE — watch for all patterns:
    • Sounds like a job title: "Product Lead, Entrepreneurship Cell" or "CTO, Coding Club" — title sounds senior but org is student-run → exclude.
    • External body name used: "Google Developer Student Club — Tech Lead" or "Microsoft Student Partner" — sounds like Google/Microsoft hired them, they did not → exclude.
    • Removed the word "club": "Head of Technology, E-Cell IIT X" — E-Cell without "club" still means Entrepreneurship Cell → exclude.
    • Made it sound like a company: "Operations Lead, XYZ Student Consulting Group" — student consulting groups are clubs → exclude.
    • Festival made to sound like an event company: "Marketing Head, Zeitgeist 2024" or "Sponsorship Lead, Techfest" — college fests are not companies → exclude.

    ALWAYS INCLUDE — do not exclude these:
    • Named external company with no college affiliation, even if small or unknown.
    • Freelance work for external clients, even if found through college connections.
    • Paid internship at an external organisation, even if arranged through placement cell.
  key_signals = 2-4 specific verbatim facts from the resume, not summaries
  ownership_language = verbatim phrase showing ownership ("owned X", "led Y", "built Z end-to-end",
    "responsible for", etc.) — null if only passive language found ("helped", "assisted", etc.)
  impact_evidence = verbatim metric or outcome ("reduced latency by 40%", "used by 200 users",
    "saved 3 hrs/week") — null if no outcome or metric stated anywhere in this experience

- role_specific_signals: {fields derived from resume_signal_fields for this role}
- tools_and_skills: [list of tools/languages mentioned]
- red_flags_raw: [vague claims, name-drops without context, suspiciously short stints]

For intern/junior/fresher roles (seniority is intern, junior, or experience_type is internship_ok),
the compressor_prompt must ALSO extract:
- projects: array of {
    name: string,
    problem_solved: string,          // verbatim from resume — what problem, what users
    tech_used: string[],
    deployment_status: string,       // "live", "demo only", "local only", "not mentioned"
    link_evidence: string | null,    // any evidence of a link — check ALL of the following:
                                     // (a) raw URL anywhere near the project: https://..., github.com/...
                                     // (b) hyperlink anchor text in the description: "GitHub", "Live Demo",
                                     //     "View Project", "Demo", "Source Code", "Link", "[GitHub]"
                                     // (c) the PROJECT TITLE ITSELF may be hyperlinked — PDF parsers
                                     //     often render this as "Title (https://...)" or "Title [url]"
                                     //     or place the URL on the same line immediately after the title;
                                     //     check the line containing the project name for any URL
                                     // capture whatever is found verbatim; null only if truly nothing
    outcomes_or_metrics: string | null,  // verbatim numbers, user counts, improvements
    individual_contribution: string, // verbatim — what THEY did vs team
    iteration_evidence: string | null // v2, updates, improvements mentioned
  }
- has_any_deployed_project: boolean
- has_any_project_link: boolean      // true if ANY project has link_evidence (URL or hyperlink text)

EMBEDDED HYPERLINKS SECTION:
The resume text passed to the compressor may end with a block like:

  ---EMBEDDED HYPERLINKS---
  "Project Name" → https://github.com/user/repo
  "Live Demo" → https://myapp.vercel.app

This block contains URLs extracted directly from the PDF's hyperlink annotation layer —
these are real clickable links from the original PDF, not guessed text. They are the most
reliable source of link evidence available.

The compressor_prompt MUST include this instruction verbatim:
"If the resume text contains an ---EMBEDDED HYPERLINKS--- section, use it as the
authoritative source for links. For each entry, match the anchor text to the nearest
project name or label in the resume (project title, 'GitHub', 'Live Demo', etc.)
and use the corresponding URL as the link_evidence for that project. Prefer these
extracted URLs over any plain-text URLs in the resume body."

DATE RULE: The user message will begin with "Today's date: YYYY-MM-DD". Use this date
to calculate duration_months for any position whose end date is "Present", "Current",
"Now", "Ongoing", or has no end date. These are active roles — do NOT return null for them.

DURATION CALCULATION RULE: Both the start month and the end month are counted inclusively.
Formula: duration_months = (end_year - start_year) * 12 + (end_month - start_month) + 1
Example: May 2024 – Jun 2024 = 2 months (May and June both count).
Example: Jan 2024 – Dec 2024 = 12 months.
Example: Mar 2023 – Mar 2024 = 13 months.


Rules: extract only what is stated, never infer, duration_months from dates or null,
return only valid JSON, no markdown.

==================================================
FINAL OUTPUT FORMAT
==================================================
Return ONLY a valid JSON object with exactly two keys:
  "extracted_params", "compressor_prompt"
No markdown. No explanation. No preamble. Pure JSON only.`;

const buildMetaUserMessage = (jd: string, roleOverride?: string) => {
  let msg = `Here is the Job Description:\n\n${jd}`;
  if (roleOverride) {
    msg += `\n\nRole title override: ${roleOverride}`;
  }
  return msg;
};

router.post("/generate-jd", async (req: Request, res: Response) => {
  const { role_name, statement } = req.body as { role_name: string; statement: string };
  if (!role_name?.trim() || !statement?.trim()) {
    return res.status(400).json({ error: "role_name and statement are required." });
  }
  let client: OpenAI;
  try { client = getClient(); } catch (e: any) { return res.status(500).json({ error: e.message }); }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are a startup hiring manager writing a job description.
Given a role name and a casual description of what you're looking for (may be in Hinglish, broken English, or informal language), produce a clean, professional JD.

Rules:
- 5-8 concise bullet points
- Startup tone: direct, practical, zero corporate fluff
- Focus on real work, actual skills, hands-on ownership
- Preserve the exact intent of the informal input
- No generic filler like "strong communication skills" or "team player" unless explicitly mentioned
- Each bullet = one specific, meaningful requirement

Return ONLY the bullet points as plain text, each on a new line starting with "• ".
No title. No intro. No outro.`,
        },
        {
          role: "user",
          content: `Role: ${role_name}\n\nWhat I'm looking for: ${statement}`,
        },
      ],
    });
    trackCost("Generate JD", "Step 1 — Setup", "gpt-4.1-mini", completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0);
    const jd = completion.choices[0].message.content?.trim() ?? "";
    if (!jd) return res.status(500).json({ error: "Empty response from model" });
    return res.json({ jd });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "OpenAI API error" });
  }
});

router.post("/generate-prompt", async (req: Request, res: Response) => {
  const { jd, role_title_override } = req.body as {
    jd: string;
    role_title_override?: string;
  };

  if (!jd || jd.trim().length < 50) {
    return res.status(400).json({ error: "JD is required and must be at least 50 characters." });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: META_SYSTEM_PROMPT },
        { role: "user", content: buildMetaUserMessage(jd, role_title_override) },
      ],
      response_format: { type: "json_object" },
    });

    trackCost("Generate Criteria", "Step 1 — Setup", "gpt-4.1-mini", completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0);
    const raw = completion.choices[0].message.content ?? "";

    try {
      const parsed = JSON.parse(raw);
      // evaluator_prompt is intentionally not generated by META — built separately from criteria
      return res.json({ ...parsed, evaluator_prompt: "" });
    } catch {
      return res.status(500).json({ error: "Failed to parse model response as JSON", raw_response: raw });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "OpenAI API error" });
  }
});

router.post("/test-resume", async (req: Request, res: Response) => {
  const { compressor_prompt, evaluator_prompt, resume_text } = req.body as {
    compressor_prompt: string;
    evaluator_prompt: string;
    resume_text: string;
  };

  if (!compressor_prompt || !evaluator_prompt || !resume_text) {
    return res.status(400).json({ error: "compressor_prompt, evaluator_prompt, and resume_text are all required." });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  // Pass 1: Compress resume to signal JSON
  let signalJson: string;
  let signalParsed: unknown;
  try {
    const compressCompletion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: compressor_prompt },
        { role: "user", content: `Resume text (return extracted signals as JSON):\n\n${resume_text}` },
      ],
      response_format: { type: "json_object" },
    });

    signalJson = compressCompletion.choices[0].message.content ?? "";

    try {
      signalParsed = JSON.parse(signalJson);
    } catch {
      return res.status(500).json({
        error: "Compressor returned invalid JSON",
        raw_response: signalJson,
      });
    }
  } catch (e: any) {
    return res.status(500).json({ error: `Compressor call failed: ${e.message}` });
  }

  // Pass 2: Evaluate signal JSON
  try {
    const evalCompletion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: evaluator_prompt },
        {
          role: "user",
          content: `Candidate signal JSON:\n\n${JSON.stringify(signalParsed)}\n\nReturn your evaluation as JSON.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const evalRaw = evalCompletion.choices[0].message.content ?? "";

    try {
      const ratingResult = JSON.parse(evalRaw);
      return res.json({ signal_json: signalParsed, rating_result: ratingResult });
    } catch {
      return res.status(500).json({
        error: "Evaluator returned invalid JSON",
        signal_json: signalParsed,
        raw_response: evalRaw,
      });
    }
  } catch (e: any) {
    return res.status(500).json({ error: `Evaluator call failed: ${e.message}` });
  }
});

const PARSE_EVALUATOR_SYSTEM_PROMPT = `You are reading an evaluator prompt written for a structured hiring rubric system. Your job is to extract the structured parameters embedded in that prompt.

Return ONLY a valid JSON object matching this exact schema — no markdown, no explanation:
{
  "role_title": string,
  "role_family": "engineering" | "sales" | "analytics" | "product" | "operations" | "design" | "other",
  "hard_requirements": [
    {
      "what": string,
      "what_counts": string,
      "what_does_not_count": string
    }
  ],
  "min_experience_months": number,
  "experience_type": "internship_ok" | "full_time_required" | "either",
  "p0_signals": string[],
  "red_flags": string[],
  "resume_signal_fields": string[]
}

Derive min_experience_months from any experience language in the prompt (e.g. "1+ year" = 12, "6 months" = 6, "fresher ok" = 0). If unclear, use 0.
Derive resume_signal_fields from the role context and hard requirements — these are the field names the compressor should extract for this role.`;

router.post("/parse-evaluator-prompt", async (req: Request, res: Response) => {
  const { evaluator_prompt } = req.body as { evaluator_prompt: string };

  if (!evaluator_prompt || evaluator_prompt.trim().length < 50) {
    return res.status(400).json({ error: "evaluator_prompt is required." });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: PARSE_EVALUATOR_SYSTEM_PROMPT },
        { role: "user", content: `Extract the structured parameters from this evaluator prompt:\n\n${evaluator_prompt}` },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content ?? "";
    try {
      const parsed = JSON.parse(raw);
      return res.json({ extracted_params: parsed });
    } catch {
      return res.status(500).json({ error: "Failed to parse model response", raw_response: raw });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "OpenAI API error" });
  }
});

const REFINE_SYSTEM_PROMPT = `You are a hiring rubric engineer. You will receive an existing evaluator prompt and a set of parameter changes made by an HR. Rewrite the evaluator prompt to reflect these changes precisely.

Rules:
- Do not change the overall structure, section headers, or tone of the prompt
- Only update the specific parts that the parameter changes affect
- If a toggle field has enabled: false, remove that criterion from the prompt entirely
- If a toggle field has enabled: true, add the criterion in the appropriate section
- Plain English values from the HR are valid — interpret them correctly and embed them naturally
- Return ONLY the updated evaluator prompt as a plain string
- No JSON wrapper. No markdown fences. No explanation. Just the prompt text.
- The output must be ready to use as a system prompt verbatim`;

router.post("/refine-prompt", async (req: Request, res: Response) => {
  const { evaluator_prompt, parameter_changes } = req.body as {
    evaluator_prompt: string;
    parameter_changes: object;
  };

  if (!evaluator_prompt || !parameter_changes) {
    return res.status(400).json({ error: "evaluator_prompt and parameter_changes are required.", evaluator_prompt });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message, evaluator_prompt });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: REFINE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Existing evaluator prompt:\n${evaluator_prompt}\n\nParameter changes:\n${JSON.stringify(parameter_changes, null, 2)}\n\nRewrite the evaluator prompt to reflect these changes.`,
        },
      ],
    });

    const refined = completion.choices[0].message.content?.trim() ?? "";
    if (!refined) {
      return res.status(500).json({ error: "Empty response from model", evaluator_prompt });
    }
    return res.json({ evaluator_prompt: refined });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "OpenAI API error", evaluator_prompt });
  }
});

const BUILD_FROM_CRITERIA_PROMPT = `You are a hiring rubric engineer. Your job is to write a complete, structured evaluator prompt from scratch based on the hiring manager's criteria inputs.

When the criteria include free-text fields, interpret them as follows:
- "p0_text": the hiring manager's natural-language description of what makes an exceptional P0 candidate. Use this to populate the ------P0 CRITERIA------ section.
- "p1_text": the hiring manager's description of the interview-worthy bar. Use this to populate the ------P1 CRITERIA------ section.
- "dealbreakers": the hiring manager's description of hard disqualifiers. Use this to populate ------HARD REQUIREMENTS------ and ------RED FLAGS------.
- "skills": array of relevant skills. Strong match = P0 signal; partial match = P1 signal; complete absence of required skills = Reject trigger if they appear in dealbreakers.
- "seniority" and "min_experience_months": use to set the ------FULL-TIME EXPERIENCE BAR------.


The evaluator prompt you produce will be used by an AI to score resumes as P0 (exceptional), P1 (interview-worthy), or Reject.

Output format rules:
- Use section headers formatted as: ------SECTION NAME------
- Use numbered lists for criteria (1. 2. 3.)
- Use bullet points for sub-points
- Bold key phrases using **asterisks**
- Mark decisions as [P0], [P1], or [Reject] in square brackets
- Include a final section: ------EVALUATION OUTPUT FORMAT------

Required sections to produce:
1. ------ROLE CONTEXT------
2. ------COMPRESSOR INSTRUCTIONS------  (how to extract signals from resume text — write as bullet points, one signal type per bullet, NOT as a paragraph)
3. ------EVALUATOR INSTRUCTIONS------  (how to score the signals — write as bullet points, one scoring rule per bullet, NOT as a paragraph)
4. ------HARD REQUIREMENTS------  (if any field is missing, auto-reject)
   Derive hard requirements from the dealbreakers field. Write each requirement as a short, direct rule — no "What / What counts / What does not count" breakdown. One line per requirement.- EXACTLY BASED ON WHAT THE USER TYPES IN IN THE DEALBREAKERS BOX
5. ------FULL-TIME EXPERIENCE BAR------  (minimum **full-time** work experience thresholds — internships and part-time do not count unless explicitly noted)
8. ------SIGNAL QUALITY------  (how to interpret vague or thin resumes)
9. ------P0 CRITERIA — EXCEPTIONAL------  (reproduce the hiring manager's p0_text faithfully — do NOT add "ALL of these", "any of these", or any threshold modifier. Present the criteria exactly as written.)
10. ------P1 CRITERIA — INTERVIEW WORTHY------  (reproduce the hiring manager's p1_text faithfully — do NOT add "ALL of these", "any of these", or any threshold modifier. Present the criteria exactly as written.)
11. ------RED FLAGS------  (these push toward Reject)
  ADJACENT ROLES subsection: Include ONLY IF adjacent_roles_policy is present in the criteria. If absent, omit this subsection entirely — do NOT write "N/A".
  When adjacent_roles_policy is present, derive the adjacent role list dynamically from the role title. Examples:
  - "Product Manager" → adjacent: Product Analyst, Product Designer, UX Researcher, Business Analyst, Program Manager, Project Manager, Product Marketing Manager
  - "Data Analyst" → adjacent: Data Engineer, Data Scientist, ML Engineer, Business Intelligence Developer, Database Administrator
  - "Software Engineer (Backend)" → adjacent: Frontend Engineer, QA Engineer, DevOps Engineer, Data Engineer, Solutions Engineer
  - "Sales" → adjacent: Marketing, Account Management (no quota), Customer Success
  Apply adjacent_roles_policy instruction exactly: "Candidates whose primary background is in adjacent roles (e.g., [derived list]) with zero direct [role_title] experience must be [REJECTED per policy / flagged as concern per policy]."

  OVERQUALIFICATION subsection: Include ONLY IF any of these policy fields are present: seniority_mismatch_policy, experience_surplus_policy. If NEITHER is present, omit this subsection entirely — do NOT write "N/A".
  Include only the sub-items whose policy field is present; apply each field's instruction exactly:
  (1) SENIORITY MISMATCH — include only if seniority_mismatch_policy is present. Use its value verbatim as the rejection rule.
  (2) **FULL-TIME** EXPERIENCE SURPLUS — include only if experience_surplus_policy is present. Use the exact threshold from experience_surplus_policy verbatim — do not substitute or paraphrase the years/months value. This counts full-time experience only.
12. ------SCORING RUBRIC------  (decision tree: when to assign P0 vs P1 vs Reject)
13. ------EVALUATION OUTPUT FORMAT------

The ------EVALUATION OUTPUT FORMAT------ section MUST contain exactly this instruction verbatim:

"""
Return a JSON object with these exact keys:
{
  "rating": "P0" | "P1" | "Reject",
  "score": integer 0-100 (overall fit),
  "reject_reason": string or null (required for Reject; single sentence why they fail),
  "reasoning": [array of strings — 2-3 bullet points, each a single short phrase (max 12 words), explaining the decision],
  "concerns": [array of strings — 1-2 short phrases (max 10 words each); empty array if none]
}

reasoning is REQUIRED for every candidate — never return an empty array. Each bullet must be a tight phrase, not a sentence. No filler, no repetition. Focus on the single most decisive signal per bullet.
"""

When weightage_order is provided in the criteria, each item has an importance level. Use this to build the SCORING RUBRIC and P0/P1/Reject decision logic in the generated prompt:
- importance "must_have": The generated prompt must treat this as non-negotiable. A candidate who clearly does not demonstrate this criterion must be rated Reject, regardless of other strengths.
- importance "should_have": The generated prompt must treat this as an important differentiator. Strong evidence → lean P0; weak evidence → lean P1. Absence alone does NOT justify a Reject.
- importance "nice_to_have": The generated prompt must treat this as a bonus signal only. Missing it cannot push a P1 to Reject. It is only used to distinguish P0 from P1.

Encode these thresholds explicitly in the SCORING RUBRIC section of the generated prompt:

- Reject trigger: any "must_have" criterion is clearly not demonstrated. Hard requirements must be met for P0 or P1 to even be considered.
- P1 threshold: all hard requirements met + candidate demonstrates the P1 criteria as written by the hiring manager.
- P0 threshold: all hard requirements met + candidate demonstrates the P0 criteria as written by the hiring manager.
- Do NOT invent "ALL of these" or "any of these" logic on top of what the hiring manager wrote. The P0 and P1 criteria sections are the hiring manager's own words — evaluate against them as written.

When non_work_weight is provided in the criteria, add a rule in the SIGNAL QUALITY or SCORING RUBRIC section of the generated prompt that applies to any entries flagged as non_work_entries (courses, bootcamps, fellowships, career breaks, research programs):
- "ignore": Do not count these toward experience at all. If a candidate's only experience is non-work entries, treat them as having zero work experience.
- "weak_signal": Shows interest/initiative but does not count toward experience bar. Cannot satisfy any experience requirement.
- "partial": Count as approximately 50% of equivalent real work experience. Can partially satisfy experience requirements but not fully.
- "full": Count as equivalent to real work experience.
The generated prompt must also instruct the evaluator to always note in reasoning when non_work_entries are present and how they were weighted.

When education_pedigree is provided and is not "no_preference", the value already contains the full institution list as a pre-formatted hard requirement string. Copy it verbatim into the ------HARD REQUIREMENTS------ section. Do NOT paraphrase, truncate, or reference the field name — paste the exact string as-is.

When company_pedigree is provided and is not "no_preference", the value already contains the full company list as a pre-formatted hard requirement string. Copy it verbatim into the ------HARD REQUIREMENTS------ section. Do NOT paraphrase, truncate, or reference the field name — paste the exact string as-is.

When pedigree_edu_hard_requirement is provided, copy it verbatim into the ------HARD REQUIREMENTS------ section. Do NOT place it in P0 or P1 criteria.

When pedigree_comp_hard_requirement is provided, copy it verbatim into the ------HARD REQUIREMENTS------ section. Do NOT place it in P0 or P1 criteria.

When pedigree_edu_p0_differentiator is provided, copy it verbatim into the ------P0 CRITERIA------ section ONLY. This is explicitly NOT a hard requirement — do NOT place it in ------HARD REQUIREMENTS------. A candidate who fails this criterion should be rated P1, not Reject.

When pedigree_comp_p0_differentiator is provided, copy it verbatim into the ------P0 CRITERIA------ section ONLY. This is explicitly NOT a hard requirement — do NOT place it in ------HARD REQUIREMENTS------. A candidate who fails this criterion should be rated P1, not Reject.

Rules:
- Generate the full prompt from ONLY the hiring manager's criteria inputs provided
- Do not invent criteria not specified by the hiring manager
- If a field is empty, skip that criterion or use sensible minimal defaults
- Write in clear, directive English — this is an instruction to an AI, not a document for humans
- NEVER write "N/A" for any subsection — if a subsection condition is not met, omit it entirely with no placeholder
- Return ONLY the evaluator prompt text. No JSON, no markdown fences, no explanation.`;

router.post("/build-evaluator-prompt", async (req: Request, res: Response) => {
  const { criteria } = req.body as { criteria: Record<string, any> };

  if (!criteria) {
    return res.status(400).json({ error: "criteria is required." });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  // Expand pedigree arrays into explicit college/company lists for the LLM.
  // Per-section pedigree (p0_*/p1_*) takes precedence over legacy global fields.
  // P1 pedigree = hard reject floor (must be met to qualify for P1 or P0).
  // P0 pedigree = additional P0-only bar (failing it caps the rating at P1).
  const expandedCriteria = { ...criteria };

  const toArr = (v: any): string[] => Array.isArray(v) ? v : (v ? [v] : ["no_preference"]);
  const hasPerSection = !!(criteria.p1_education_pedigree || criteria.p0_education_pedigree || criteria.p1_company_pedigree || criteria.p0_company_pedigree);

  if (hasPerSection) {
    // Rule: if P0 and P1 have the SAME non-"any" tier chosen → global HARD REQUIREMENT (Reject if not met).
    // Otherwise each goes into its respective criteria text only (P0 clause in p0_text, P1 clause in p1_text).
    const effectiveTier = (arr: string[]): "tier_1" | "tier_2" | null =>
      arr.includes("tier_1") ? "tier_1" : arr.includes("tier_2") ? "tier_2" : null;

    const p0EduTier = effectiveTier(toArr(criteria.p0_education_pedigree));
    const p1EduTier = effectiveTier(toArr(criteria.p1_education_pedigree));
    const p0CompTier = effectiveTier(toArr(criteria.p0_company_pedigree));
    const p1CompTier = effectiveTier(toArr(criteria.p1_company_pedigree));

    const EDU_CLAUSE = (tier: "tier_1" | "tier_2") =>
      tier === "tier_1" ? TIER1_COLLEGES : TIER2_COLLEGES;
    const COMP_CLAUSE = (tier: "tier_1" | "tier_2") =>
      tier === "tier_1" ? TIER1_COMPANIES : TIER2_COMPANIES;

    // Helper: append pedigree hard-requirement clauses to dealbreakers so GPT's
    // existing dealbreakers → HARD REQUIREMENTS pipeline handles them reliably.
    // (Using a separate field + verbatim-copy instruction failed for large tier lists.)
    const appendToDealbreakers = (clause: string) => {
      const existing = expandedCriteria.dealbreakers;
      expandedCriteria.dealbreakers = existing ? `${existing}\n${clause}` : clause;
    };

    // ── Education pedigree ────────────────────────────────────────────────────
    expandedCriteria.education_pedigree = "no_preference";
    if (p0EduTier && p1EduTier && p0EduTier === p1EduTier) {
      // Same tier on both → hard reject floor for everyone
      appendToDealbreakers(`Hard requirement (education): candidate's atleast one formal education degree (Bachelor's or above — B.Tech/B.E./B.S./B.Com/BBA/BA/MBBS/LLB/B.Arch, Master's, or PhD qualify; online certifications, diplomas, or short courses do NOT count) must be from one of: ${EDU_CLAUSE(p0EduTier)}. Candidates who do not meet this are rated Reject.`);
    } else {
      if (p1EduTier) {
        appendToDealbreakers(`Hard requirement (education): candidate's atleast one formal education degree (Bachelor's or above — B.Tech/B.E./B.S./B.Com/BBA/BA/MBBS/LLB/B.Arch, Master's, or PhD qualify; online certifications, diplomas, or short courses do NOT count) must be from one of: ${EDU_CLAUSE(p1EduTier)}. Candidates who do not meet this are rated Reject.`);
      }
      if (p0EduTier) {
        expandedCriteria.pedigree_edu_p0_differentiator = `For P0 only (not a hard requirement — failing this caps the rating at P1, not Reject): candidate's atleast one formal education degree (Bachelor's or above — B.Tech/B.E./B.S./B.Com/BBA/BA/MBBS/LLB/B.Arch, Master's, or PhD qualify; online certifications, diplomas, or short courses from these institutions do NOT count) must be from one of: ${EDU_CLAUSE(p0EduTier)}. A candidate who meets all other P0 criteria but lacks this educational background should be rated P1 instead of P0.`;
      }
    }
    delete expandedCriteria.p0_education_pedigree;
    delete expandedCriteria.p1_education_pedigree;

    // ── Company pedigree ──────────────────────────────────────────────────────
    expandedCriteria.company_pedigree = "no_preference";
    if (p0CompTier && p1CompTier && p0CompTier === p1CompTier) {
      // Same tier on both → hard reject floor for everyone
      appendToDealbreakers(`Hard requirement (company): candidate must have prior full-time work experience at one of: ${COMP_CLAUSE(p0CompTier)}. Candidates without this are rated Reject.`);
    } else {
      if (p1CompTier) {
        appendToDealbreakers(`Hard requirement (company): candidate must have prior full-time work experience at one of: ${COMP_CLAUSE(p1CompTier)}. Candidates without this are rated Reject.`);
      }
      if (p0CompTier) {
        expandedCriteria.pedigree_comp_p0_differentiator = `For P0 only (not a hard requirement — failing this caps the rating at P1, not Reject): candidate must have prior full-time work experience at one of: ${COMP_CLAUSE(p0CompTier)}. A candidate who meets all other P0 criteria but lacks this company background should be rated P1 instead of P0.`;
      }
    }
    delete expandedCriteria.p0_company_pedigree;
    delete expandedCriteria.p1_company_pedigree;
  } else {
    // Legacy global pedigree fallback
    const eduPed = toArr(criteria.education_pedigree);
    const compPed = toArr(criteria.company_pedigree);
    if (!eduPed.includes("no_preference") && eduPed.length > 0) {
      const parts: string[] = [];
      if (eduPed.includes("tier_1")) parts.push(TIER1_COLLEGES);
      if (eduPed.includes("tier_2")) parts.push(TIER2_COLLEGES);
      expandedCriteria.education_pedigree = `Hard requirement — candidate's EITHER bachelor's OR master's degree must be from one of the following institutions (having BOTH also qualifies): ${parts.join(" or ")}. Candidates whose bachelor's AND master's degrees are both NOT from any institution on this list must be rated Reject.`;
    } else {
      expandedCriteria.education_pedigree = "no_preference";
    }
    if (!compPed.includes("no_preference") && compPed.length > 0) {
      const parts: string[] = [];
      if (compPed.includes("tier_1")) parts.push(TIER1_COMPANIES);
      if (compPed.includes("tier_2")) parts.push(TIER2_COMPANIES);
      expandedCriteria.company_pedigree = `Hard requirement — candidate must have prior experience at: ${parts.join(" or ")}. Candidates without any experience at any of these companies must be rated Reject.`;
    } else {
      expandedCriteria.company_pedigree = "no_preference";
    }
  }

  // Transform role-context policy fields: "ignore"/undefined → delete; others → human-readable strings for the LLM
  if (!expandedCriteria.adjacent_roles_policy || expandedCriteria.adjacent_roles_policy === "ignore") {
    delete expandedCriteria.adjacent_roles_policy;
  } else if (expandedCriteria.adjacent_roles_policy === "strict_reject") {
    expandedCriteria.adjacent_roles_policy = "REJECT candidates whose primary background is in adjacent roles with zero direct experience in the target role";
  }

  if (!expandedCriteria.seniority_mismatch_policy || expandedCriteria.seniority_mismatch_policy === "ignore") {
    delete expandedCriteria.seniority_mismatch_policy;
  } else if (expandedCriteria.seniority_mismatch_policy === "reject_overqualified") {
    const isIntern = (expandedCriteria.seniority ?? "").toLowerCase() === "intern";
    expandedCriteria.seniority_mismatch_policy = isIntern
      ? `REJECT: candidate has prior full-time work experience (i.e. any role whose title does NOT contain "intern", "internship", "trainee", or "apprentice" — case-insensitive). These candidates are likely to leave within 6 months and must be rated Reject. EXCEPTION: if the full-time role was Co-founder or Founder of a startup that was clearly started during the candidate's college years (i.e. the role dates overlap with or begin before the candidate has graduated, suggesting a student-era side venture that is likely defunct), disregard that role for this check and evaluate the candidate normally for the intern position.`
      : "REJECT: most recent title is 2+ levels above the target role seniority";
  }

  if (!expandedCriteria.experience_surplus_policy || expandedCriteria.experience_surplus_policy === "ignore") {
    delete expandedCriteria.experience_surplus_policy;
  } else if (expandedCriteria.experience_surplus_policy.startsWith("reject_over_")) {
    const years = parseInt(expandedCriteria.experience_surplus_policy.replace("reject_over_", ""), 10);
    if (!isNaN(years) && years > 0) {
      expandedCriteria.experience_surplus_policy = `REJECT: total **full-time** experience exceeds ${years} year${years === 1 ? "" : "s"} (${years * 12} months) — indicates level mismatch for this role`;
    } else {
      delete expandedCriteria.experience_surplus_policy;
    }
  } else if (expandedCriteria.experience_surplus_policy === "reject_overexperienced") {
    expandedCriteria.experience_surplus_policy = "REJECT: total **full-time** experience significantly exceeds the role's expected level";
  }

  const EXCLUDE_FIELDS = new Set(["skills_suggestions"]);
  const criteriaText = Object.entries(expandedCriteria)
    .filter(([k, v]) => !EXCLUDE_FIELDS.has(k) && v !== "" && v !== null && v !== undefined && v !== false && v !== "no_preference")
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: BUILD_FROM_CRITERIA_PROMPT },
        {
          role: "user",
          content: `Build a complete evaluator prompt from these hiring manager criteria:\n\n${criteriaText}`,
        },
      ],
    });

    trackCost("Build Evaluator Prompt", "Step 1 — Setup", "gpt-4.1-mini", completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0);
    const built = completion.choices[0].message.content?.trim() ?? "";
    if (!built) {
      return res.status(500).json({ error: "Empty response from model" });
    }
    return res.json({ evaluator_prompt: built });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "OpenAI API error" });
  }
});

const COMPRESS_SYSTEM_PROMPT = `You are a hiring criteria summarizer helping a hiring manager quickly review an evaluator prompt.

Given a detailed AI evaluator prompt for a role, extract a condensed summary that shows the hiring manager exactly what the AI will look for — without the boilerplate, repeated instructions, or generic frameworks.

Rules:
- Group related points together into one clear statement instead of listing them separately. For example: "No deployment, no testing, no API integration evidence" instead of three separate bullets.
- Drop generic instructions that apply to every role (ownership definitions, scoring mechanics, anti-bias rules, output format instructions, experience weighting theory). Only keep role-specific criteria.
- Keep anything the hiring manager explicitly added or customized — specific thresholds, domain requirements, pedigree preferences, non-work-experience weights.
- Each item max 20 words. Be concise but complete — don't lose meaning by over-abbreviating.
- Preserve specific numbers, tools, thresholds, and named conditions.

Return ONLY valid JSON with these exact keys:
{
  "must_have": [string],     // Hard requirements — missing any = auto-reject
  "p0": [string],            // What makes someone a Strong Hire
  "p1": [string],            // What makes someone Interview Worthy
  "reject": [string],        // Signals that push toward Reject
  "background": [string]     // Education, company, domain preferences (if any)
}

Each array may be empty if there is nothing role-specific to show. Do not add items just to fill an array.`;

router.post("/compress-eval-prompt", async (req: Request, res: Response) => {
  const { evaluator_prompt } = req.body as { evaluator_prompt: string };

  if (!evaluator_prompt || evaluator_prompt.trim().length < 50) {
    return res.status(400).json({ error: "evaluator_prompt is required." });
  }

  let client: OpenAI;
  try {
    client = getClient();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: COMPRESS_SYSTEM_PROMPT },
        { role: "user", content: evaluator_prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0,
    });

    trackCost("Compress Eval Prompt", "Step 1 — Setup", "gpt-4.1-mini", completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0);
    const raw = completion.choices[0].message.content ?? "{}";
    try {
      const parsed = JSON.parse(raw);
      return res.json(parsed);
    } catch {
      return res.status(500).json({ error: "Failed to parse compressed view" });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "OpenAI API error" });
  }
});

export { router as generatePromptRouter };
