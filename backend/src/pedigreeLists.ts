export const TIER_1_COLLEGES = [
  "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kanpur", "IIT Kharagpur", "IIT Roorkee",
  "IIT Guwahati", "IIT Hyderabad", "IIT BHU", "IIT Indore", "DTU", "NSUT", "NIT Trichy",
  "NIT Surathkal", "NIT Warangal", "BITS Pilani", "BITS Goa", "BITS Hyderabad",
  "IIIT Hyderabad", "IIIT Bangalore", "SRCC", "Hindu College", "St. Stephens", "IIM",
  "ISB", "NLSIU", "Ashoka University", "MIT", "Stanford", "Carnegie Mellon",
  "UC Berkeley", "Harvard", "Oxford", "Cambridge", "Imperial College London",
  "ETH Zurich", "NUS", "NTU", "University of Waterloo", "Georgia Tech", "Caltech",
  "Columbia", "Cornell", "Yale", "Princeton", "University of Michigan",
  "University of Edinburgh",
];

export const TIER_2_COLLEGES = [
  "NIT (all other campuses)", "IIIT (all other campuses)", "VIT Vellore", "Manipal",
  "SRM", "PSG Tech", "Thapar", "DAIICT", "IIIT Allahabad", "KIIT", "Symbiosis",
  "Christ", "NMIMS", "KJ Somaiya", "Amity", "Jadavpur", "Anna University colleges",
  "PES", "MS Ramaiah", "RV College", "BMS College", "UBC", "Melbourne", "Sydney",
  "King's College London", "Manchester", "Glasgow", "Trinity Dublin", "Seoul National",
  "KAIST", "TU Munich", "Delft", "Amsterdam", "McGill", "Queen's",
];

export const TIER_1_COMPANIES = [
  "Razorpay", "CRED", "Zepto", "Swiggy", "Zomato", "Meesho", "Groww", "PhonePe",
  "Paytm", "Flipkart", "Freshworks", "Zoho", "Postman", "BrowserStack", "Setu",
  "Slice", "Jupiter", "Juspay", "Sarvam AI", "ShareChat", "Dream11", "MPL", "Haptik",
  "Yellow.ai", "Smallcase", "InMobi", "Dailyhunt", "Navi", "Google", "Meta", "Apple",
  "Microsoft", "Amazon", "Netflix", "Stripe", "Airbnb", "Uber", "Lyft", "Coinbase",
  "Robinhood", "Notion", "Figma", "Linear", "Vercel", "Databricks", "Snowflake",
  "Palantir", "OpenAI", "Anthropic", "DeepMind", "Waymo", "SpaceX", "Two Sigma",
  "Jane Street", "Citadel", "Jump Trading", "Bridgewater",
];

export function formatPedigreeContext(): string {
  return `
PEDIGREE REFERENCE (extract these fields for every resume):
TIER 1 COLLEGES — ${TIER_1_COLLEGES.join(", ")}.
TIER 2 COLLEGES — ${TIER_2_COLLEGES.join(", ")}.
TIER 1 COMPANIES — ${TIER_1_COMPANIES.join(", ")}.
`;
}
