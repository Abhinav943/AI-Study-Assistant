import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function readEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

function getKey(name) {
  const env = readEnv();
  return (env[name] || process.env[name] || "").trim();
}

async function callAI(prompt, geminiKey, groqKey) {
  const geminiModels = [
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-pro-latest",
  ];

  let text = null;
  let lastError = null;

  if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
    const genAI = new GoogleGenerativeAI(geminiKey);
    for (const modelName of geminiModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: "application/json" },
        });
        const result = await model.generateContent(prompt);
        text = result.response.text();
        break;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (!text && groqKey && groqKey !== "your_groq_api_key_here") {
    const groq = new OpenAI({
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const groqModels = [
      "llama-3.1-70b-versatile",
      "llama-3.1-8b-instant",
      "gemma2-9b-it",
    ];

    for (const modelName of groqModels) {
      try {
        const completion = await groq.chat.completions.create({
          model: modelName,
          messages: [
            {
              role: "system",
              content:
                "You are a study assistant. Always respond with valid JSON only. No markdown code blocks, no extra text.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
        });
        text = completion.choices[0]?.message?.content || "";
        break;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (!text)
    throw (
      lastError || new Error("All AI providers failed. Please try again later.")
    );
  return text;
}

function parseAIJson(raw) {
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned);
}
app.post("/api/generate", async (req, res) => {
  const geminiKey = getKey("GEMINI_API_KEY");
  const groqKey = getKey("GROQ_API_KEY");

  if (!geminiKey && !groqKey) {
    return res.status(500).json({ error: "No AI API key configured." });
  }

  const {
    notes,
    mode = "flashcard",
    count = 5,
    quizType = "single",
  } = req.body;
  if (!notes?.trim())
    return res.status(400).json({ error: "Notes cannot be empty." });

  let prompt = "";

  if (mode === "flashcard") {
    prompt = `
You are an expert study assistant. Create exactly ${count} study flashcards from the notes below.

IMPORTANT RULES:
- "fact" is a clear, self-contained piece of information shown on the FRONT of the card. Be detailed.
- "question" is a multiple-choice question that tests comprehension of THAT specific fact.
- "options" is an array of exactly 4 answer choices.
- "answer" must EXACTLY match one of the options strings.
- "explanation" must give a clear, step-by-step solution. For math/science, show all working steps. Use LaTeX notation ($...$) for equations.

Return ONLY a JSON array (no markdown). Schema:
[{ "fact": string, "question": string, "options": [string,string,string,string], "answer": string, "explanation": string }]

Notes:
"""
${notes}
"""`;
  } else {
    let typeRules = "";
    if (quizType === "single") {
      typeRules =
        'Exactly 4 options, exactly 1 correct answer. "correctAnswers" is an array of 1 string matching an option exactly.';
    } else if (quizType === "multi") {
      typeRules =
        'Exactly 4 options, 1–3 correct answers. "correctAnswers" is an array of strings each matching an option exactly.';
    } else {
      typeRules =
        '"options" must be an empty array []. "correctAnswers" is an array of acceptable typed-answer variations (case-insensitive).';
    }

    prompt = `
You are an expert study assistant. Create exactly ${count} quiz questions from the notes below.
Type: ${quizType}. Rules: ${typeRules}

For math/science: use LaTeX notation ($...$) for equations. "explanation" must be a step-by-step solution.

Return ONLY a JSON array (no markdown). Schema:
[{ "question": string, "options": string[], "correctAnswers": string[], "explanation": string, "type": "${quizType}" }]

Notes:
"""
${notes}
"""`;
  }

  try {
    const raw = await callAI(prompt, geminiKey, groqKey);
    const items = parseAIJson(raw);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(500).json({ error: "AI returned no usable items." });
    }

    return res.json({ data: items, mode });
  } catch (err) {
    console.error("Generate error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/review", async (req, res) => {
  const geminiKey = getKey("GEMINI_API_KEY");
  const groqKey = getKey("GROQ_API_KEY");

  const { total, score, wrongItems, correctItems, mode } = req.body;
  if (total == null || score == null) {
    return res.status(400).json({ error: "Missing performance data." });
  }

  const pct = Math.round((score / total) * 100);

  const wrongSummary =
    wrongItems
      .map((item) =>
        mode === "flashcard"
          ? `- Fact: "${item.fact?.slice(0, 80)}..."`
          : `- Question: "${item.question?.slice(0, 80)}..."`,
      )
      .join("\n") || "None";

  const correctSummary =
    correctItems
      .map((item) =>
        mode === "flashcard"
          ? `- "${item.fact?.slice(0, 60)}..."`
          : `- "${item.question?.slice(0, 60)}..."`,
      )
      .join("\n") || "None";

  const prompt = `
You are a personal study coach. Analyze this quiz session and give structured feedback.

Mode: ${mode}
Score: ${score}/${total} (${pct}%)
Correct topics: ${correctSummary}
Missed topics: ${wrongSummary}

Return ONLY a valid JSON object (no markdown) with this exact schema:
{
  "grade": "A" | "B" | "C" | "D" | "F",
  "headline": "Short one-line performance summary (max 10 words)",
  "overall": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "suggestions": ["Specific actionable suggestion 1", "suggestion 2", "suggestion 3"],
  "encouragement": "One warm, motivating sentence"
}`;

  try {
    const raw = await callAI(prompt, geminiKey, groqKey);
    const review = parseAIJson(raw);
    return res.json({ review });
  } catch (err) {
    console.error("Review error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT);
