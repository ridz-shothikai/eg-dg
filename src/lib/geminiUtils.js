// Utility function for Gemini generateContent with retry logic

/**
 * Calls Gemini's generateContent method with automatic retries on specific failures.
 * @param {GenerativeModel} geminiModel The initialized Gemini model instance.
 * @param {GenerateContentRequest | (string | Part)[]} request The request object or string/parts array.
 * @param {number} maxRetries Maximum number of retry attempts.
 * @param {(attempt: number, max: number) => void} [onRetry] Optional callback function called before each retry attempt.
 * @returns {Promise<GenerateContentResult>} The result from Gemini.
 * @throws {Error} Throws an error if the call fails after all retries or encounters a non-retryable error.
 */
export const generateContentWithRetry = async (
  geminiModel,
  request,
  maxRetries = 3,
  onRetry
) => {
  let attempts = 0;

  const maskRequest = (req) => {
    if (Array.isArray(req)) {
      return req.map((part) =>
        typeof part === "string" ? "..." : { text: "..." }
      );
    }
    if (typeof req === "object" && req?.contents) {
      return {
        ...req,
        contents: req.contents.map((content) => ({
          ...content,
          parts: content.parts.map((part) =>
            part.text
              ? { text: "..." }
              : {
                  inlineData: {
                    mimeType: part.inlineData?.mimeType,
                    data: "...",
                  },
                }
          ),
        })),
      };
    }
    return req;
  };

  while (attempts < maxRetries) {
    attempts++;
    try {
      console.log(
        `Calling gemini.generateContent (Attempt ${attempts}/${maxRetries})...`
      );
      console.log(
        "Payload structure:",
        JSON.stringify(maskRequest(request), null, 2)
      );

      const result = await geminiModel.generateContent(request);

      const blockReason = result?.response?.promptFeedback?.blockReason;
      const text = await result?.response?.text();

      if (blockReason) {
        console.warn(
          `Response blocked due to: ${blockReason}`,
          result.response.promptFeedback.safetyRatings
        );
        throw new Error(`Blocked due to: ${blockReason}`);
      }

      if (!text) {
        console.error(
          "Empty text response:",
          JSON.stringify(result?.response, null, 2)
        );
        throw new Error("Received empty text response.");
      }

      return result;
    } catch (error) {
      console.error(`Attempt ${attempts} failed:`, error);

      const retryable = [
        "RESOURCE_EXHAUSTED",
        "500",
        "503",
        "network error",
        "fetch failed",
      ].some((msg) => error.message?.toLowerCase().includes(msg.toLowerCase()));

      if (retryable && attempts < maxRetries) {
        const delay = Math.pow(2, attempts - 1) * 1000;
        console.log(`Retrying in ${delay / 1000}s...`);
        onRetry?.(attempts, maxRetries);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        console.error(`Failed after ${attempts} attempts.`);
        throw error;
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts.`);
};

/**
 * Calls Gemini's generateContentStream method with automatic retries on specific failures.
 * This retries the *initiation* of the stream, not individual chunks.
 * @param {GenerativeModel} geminiModel The initialized Gemini model instance.
 * @param {GenerateContentRequest | (string | Part)[]} request The request object or string/parts array.
 * @param {number} maxRetries Maximum number of retry attempts.
 * @param {(attempt: number, max: number) => void} [onRetry] Optional callback function called before each retry attempt.
 * @returns {Promise<GenerateContentResult>} The result containing the stream.
 * @throws {Error} Throws an error if initiating the stream fails after all retries or encounters a non-retryable error.
 */
export const generateContentStreamWithRetry = async (
  geminiModel,
  request,
  maxRetries = 3,
  onRetry
) => {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      // Log structure before calling
      let loggableRequest = request;
      if (
        typeof request === "object" &&
        request !== null &&
        "contents" in request
      ) {
        loggableRequest = {
          ...request,
          contents: request.contents.map((content) => ({
            ...content,
            parts: content.parts.map((part) =>
              part.text
                ? { text: "..." }
                : {
                    inlineData: {
                      mimeType: part.inlineData?.mimeType,
                      data: "...",
                    },
                  }
            ),
          })),
        };
      } else if (Array.isArray(request)) {
        loggableRequest = request.map((part) =>
          typeof part === "string"
            ? "..."
            : part.text
            ? { text: "..." }
            : {
                inlineData: {
                  mimeType: part.inlineData?.mimeType,
                  data: "...",
                },
              }
        );
      }
      console.log(
        `Calling gemini.generateContentStream (Attempt ${attempts}/${maxRetries})...`
      );
      console.log(
        "Payload structure:",
        JSON.stringify(loggableRequest, null, 2)
      );

      // Attempt to initiate the stream
      const result = await geminiModel.generateContentStream(request);

      // Basic check if stream initiation seems okay (e.g., result object exists)
      // More robust checks might be needed depending on SDK behavior on immediate errors
      if (!result || !result.stream) {
        throw new Error(
          "Stream initiation failed, result or stream is missing."
        );
      }

      // If initiation seems successful, return the result containing the stream
      return result;
    } catch (error) {
      console.error(
        `Gemini generateContentStream Attempt ${attempts} failed:`,
        error
      );

      // Check for specific retryable errors
      const isRetryable =
        error.message?.includes("RESOURCE_EXHAUSTED") ||
        error.message?.includes("500") ||
        error.message?.includes("503") ||
        error.message?.toLowerCase().includes("network error") ||
        error.message?.toLowerCase().includes("fetch failed");

      // Don't retry non-retryable errors (like safety blocks, bad requests - though these might not throw at initiation)
      const isNonRetryable =
        error.message?.includes("SAFETY") ||
        error.message?.includes("400 Bad Request");

      if (isRetryable && !isNonRetryable && attempts < maxRetries) {
        const delay = Math.pow(2, attempts - 1) * 1000;
        console.log(`Retrying Gemini stream initiation in ${delay / 1000}s...`);
        if (onRetry) {
          onRetry(attempts, maxRetries);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `Gemini stream initiation failed permanently after ${attempts} attempts.`
        );
        throw error; // Re-throw the last error
      }
    }
  }
  throw new Error(
    `Gemini stream initiation failed after ${maxRetries} attempts.`
  );
};

// Example usage (replace actual calls with this):
/*
async function someApiRouteHandler() {
    try {
        const gemini = getInitializedGeminiModel(); // Get your model instance
        const prompt = "Your prompt here";
        const fileParts = [...]; // Your file parts if any
        const safetySettings = [...]; // Your safety settings

        const result = await generateContentWithRetry(
            gemini,
            {
                contents: [{ role: "user", parts: [{ text: prompt }, ...fileParts] }],
                // generationConfig, // Add if needed
                safetySettings
            },
            3, // maxRetries
            (attempt, max) => {
                console.log(`Gemini call retry ${attempt}/${max}`);
                // Optionally send SSE message here if in SSE context
            }
        );

        const responseText = result.response.text();
        // Process responseText
    } catch (error) {
        // Handle final error
    }
}
*/

// Add this function to your existing geminiUtils.js file

/**
 * Generates a system prompt for Gemini that includes DXF-specific instructions
 * @param {Array} diagramNames - Array of diagram file names in the project
 * @returns {string} - The system prompt for Gemini
 */
export function generateDxfAwareSystemPrompt(diagramNames) {
  return `You are an AI assistant specialized in engineering diagrams and CAD files. 

You have access to the following files: ${diagramNames.join(', ')}.

For DXF files, you can analyze:
- Geometric entities (lines, circles, arcs, polylines)
- Text annotations and dimensions
- Layer information and block references
- Spatial relationships between elements

When answering questions about DXF files:
1. Reference specific entities, measurements, and text labels from the file
2. Describe geometric relationships clearly
3. Interpret engineering notation and symbols appropriately
4. Provide measurements in the units specified in the file

Respond to user queries in a helpful, accurate manner based on the content of these files.`;
}
