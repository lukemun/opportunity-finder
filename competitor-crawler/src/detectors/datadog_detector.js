/**
 * Detector for Datadog RUM (Real User Monitoring)
 * Looks for the DD_RUM global object and extracts relevant information
 */

/**
 * Detects Datadog presence on a page
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} - Detection results
 */
export const detectDatadog = async (page) => {
  try {
    // Execute the detection in the browser context
    return await page.evaluate(() => {
      try {
        // Define extractData function directly
        function extractData(obj, depth = 0, maxDepth = 2, visited = new WeakMap()) {
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

        // Check for Datadog presence
        const hasDatadog = !!window.DD_RUM;
        const version = hasDatadog && window.DD_RUM.version ? window.DD_RUM.version : 'unknown';

        const checkDatadog = {
          hasDatadog: hasDatadog,
          version: version,
          DD_RUM: hasDatadog ? true : null,
          details: {}
        };

        if (window.DD_RUM) {
          checkDatadog.DatadogData = extractData(window.DD_RUM);

          // Extract configuration if available
          try {
            if (typeof window.DD_RUM.getInitConfiguration === 'function') {
              const config = window.DD_RUM.getInitConfiguration();
              if (config) {
                checkDatadog.details.configuration = extractData(config);
              }
            }
          } catch (configError) {
            console.error('Error extracting Datadog configuration:', configError);
          }

          // Extract user information if available
          try {
            if (typeof window.DD_RUM.getUser === 'function') {
              const user = window.DD_RUM.getUser();
              if (user) {
                checkDatadog.details.user = extractData(user);
              }
            }
          } catch (userError) {
            console.error('Error extracting Datadog user info:', userError);
          }

          // Extract global context if available
          try {
            if (typeof window.DD_RUM.getGlobalContext === 'function') {
              const globalContext = window.DD_RUM.getGlobalContext();
              if (globalContext) {
                checkDatadog.details.globalContext = extractData(globalContext);
              }
            }
          } catch (contextError) {
            console.error('Error extracting Datadog global context:', contextError);
          }

          // Extract internal context if available
          try {
            if (typeof window.DD_RUM.getInternalContext === 'function') {
              const internalContext = window.DD_RUM.getInternalContext();
              if (internalContext) {
                checkDatadog.details.internalContext = extractData(internalContext);
              }
            }
          } catch (internalError) {
            console.error('Error extracting Datadog internal context:', internalError);
          }

          // List available methods
          checkDatadog.details.availableMethods = Object.keys(window.DD_RUM)
            .filter(key => typeof window.DD_RUM[key] === 'function')
            .sort();
        }

        return checkDatadog;
      } catch (error) {
        console.error('Error in Datadog detection:', error);
        return { hasDatadog: false, error: error.message };
      }
    });
  } catch (error) {
    console.error('Error executing Datadog detection in browser:', error);
    return { hasDatadog: false, error: error.message };
  }
};
