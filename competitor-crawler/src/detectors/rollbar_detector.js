/**
 * Detector for Rollbar Error Tracking
 * Looks for the rollbar global object and extracts relevant information
 */

/**
 * Detects Rollbar presence on a page
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} - Detection results
 */
export const detectRollbar = async (page) => {
  try {
    // Execute the detection in the browser context
    return await page.evaluate(() => {
      try {
        // Define extractData function with circular reference detection
        function extractData(obj, depth = 0, maxDepth = 2, visited = new WeakMap()) {
          // Handle null or undefined
          if (obj === null || obj === undefined) return null;

          // Handle primitive types directly
          if (typeof obj !== 'object' && typeof obj !== 'function') return obj;

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
            } else if (typeof obj === 'function') {
              return `Function: ${obj.name || 'anonymous'}`;
            } else {
              return `Object with keys: ${Object.keys(obj).join(', ')}`;
            }
          }

          // Handle functions specially
          if (typeof obj === 'function') {
            const funcObj = {
              __type: 'function',
              name: obj.name || 'anonymous',
              length: obj.length
            };

            // Get function properties
            const props = Object.getOwnPropertyNames(obj);
            for (const prop of props) {
              if (prop !== 'name' && prop !== 'length' && prop !== 'prototype' &&
                prop !== 'caller' && prop !== 'arguments') {
                try {
                  funcObj[prop] = extractData(obj[prop], depth + 1, maxDepth, visited);
                } catch (error) {
                  funcObj[prop] = `[Error: ${error.message}]`;
                }
              }
            }

            return funcObj;
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

        // Check for Rollbar presence (lowercase rollbar)
        const hasRollbar = !!window.rollbar;

        const checkRollbar = {
          hasRollbar: hasRollbar,
          version: 'unknown',
          details: {}
        };

        if (hasRollbar) {
          // Extract Rollbar data
          checkRollbar.details = extractData(window.rollbar);
        }

        return checkRollbar;
      } catch (error) {
        console.error('Error in Rollbar detection:', error);
        return { hasRollbar: false, error: error.message };
      }
    });
  } catch (error) {
    console.error('Error executing Rollbar detection in browser:', error);
    return { hasRollbar: false, error: error.message };
  }
};
