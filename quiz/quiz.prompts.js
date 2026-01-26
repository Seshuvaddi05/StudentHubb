function buildDifficultyText(pattern) {
  if (!pattern) {
    return `
Difficulty distribution (STRICT):
- 10 easy
- 10 medium
- 10 hard
`;
  }

  return `
Difficulty distribution (STRICT):
- ${pattern.easy} easy
- ${pattern.medium} medium
- ${pattern.hard} hard

IMPORTANT:
- Total questions MUST equal 30
- Sum of all difficulties MUST equal 30
`;
}

const BASE_RULES = `
RULES (MUST FOLLOW ALL):
- Output MUST be a pure JSON ARRAY
- Array length MUST be EXACTLY 30
- NO markdown
- NO explanations
- NO text before or after JSON
- NO wrapping objects

Each array item MUST contain:
- question: string
- options: array of EXACTLY 4 strings
- answer: string (must exactly match one option)
- difficulty: "easy" | "medium" | "hard"

CRITICAL:
- Do NOT generate more or less than 30 questions
- Do NOT repeat questions
- Do NOT omit any field
`;

function quantitativePrompt(pattern) {
  return `
You are an exam question generator.

Generate Quantitative Aptitude MCQs.

${buildDifficultyText(pattern)}

${BASE_RULES}
`;
}

function reasoningPrompt(pattern) {
  return `
You are an exam question generator.

Generate General Reasoning MCQs.

${buildDifficultyText(pattern)}

${BASE_RULES}
`;
}

function gkPrompt(pattern) {
  return `
You are an exam question generator.

Generate General Knowledge MCQs.

${buildDifficultyText(pattern)}

${BASE_RULES}
`;
}

function currentAffairsPrompt(pattern) {
  return `
You are an exam question generator.

Generate Current Affairs MCQs from the last 12 months (India + World).

${buildDifficultyText(pattern)}

${BASE_RULES}
`;
}

function programmingPrompt(language, pattern) {
  return `
You are an exam question generator.

Generate ${language} programming MCQs.

${buildDifficultyText(pattern)}

${BASE_RULES}
`;
}

module.exports = {
  quantitativePrompt,
  reasoningPrompt,
  gkPrompt,
  currentAffairsPrompt,
  programmingPrompt,
};
