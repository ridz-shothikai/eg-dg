import { GoogleGenerativeAI } from "@google/generative-ai"; // Assuming this might be needed if model passed differently later

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
export const generateContentWithRetry = async (geminiModel, request, maxRetries = 3, onRetry) => {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      // Log structure before calling (similar to original callGemini)
      let loggableRequest = request;
      if (typeof request === 'object' && request !== null && 'contents' in request) {
         loggableRequest = {
             ...request,
             contents: request.contents.map(content => ({
                 ...content,
                 parts: content.parts.map(part => part.text ? { text: '...' } : { inlineData: { mimeType: part.inlineData?.mimeType, data: '...' } })
             }))
         };
      } else if (Array.isArray(request)) {
          // Handle simple string or array of parts (though generateContent usually takes the object form)
          loggableRequest = request.map(part => typeof part === 'string' ? '...' : (part.text ? { text: '...' } : { inlineData: { mimeType: part.inlineData?.mimeType, data: '...' } }));
      }
      console.log(`Calling gemini.generateContent (Attempt ${attempts}/${maxRetries})...`);
      console.log("Payload structure:", JSON.stringify(loggableRequest, null, 2));

      const result = await geminiModel.generateContent(request);

      // Check for immediate non-retryable issues like safety blocks in the response
      if (result?.response?.promptFeedback?.blockReason) {
        console.warn(`Gemini response blocked due to: ${result.response.promptFeedback.blockReason}`, result.response.promptFeedback.safetyRatings);
        throw new Error(`Content generation blocked due to: ${result.response.promptFeedback.blockReason}`); // Don't retry safety blocks
      }
       if (!result?.response?.text()) {
           // Handle cases where response exists but text is empty without a block reason (might be unexpected)
           console.error("Received empty text response from Gemini without explicit block reason:", JSON.stringify(result?.response, null, 2));
           // Decide if this is retryable - potentially not, might indicate prompt issue. Let's not retry for now.
           throw new Error("Received an empty text response from the generative model.");
       }

      // If we got here, the call was successful or had a non-retryable response issue handled above
      return result;

    } catch (error) {
      console.error(`Gemini generateContent Attempt ${attempts} failed:`, error);

      // Check for specific retryable errors (e.g., 5xx, network errors, RESOURCE_EXHAUSTED)
      // Note: Specific error codes/types might depend on the SDK/environment. This is a general approach.
      const isRetryable =
        error.message?.includes("RESOURCE_EXHAUSTED") || // Specific Gemini error
        error.message?.includes("500") || // Generic server error
        error.message?.includes("503") || // Service unavailable
        error.message?.toLowerCase().includes("network error") || // Generic network issue
        error.message?.toLowerCase().includes("fetch failed"); // Another common network issue indicator

      if (isRetryable && attempts < maxRetries) {
        // Wait before retrying with exponential backoff
        const delay = Math.pow(2, attempts - 1) * 1000; // 1s, 2s, 4s
        console.log(`Retrying Gemini call in ${delay / 1000}s...`);
        if (onRetry) {
          onRetry(attempts, maxRetries); // Notify caller about retry attempt
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        // Continue to next iteration of the while loop
      } else {
        // Non-retryable error or max retries reached
        console.error(`Gemini call failed permanently after ${attempts} attempts.`);
        throw error; // Re-throw the last error
      }
    }
  }
  // Should not be reached if maxRetries > 0
  throw new Error(`Gemini call failed after ${maxRetries} attempts.`);
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
export const generateContentStreamWithRetry = async (geminiModel, request, maxRetries = 3, onRetry) => {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      // Log structure before calling
      let loggableRequest = request;
       if (typeof request === 'object' && request !== null && 'contents' in request) {
         loggableRequest = {
             ...request,
             contents: request.contents.map(content => ({
                 ...content,
                 parts: content.parts.map(part => part.text ? { text: '...' } : { inlineData: { mimeType: part.inlineData?.mimeType, data: '...' } })
             }))
         };
      } else if (Array.isArray(request)) {
          loggableRequest = request.map(part => typeof part === 'string' ? '...' : (part.text ? { text: '...' } : { inlineData: { mimeType: part.inlineData?.mimeType, data: '...' } }));
      }
      console.log(`Calling gemini.generateContentStream (Attempt ${attempts}/${maxRetries})...`);
      console.log("Payload structure:", JSON.stringify(loggableRequest, null, 2));

      // Attempt to initiate the stream
      const result = await geminiModel.generateContentStream(request);

      // Basic check if stream initiation seems okay (e.g., result object exists)
      // More robust checks might be needed depending on SDK behavior on immediate errors
      if (!result || !result.stream) {
          throw new Error("Stream initiation failed, result or stream is missing.");
      }

      // If initiation seems successful, return the result containing the stream
      return result;

    } catch (error) {
      console.error(`Gemini generateContentStream Attempt ${attempts} failed:`, error);

      // Check for specific retryable errors
      const isRetryable =
        error.message?.includes("RESOURCE_EXHAUSTED") ||
        error.message?.includes("500") ||
        error.message?.includes("503") ||
        error.message?.toLowerCase().includes("network error") ||
        error.message?.toLowerCase().includes("fetch failed");

      // Don't retry non-retryable errors (like safety blocks, bad requests - though these might not throw at initiation)
      const isNonRetryable = error.message?.includes("SAFETY") || error.message?.includes("400 Bad Request");

      if (isRetryable && !isNonRetryable && attempts < maxRetries) {
        const delay = Math.pow(2, attempts - 1) * 1000;
        console.log(`Retrying Gemini stream initiation in ${delay / 1000}s...`);
        if (onRetry) {
          onRetry(attempts, maxRetries);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`Gemini stream initiation failed permanently after ${attempts} attempts.`);
        throw error; // Re-throw the last error
      }
    }
  }
  throw new Error(`Gemini stream initiation failed after ${maxRetries} attempts.`);
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
