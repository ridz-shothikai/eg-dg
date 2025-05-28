import { GoogleGenerativeAI } from '@google/generative-ai';
import * as constants from '@/constants';

const { GOOGLE_AI_STUDIO_API_KEY } = constants;

let embeddingModel = null;

async function initEmbeddingModel() {
  if (!embeddingModel) {
    if (!GOOGLE_AI_STUDIO_API_KEY) {
      console.error("GOOGLE_AI_STUDIO_API_KEY not set.");
      throw new Error("GOOGLE_AI_STUDIO_API_KEY not set.");
    }
    try {
      const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
      // Use the embedding-001 model
      embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
      console.log("Embedding model 'embedding-001' initialized.");
    } catch (error) {
      console.error("Error initializing embedding model:", error);
      throw error;
    }
  }
  return embeddingModel;
}

export async function generateEmbedding(text) {
  const model = await initEmbeddingModel();
  try {
    const result = await model.embedContent(text);
    console.log("Successfully generated embedding.");
    return result.embedding.values;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}
