/**
 * Detects Sentry implementations on a webpage
 * Checks for window.Sentry, window.__SENTRY__, and window.Raven
 */


/**
 * Detects Sentry presence on a page
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} - Detection results
 */
export const detectSentry = async (page) => {
  try {
    const sentryData = await page.evaluate(() => {
      try {
        // Define extractData function with circular reference detection
        function extractData(obj, depth = 0, maxDepth = 4, visited = new WeakMap()) {
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
            // Special case: if this is an object with keys containing "option", continue extraction
            if (!Array.isArray(obj) && Object.keys(obj).some(key => key.toLowerCase().includes('option'))) {
              // Continue with extraction for this special case
            } else {
              if (Array.isArray(obj)) {
                return `Array with ${obj.length} items`;
              } else {
                return `Object with keys: ${Object.keys(obj).join(', ')}`;
              }
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

              // If key contains "option", extract with increased depth limit
              if (key.toLowerCase().includes('option')) {
                result[key] = extractData(value, depth + 1, Math.max(maxDepth, depth + 3), visited);
              } else {
                result[key] = extractData(value, depth + 1, maxDepth, visited);
              }
            } catch (error) {
              // Handle errors during property access
              result[key] = `[Error accessing property: ${error.message}]`;
            }
          }

          return result;
        }

        // Find sample rates recursively in an object
        function findSampleRates(obj, path = '', visited = new WeakMap()) {
          // Handle null or undefined
          if (obj === null || obj === undefined) return {};

          // Handle primitive types
          if (typeof obj !== 'object') return {};

          // Check for circular references
          if (visited.has(obj)) return {};

          // Add current object to visited map
          visited.set(obj, true);

          let results = {};

          // Check for sample rate properties at this level
          const sampleRateKeys = [
            'tracesSampleRate',
            'replaysSessionSampleRate',
            'replaysOnErrorSampleRate',
            'profilesSampleRate'
          ];

          for (const key of sampleRateKeys) {
            if (key in obj && typeof obj[key] === 'number') {
              results[key] = obj[key];
              results[`${key}Path`] = path ? `${path}.${key}` : key;
            }
          }

          // Recursively check all properties
          if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
              const childResults = findSampleRates(item, `${path}[${index}]`, visited);
              results = { ...results, ...childResults };
            });
          } else {
            for (const key in obj) {
              try {
                const childResults = findSampleRates(obj[key], path ? `${path}.${key}` : key, visited);
                results = { ...results, ...childResults };
              } catch (error) {
                // Skip properties that can't be accessed
              }
            }
          }

          return results;
        }

        // Function to find DSN in an object
        function findDsn(obj, path = '', visited = new WeakMap()) {
          // Handle null or undefined
          if (obj === null || obj === undefined) return null;

          // Handle primitive types
          if (typeof obj !== 'object') return null;

          // Check for circular references
          if (visited.has(obj)) return null;

          // Add current object to visited map
          visited.set(obj, true);

          // Check for dsn property at this level
          if ('dsn' in obj && typeof obj.dsn === 'string') {
            return obj.dsn;
          }

          // Recursively check all properties
          if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
              const result = findDsn(obj[i], `${path}[${i}]`, visited);
              if (result) return result;
            }
          } else {
            for (const key in obj) {
              try {
                const result = findDsn(obj[key], path ? `${path}.${key}` : key, visited);
                if (result) return result;
              } catch (error) {
                // Skip properties that can't be accessed
              }
            }
          }

          return null;
        }

        // Check all possible Sentry implementations
        const checkSentry = {
          hasSentry: !!(window.Sentry || window.__SENTRY__ || window.Raven),
          version: null,
          dsn: null,
          // Self-hosted or relay field
          isSelfHostedOrRelay: false,
          Sentry: window.Sentry ? true : null,
          __SENTRY__: window.__SENTRY__ ? true : null,
          Raven: window.Raven ? true : null,
          // Add new fields for features
          hasPerformance: false,
          hasReplay: false,
          hasProfiles: false,
          // Sample rate fields
          tracesSampleRate: null,
          replaysSessionSampleRate: null,
          replaysOnErrorSampleRate: null,
          profilesSampleRate: null,
        };

        // Try to extract version information
        if (window.Sentry && window.Sentry.SDK_VERSION) {
          checkSentry.version = window.Sentry.SDK_VERSION;
        } else if (window.Raven && window.Raven.VERSION) {
          checkSentry.version = window.Raven.VERSION;
        } else if (window.__SENTRY__) {
          // Check for direct version property in __SENTRY__
          if (window.__SENTRY__.version) {
            checkSentry.version = window.__SENTRY__.version;
          }
          // Look for version as a top-level key that might be a version string
          else {
            for (const key in window.__SENTRY__) {
              if (/^\d+\.\d+\.\d+$/.test(key)) {
                checkSentry.version = key;
                break;
              }
            }
          }

          // Check in hub._version if still no version found
          if (!checkSentry.version && window.__SENTRY__.hub && window.__SENTRY__.hub._version) {
            checkSentry.version = window.__SENTRY__.hub._version.toString();
          }

          // Fall back to client options if still no version found
          if (!checkSentry.version && window.__SENTRY__.hub && window.__SENTRY__.hub.getClient) {
            const client = window.__SENTRY__.hub.getClient();
            if (client && client.getOptions && client.getOptions().sdk) {
              checkSentry.version = client.getOptions().sdk.version;
            }
          }
        }

        // Extract sample rates and detect features
        let sampleRates = {};

        // Try to find DSN in all Sentry objects
        if (window.Sentry) {
          checkSentry.SentryData = extractData(window.Sentry);
          sampleRates = { ...sampleRates, ...findSampleRates(window.Sentry) };
          if (!checkSentry.dsn) {
            checkSentry.dsn = findDsn(window.Sentry);
          }
        }

        if (window.__SENTRY__) {
          checkSentry.__SENTRY__Data = extractData(window.__SENTRY__);
          sampleRates = { ...sampleRates, ...findSampleRates(window.__SENTRY__) };
          if (!checkSentry.dsn) {
            checkSentry.dsn = findDsn(window.__SENTRY__);
          }
        }

        if (window.Raven) {
          checkSentry.RavenData = extractData(window.Raven);
          sampleRates = { ...sampleRates, ...findSampleRates(window.Raven) };
          if (!checkSentry.dsn) {
            checkSentry.dsn = findDsn(window.Raven);
          }
        }

        // Check if DSN is self-hosted or relay
        if (checkSentry.dsn && !checkSentry.dsn.toLowerCase().includes('sentry')) {
          checkSentry.isSelfHostedOrRelay = true;
        }

        // Add sample rates to the result and determine feature availability based on sample rates
        if (sampleRates.tracesSampleRate !== undefined) {
          checkSentry.tracesSampleRate = sampleRates.tracesSampleRate;
          checkSentry.hasPerformance = true; // If tracesSampleRate exists, performance monitoring is enabled
        }

        if (sampleRates.replaysSessionSampleRate !== undefined || sampleRates.replaysOnErrorSampleRate !== undefined) {
          // If either replay sample rate exists, replay is enabled
          checkSentry.hasReplay = true;

          if (sampleRates.replaysSessionSampleRate !== undefined) {
            checkSentry.replaysSessionSampleRate = sampleRates.replaysSessionSampleRate;
          }

          if (sampleRates.replaysOnErrorSampleRate !== undefined) {
            checkSentry.replaysOnErrorSampleRate = sampleRates.replaysOnErrorSampleRate;
          }
        }

        if (sampleRates.profilesSampleRate !== undefined) {
          checkSentry.profilesSampleRate = sampleRates.profilesSampleRate;
          checkSentry.hasProfiles = true; // If profilesSampleRate exists, profiling is enabled
        }

        return checkSentry;
      } catch (error) {
        console.error('Error in Sentry detection:', error);
        return { hasSentry: false, error: error.message };
      }
    });

    return sentryData;
  } catch (error) {
    console.error('Error detecting Sentry:', error.message);
    return { hasSentry: false, error: error.message };
  }
};
