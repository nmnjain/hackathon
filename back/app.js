import express from "express";
import axios from "axios";
import {parseStringPromise} from "xml2js";
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";

const app = express();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/data", async (req, res) => {
  try {
    const hfResponse = await axios.get("https://huggingface.co/api/models?limit=10");

    if (!hfResponse || !hfResponse.data || hfResponse.data.length === 0) {
      return res.status(400).json({ message: "No model data found" });
    }

    const models = hfResponse.data;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const modelData = await Promise.all(
      models.map(async (modelInfo) => {
        const modelId = modelInfo.modelId;
        const readmeUrl = `https://huggingface.co/${modelId}/raw/main/README.md`;

        try {
          const readmeResponse = await axios.get(readmeUrl);
          const readmeContent = readmeResponse.data;
          const response = await model.generateContent({
            contents: [{ parts: [{ text: readmeContent }] }],
          });

          const generatedDescription =
            response.response?.candidates?.[0]?.content?.parts?.[0]?.text || "No description generated.";

          return {
            modelId,
            link: `https://huggingface.co/${modelId}`,
            description: generatedDescription,
          };
        } catch (err) {
          return {
            modelId,
            link: `https://huggingface.co/${modelId}`,
            description: "README not available or Gemini generation failed.",
          };
        }
      })
    );

    return res.status(200).json(modelData);
  } catch (e) {
    console.error("Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});


app.get("/arxiv", async (req, res) => {
  try {
    const url =
      "http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=5";

    const response = await axios.get(url);
    const json = await parseStringPromise(response.data, { explicitArray: false });

    const entries = Array.isArray(json.feed.entry) ? json.feed.entry : [json.feed.entry];

    const papers = entries.map((paper) => ({
      title: paper.title.trim(),
      authors: Array.isArray(paper.author)
        ? paper.author.map((a) => a.name).join(", ")
        : paper.author.name,
      published: paper.published,
      summary: paper.summary.trim().replace(/\s+/g, " ").slice(0, 8000) + "...",
      pdfLink: paper.link.find((l) => l.$.title === "pdf").$.href,
    }));
    return res.status(200).json(papers);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch or parse arXiv data" });
  }
});

app.get("/github", async (req, res) => {
  try {
    const query = 'ai+model+transformer+in:name,description';
    const url = `https://api.github.com/search/repositories?q=${query}&sort=updated&order=desc&per_page=5`;

    const response = await axios.get(url);
    const repos = response.data.items;

    const aiModels = repos.map((repo) => ({
      name: repo.name,
      owner: repo.owner.login,
      description: repo.description || "No description available",
      stars: repo.stargazers_count,
      url: repo.html_url,
      updatedAt: repo.updated_at,
      language: repo.language
    }));

    // Return just the array, not an object with a property
    return res.status(200).json(aiModels);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch GitHub AI model data" });
  }
});





app.listen(8080, () => {
  console.log("Server started at http://localhost:8080");
});