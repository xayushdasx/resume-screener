export interface HardRequirement {
  what: string;
  what_counts: string;
  what_does_not_count: string;
}

export interface ScoringParam {
  id: string;
  name: string;
  weight: number;
  score_10_description: string;
  score_5_description: string;
  score_0_description: string;
}

export interface ExtractedParams {
  role_title: string;
  role_family:
    | "engineering"
    | "sales"
    | "analytics"
    | "product"
    | "operations"
    | "design"
    | "other";
  seniority?: string;
  hard_requirements: HardRequirement[];
  min_experience_months: number;
  experience_type: "internship_ok" | "full_time_required" | "either";
  p0_signals: string[];
  p1_signals?: string[];
  red_flags: string[];
  resume_signal_fields: string[];
  domain?: string;
  acceptable_gap_options?: string[];
}

export interface GeneratePromptResponse {
  extracted_params: ExtractedParams;
  compressor_prompt: string;
  evaluator_prompt: string;
  scoring_params?: ScoringParam[];
  scorer_prompt?: string;
  error?: string;
  raw_response?: string;
}

export interface RatingResult {
  rating: "P0" | "P1" | "Reject";
  score?: number;
  reasoning: string[];
  reject_reason: string | null;
  concerns: string[];
}

export interface TestResumeResponse {
  signal_json: unknown;
  rating_result: RatingResult;
  error?: string;
  raw_response?: string;
}
