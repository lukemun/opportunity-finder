/**
 * Detector for New Relic Browser Agent
 * Looks for the newrelic global object and extracts relevant information
 */

/**
 * Detects New Relic presence on a page
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} - Detection results
 */
export const detectNewRelic = async (page) => {
  try {
    // Execute the detection in the browser context
    return await page.evaluate(() => {
      try {
        // Define extractData function with circular reference detection
        function extractData(obj, depth = 0, maxDepth = 3, visited = new WeakMap()) {
          // Handle null or undefined
          if (obj === null || obj === undefined) return null;

          // Handle primitive types directly
          if (typeof obj !== 'object') return obj;

          // Check for circular references
          if (visited.has(obj)) {
            return '[Circular Reference]';
          }

          // Add current object to visited map
          visited.set(obj, true);

          // Check if we've reached max depth
          if (depth >= maxDepth) {
            if (Array.isArray(obj)) {
              return `Array with ${obj.length} items`;
            } else {
              return `Object with keys: ${Object.keys(obj).join(', ')}`;
            }
          }

          // Handle arrays
          if (Array.isArray(obj)) {
            return obj.map(item => extractData(item, depth + 1, maxDepth, visited));
          }

          // Handle objects
          const result = {};
          for (const key in obj) {
            try {
              const value = obj[key];
              result[key] = extractData(value, depth + 1, maxDepth, visited);
            } catch (error) {
              // Handle errors during property access
              result[key] = `[Error accessing property: ${error.message}]`;
            }
          }

          return result;
        }

        // Check for New Relic presence
        const hasNewRelic = !!window.newrelic;

        const checkNewRelic = {
          hasNewRelic: hasNewRelic,
          version: 'unknown',
          details: {}
        };

        if (hasNewRelic) {
          checkNewRelic.NewRelicData = extractData(window.newrelic);

          // Try to extract version information
          try {
            if (window.newrelic && window.newrelic.info && window.newrelic.info.jsAttributes) {
              // Version might be in jsAttributes
              checkNewRelic.version = window.newrelic.info.jsAttributes.agent || 'unknown';
            }

            // Try to find version in other properties
            if (checkNewRelic.version === 'unknown' && window.newrelic.version) {
              checkNewRelic.version = window.newrelic.version;
            }
          } catch (versionError) {
            console.error('Error extracting New Relic version:', versionError);
          }

          // Extract information about features being used
          try {
            checkNewRelic.details.features = {
              pageViewTracking: typeof window.newrelic.noticePageView === 'function',
              errorTracking: typeof window.newrelic.noticeError === 'function',
              apiTracking: typeof window.newrelic.addToTrace === 'function',
              customEvents: typeof window.newrelic.addRelease === 'function',
              spaSupport: typeof window.newrelic.interaction === 'function'
            };
          } catch (featuresError) {
            console.error('Error extracting New Relic features:', featuresError);
          }

          // Extract information about the application
          try {
            if (window.newrelic.info) {
              checkNewRelic.details.applicationInfo = extractData(window.newrelic.info);
            }
          } catch (infoError) {
            console.error('Error extracting New Relic application info:', infoError);
          }

          // List available methods
          checkNewRelic.details.availableMethods = Object.keys(window.newrelic)
            .filter(key => typeof window.newrelic[key] === 'function')
            .sort();
        }

        return checkNewRelic;
      } catch (error) {
        console.error('Error in New Relic detection:', error);
        return { hasNewRelic: false, error: error.message };
      }
    });
  } catch (error) {
    console.error('Error executing New Relic detection in browser:', error);
    return { hasNewRelic: false, error: error.message };
  }
};
