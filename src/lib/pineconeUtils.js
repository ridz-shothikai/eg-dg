import { Pinecone } from '@pinecone-database/pinecone';
import * as constants from '@/constants';

const { PINECONE_API_KEY, PINECONE_ENVIRONMENT, PINECONE_INDEX_NAME } = constants;

let pineconeClient = null;

async function initPineconeClient() {
  if (!pineconeClient) {
    if (!PINECONE_API_KEY || !PINECONE_ENVIRONMENT || !PINECONE_INDEX_NAME) {
      console.error("Pinecone environment variables not set.");
      throw new Error("Pinecone environment variables not set.");
    }
    try {
      pineconeClient = new Pinecone({
        apiKey: PINECONE_API_KEY,
      });
      console.log("Pinecone client initialized.");
    } catch (error) {
      console.error("Error initializing Pinecone client:", error);
      throw error;
    }
  }
  return pineconeClient;
}

export async function upsertVectors(vectors) {
  const client = await initPineconeClient();
  const index = client.Index(PINECONE_INDEX_NAME);

  try {
    // Vectors should be an array of objects like:
    // { id: string, values: number[], metadata: object }
    await index.upsert(vectors);
    console.log(`Successfully upserted ${vectors.length} vectors to Pinecone index ${PINECONE_INDEX_NAME}.`);
  } catch (error) {
    console.error("Error upserting vectors to Pinecone:", error);
    throw error;
  }
}

export async function queryVectors(vector, topK, filter = {}) {
  const client = await initPineconeClient();
  const index = client.Index(PINECONE_INDEX_NAME);

  try {
    const queryRequest = {
      vector: vector,
      topK: topK,
      includeMetadata: true,
      filter: filter, // Allow filtering by metadata (e.g., projectId)
    };

    const queryResult = await index.query(queryRequest);
    console.log(`Successfully queried Pinecone index ${PINECONE_INDEX_NAME}. Found ${queryResult.matches.length} matches.`);
    return queryResult.matches;
  } catch (error) {
    console.error("Error querying Pinecone:", error);
    throw error;
  }
}
