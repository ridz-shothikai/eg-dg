import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Text chunking utility using LangChain

export async function chunkText(text, chunkSize = 15000, chunkOverlap = 200) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });
  const chunks = await splitter.splitText(text);
  return chunks;
}
