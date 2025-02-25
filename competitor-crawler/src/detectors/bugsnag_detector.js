/**
 * Simplified Detector for Bugsnag
 * Searches for any Bugsnag references in page HTML content
 */

/**
 * Detects Bugsnag presence on a page by scanning HTML content
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} - Detection results
 */
export const detectBugsnag = async (page) => {
  try {
    // Get the page content to search for Bugsnag references
    const content = await page.content();

    // Split content into lines for reporting matches with context
    const lines = content.split('\n');

    // Define simple case-insensitive regex for Bugsnag
    const bugsnagPattern = /bugsnag/i;

    // Store matching lines with context
    const matchingLines = [];

    // Check each line for matches
    lines.forEach((line, index) => {
      if (bugsnagPattern.test(line)) {
        matchingLines.push({
          content: line.trim()
        });
      }
    });

    return {
      hasBugsnag: matchingLines.length > 0,
      matchingLines: matchingLines
    };
  } catch (error) {
    console.error('Error executing Bugsnag detection:', error);
    return { hasBugsnag: false, error: error.message };
  }
};
