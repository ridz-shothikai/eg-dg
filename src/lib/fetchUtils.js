// Utility function for fetch with retry logic

/**
 * Performs a fetch request with automatic retries on failure.
 * @param {string} url The URL to fetch.
 * @param {RequestInit} options Fetch options.
 * @param {number} maxRetries Maximum number of retry attempts.
 * @param {(attempt: number, max: number) => void} [onRetry] Optional callback function called before each retry attempt.
 * @returns {Promise<Response>} The fetch Response object.
 * @throws {Error} Throws an error if the request fails after all retries.
 */
export const fetchWithRetry = async (url, options, maxRetries = 3, onRetry) => {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      const response = await fetch(url, options);
      // Success or client error (4xx) - don't retry
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      // Server error (5xx) or network issue simulated by non-ok status without specific range check
      console.warn(`Attempt ${attempts} failed for ${url}: Status ${response.status}`);
      if (attempts >= maxRetries) {
        // Try to get error message from body for the final failure
        let errorBody = '';
        try {
            errorBody = await response.text();
        } catch (e) { /* ignore */ }
        throw new Error(`Request failed after ${maxRetries} attempts with status ${response.status}. Body: ${errorBody}`);
      }
    } catch (error) {
      // Catch network errors (e.g., fetch itself fails)
      console.warn(`Attempt ${attempts} failed for ${url}: Network error`, error);
      if (attempts >= maxRetries) {
        { // Add explicit block braces
          throw new Error(`Request failed after ${maxRetries} attempts due to network error: ${error.message}`);
        } // Add explicit block braces
      }
    }

    // Wait before retrying with exponential backoff
    const delay = Math.pow(2, attempts - 1) * 1000; // 1s, 2s, 4s
    console.log(`Retrying ${url} in ${delay / 1000}s...`);
    if (onRetry) {
      onRetry(attempts, maxRetries); // Notify UI about retry attempt
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  // Should not be reached if maxRetries > 0, but satisfies TS/linter
  throw new Error(`Request failed after ${maxRetries} attempts.`);
};
