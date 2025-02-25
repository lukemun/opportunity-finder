// Service Discovery Crawler
// This script crawls websites to discover other services/sites related to a company
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { URL } from 'url';
import fs from 'fs/promises'; // Use ES module import for fs

// Global variables to store state during crawling
// Only track potentialDifferentServices for start URLs
let potentialDifferentServices = {};
let allExploredUrls = {};
let startUrlChildren = {};

// Configuration
const MAX_REQUESTS_PER_CRAWL = 100; // Limit total requests
const INTERNAL_TOOL_INDICATORS = [
  'login', 'dashboard', 'app', 'portal', 'admin', 'console', 'platform',
  'signup', 'sign-up', 'sign_up', 'register', 'account', 'auth',
  'api', 'docs', 'documentation', 'developer', 'dev',
  'tool', 'tools', 'workspace', 'client', 'manage', 'management',
  'analytics', 'report', 'reports', 'monitor', 'monitoring'
]; // URL patterns that might indicate internal tools
// React and other modern frameworks often use these class names or attributes for clickable elements
const CLICKABLE_INDICATORS = ['btn', 'button', 'nav-item', 'menu-item', 'clickable', 'selectable', 'card', 'link'];
// Social media and other external services to exclude
const EXCLUDED_DOMAINS = [
  'twitter.com', 'x.com',
  'facebook.com', 'fb.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'github.com',
  'medium.com',
  'discord.com', 'discord.gg',
  'slack.com',
  'reddit.com',
  'pinterest.com',
  'tiktok.com'
];

/**
 * Extracts the domain from a URL
 * @param {string} url - The URL to extract domain from
 * @returns {string} The domain
 */
function extractDomain(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (error) {
    console.error(`Error parsing URL ${url}: ${error.message}`);
    return '';
  }
}

/**
 * Checks if a URL likely belongs to the same company
 * @param {string} originalDomain - The original domain
 * @param {string} targetUrl - The URL to check
 * @returns {boolean} Whether the URL likely belongs to the same company
 */
function isSameCompany(originalDomain, targetUrl) {
  try {
    const targetDomain = extractDomain(targetUrl);

    // Check if it's the same domain
    if (targetDomain === originalDomain) return true;

    // Check if it's a subdomain of the original domain
    if (targetDomain.endsWith(`.${originalDomain}`)) return true;

    // Check for common patterns in the URL that might indicate internal tools
    // Only for different domains, check if the path contains an indicator
    const targetPath = new URL(targetUrl).pathname.toLowerCase();
    const hasToolIndicator = INTERNAL_TOOL_INDICATORS.some(indicator => {
      // More precise check - look for them as distinct path segments
      const pathSegments = targetPath.split('/').filter(Boolean);
      return pathSegments.some(segment =>
        segment === indicator ||
        segment.startsWith(`${indicator}-`) ||
        segment.endsWith(`-${indicator}`) ||
        segment.includes(`-${indicator}-`)
      );
    });

    return hasToolIndicator;
  } catch (error) {
    console.error(`Error checking if same company: ${error.message}`);
    return false;
  }
}

/**
 * Checks if a URL should be excluded (email, social media, etc.)
 * @param {string} url - The URL to check
 * @returns {boolean} Whether the URL should be excluded
 */
function shouldExcludeUrl(url) {
  // Exclude mailto: and tel: links
  if (url.startsWith('mailto:') || url.startsWith('tel:')) return true;

  try {
    const domain = extractDomain(url);
    // Check if the domain is in our excluded list
    return EXCLUDED_DOMAINS.some(excludedDomain => domain === excludedDomain || domain.endsWith(`.${excludedDomain}`));
  } catch (error) {
    console.error(`Error checking if URL should be excluded: ${error.message}`);
    return false;
  }
}

/**
 * Checks if a URL represents a different service/tool rather than just a different page
 * @param {string} originalUrl - The original URL
 * @param {string} targetUrl - The URL to check
 * @returns {boolean} Whether the URL likely represents a different service
 */
function isPotentialDifferentService(originalUrl, targetUrl) {
  try {
    // Exclude certain URLs
    if (shouldExcludeUrl(targetUrl)) return false;

    const originalParsed = new URL(originalUrl);
    const targetParsed = new URL(targetUrl);

    // If domains are different, it's a different service
    if (originalParsed.hostname !== targetParsed.hostname) return true;

    // If it's the same domain, it must have one of the internal tool indicators to be considered a different service
    const targetPath = targetParsed.pathname.toLowerCase();

    // More precise check for tool indicators - look for them as distinct path segments
    // This prevents matching "blog" in "blog/announcing-app-support" as containing "app"
    const pathSegments = targetPath.split('/').filter(Boolean);

    // Check if any segment exactly matches or contains an indicator
    const hasToolIndicator = pathSegments.some(segment =>
      INTERNAL_TOOL_INDICATORS.some(indicator =>
        // Check for exact match or as part of a segment with clear boundaries
        segment === indicator ||
        segment.startsWith(`${indicator}-`) ||
        segment.endsWith(`-${indicator}`) ||
        segment.includes(`-${indicator}-`)
      )
    );

    // If no tool indicator is found, it's not a different service
    if (!hasToolIndicator) return false;

    // If the target is just a subpath of original, it's not a different service
    const originalPath = originalParsed.pathname.toLowerCase();
    if (targetPath.startsWith(originalPath) && targetPath !== originalPath) return false;

    return true;
  } catch (error) {
    console.error(`Error checking if different service: ${error.message}`);
    return false;
  }
}

/**
 * Main function to start the crawler
 * @param {string[]} startUrls - Array of URLs to start crawling from
 */
async function findCompanyServices(companies) {
  // Reset global data structures for each run
  potentialDifferentServices = {};
  allExploredUrls = {};
  startUrlChildren = {};

  // Initialize children for each start URL
  for (const company of companies) {
    startUrlChildren[company.url] = [];
    potentialDifferentServices[company.url] = [];
  }

  // Create a dataset to store the results
  const dataset = await Dataset.open('company-services');

  // Initialize the crawler
  const crawler = new PlaywrightCrawler({
    // Maximum number of concurrent requests
    maxConcurrency: 1,
    maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
    // Use headless browser
    headless: false,
    // Timeout for each navigation
    navigationTimeoutSecs: 60,
    // Retry failed requests
    maxRequestRetries: 2,
    // Browser launch options
    launchContext: {
      launchOptions: {
        viewport: {
          width: 1280,
          height: 800
        }
      }
    },
    browserPoolOptions: {
      // Keep more pages open per browser
      maxOpenPagesPerBrowser: 10,

      // Keep inactive browsers alive longer
      closeInactiveBrowserAfterSecs: 200,
    },
    // Handle each page
    async requestHandler({ request, page, enqueueLinks, log }) {
      const url = request.url;
      const label = request.userData.label || 'start';
      const originalDomain = request.userData.originalDomain || extractDomain(url);
      const companyName = request.userData.companyName || '';

      log.info(`Processing ${url} with label ${label}`);

      if (!allExploredUrls[url]) {
        allExploredUrls[url] = [];
      }

      // If this is a child of a start URL, track it
      if (label === 'child' && request.userData.parentUrl) {
        const parentUrl = request.userData.parentUrl;
        if (startUrlChildren[parentUrl] && !startUrlChildren[parentUrl].includes(url)) {
          startUrlChildren[parentUrl].push(url);
        }
      }

      // Instead of using page.evaluate, we can directly use Playwright's API
      const potentialLinks = [];

      // Get all elements with href attributes (standard links)
      const hrefElements = await page.$$('[href]');
      for (const el of hrefElements) {
        const href = await el.getAttribute('href');
        const text = await el.textContent();

        if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
          potentialLinks.push({
            url: href,
            type: 'href',
            text: text?.trim() || '',
            elementHandle: el  // Store the actual Playwright element handle
          });
        }
      }

      // Get elements with onclick attributes
      const onclickElements = await page.$$('[onclick]');
      for (const el of onclickElements) {
        const text = await el.textContent();
        potentialLinks.push({
          url: null,
          type: 'onclick',
          text: text?.trim() || '',
          elementHandle: el
        });
      }

      // Get elements with Angular click directives
      const angularElements = await page.$$('[ng-click], [\\(click\\)]');
      for (const el of angularElements) {
        const text = await el.textContent();
        potentialLinks.push({
          url: null,
          type: 'angular-click',
          text: text?.trim() || '',
          elementHandle: el
        });
      }

      // Get elements with jsaction attributes
      const jsactionElements = await page.$$('[jsaction]');
      for (const el of jsactionElements) {
        const text = await el.textContent();
        potentialLinks.push({
          url: null,
          type: 'jsaction',
          text: text?.trim() || '',
          elementHandle: el
        });
      }

      // React specific elements
      const reactElements = await page.$$('[role="button"], [role="link"]');
      for (const el of reactElements) {
        const text = await el.textContent();
        potentialLinks.push({
          url: null,
          type: 'react-role',
          text: text?.trim() || '',
          elementHandle: el
        });
      }

      // Look for common button/link class names in modern frameworks
      for (const indicator of CLICKABLE_INDICATORS) {
        // Elements with class names containing the indicator
        const classElements = await page.$$(`[class*="${indicator}"]`);
        for (const el of classElements) {
          const hasHref = await el.getAttribute('href');
          if (!hasHref) {
            const text = await el.textContent();
            potentialLinks.push({
              url: null,
              type: 'framework-component',
              indicator,
              text: text?.trim() || '',
              elementHandle: el
            });
          }
        }

        // Elements with id containing the indicator
        const idElements = await page.$$(`[id*="${indicator}"]`);
        for (const el of idElements) {
          const hasHref = await el.getAttribute('href');
          if (!hasHref) {
            const text = await el.textContent();
            potentialLinks.push({
              url: null,
              type: 'framework-component',
              indicator,
              text: text?.trim() || '',
              elementHandle: el
            });
          }
        }
      }

      // Get all button elements
      const buttonElements = await page.$$('button');
      for (const el of buttonElements) {
        const text = await el.textContent();
        potentialLinks.push({
          url: null,
          type: 'button-element',
          text: text?.trim() || '',
          elementHandle: el
        });
      }

      // Log all clickable elements for debugging
      log.info(`Found ${potentialLinks.length} potential clickable elements on ${url}`);
      for (const link of potentialLinks) {
        if (link.url) {
          log.info(`Clickable element: ${link.type} | URL: ${link.url}`);
        } else {
          log.info(`Clickable element: ${link.type} | Text: ${link.text}`);
        }
      }

      // For all URLs (both start and child), process clickable elements
      for (const link of potentialLinks) {
        if (link.type !== 'href' && link.elementHandle) {
          try {
            // Log these elements for manual review
            log.info(`Found potential interactive element: ${link.elementHandle.toString().slice(0, 20)}`);

            // Try clicking all interactive elements regardless of framework
            try {
              await link.elementHandle.click({ timeout: 5000 }).catch(e => {
                log.info(`Click failed: ${e.message}`);
              });

              const newPagePromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);

              const newPage = await newPagePromise;
              if (newPage) {
                // Wait for the new page to load completely
                await newPage.waitForLoadState('networkidle').catch(() => { });
                // Also wait a fixed time to ensure any redirects or JS navigation completes
                await new Promise(resolve => setTimeout(resolve, 2000));

                const newUrl = newPage.url();
                log.info(`New page opened: ${newUrl}`);

                // Skip if it's the original URL
                if (newUrl === url) {
                  log.info(`Skipping original URL: ${newUrl}`);
                  await newPage.close();
                  continue;
                }

                // Add to all explored URLs
                if (!allExploredUrls[url].includes(newUrl)) {
                  allExploredUrls[url].push(newUrl);
                }

                // If this is a start URL, track the new URL and potentially enqueue it
                if (label === 'start') {
                  // Add to potential different services
                  if (!potentialDifferentServices[url].includes(newUrl)) {
                    potentialDifferentServices[url].push(newUrl);
                    log.info(`Found interactive element service for start URL ${url}: ${newUrl}`);
                  }

                  // Enqueue the new URL with child label
                  await crawler.addRequests([{
                    url: newUrl,
                    userData: {
                      label: 'child',
                      parentUrl: url,
                      originalDomain,
                      companyName
                    }
                  }]);

                  // Track as a child of the start URL
                  if (!startUrlChildren[url].includes(newUrl)) {
                    startUrlChildren[url].push(newUrl);
                  }
                }

                // Close the new page to avoid having too many open
                await newPage.close();
              } else {
                // Check if the current page URL changed after the click
                // Wait for navigation to complete
                await page.waitForLoadState('networkidle').catch(() => { });
                // Also wait a fixed time to ensure any redirects or JS navigation completes
                await new Promise(resolve => setTimeout(resolve, 2000));

                const currentUrl = page.url();
                if (currentUrl !== url) {
                  log.info(`Page navigation detected: ${currentUrl}`);

                  // Add to all explored URLs
                  if (!allExploredUrls[url].includes(currentUrl)) {
                    allExploredUrls[url].push(currentUrl);
                  }

                  // If this is a start URL, track the new URL
                  if (label === 'start') {
                    // Add to potential different services
                    if (!potentialDifferentServices[url].includes(currentUrl)) {
                      potentialDifferentServices[url].push(currentUrl);
                      log.info(`Found different service after navigation for start URL ${url}: ${currentUrl}`);
                    }
                  }
                }
              }
            } catch (clickError) {
              log.error(`Error attempting to click element: ${clickError.message}`);
            }
          } catch (error) {
            log.error(`Error processing interactive element: ${error.message}`);
          }
        }
      }

      // For cross-domain links, we'll manually extract and process them
      const crossDomainLinks = await page.$$eval('a[href]', (links, currentUrl) => {
        return links.map(link => {
          const href = link.href;
          // Only include absolute URLs that are not on the same hostname
          if (href && href.includes('://') && !href.includes(window.location.hostname)) {
            return href;
          }
          return null;
        }).filter(Boolean);
      }, url);

      // Process cross-domain links
      for (const targetUrl of crossDomainLinks) {
        // Skip excluded URLs
        if (shouldExcludeUrl(targetUrl)) continue;

        // Check if the target URL contains the company name
        const targetUrlLower = targetUrl.toLowerCase();
        const containsCompanyName = targetUrlLower.includes(companyName);

        // Only enqueue if the URL contains the company name
        if (containsCompanyName) {
          // Add to all explored URLs
          if (!allExploredUrls[url].includes(targetUrl)) {
            allExploredUrls[url].push(targetUrl);
          }

          // Add to potential different services
          if (!potentialDifferentServices[url].includes(targetUrl)) {
            potentialDifferentServices[url].push(targetUrl);
            log.info(`Found cross-domain service for start URL ${url}: ${targetUrl}`);
          }

          // Enqueue the cross-domain URL with child label
          await crawler.addRequests([{
            url: targetUrl,
            userData: {
              label: 'child',
              parentUrl: url,
              originalDomain,
              companyName  // Use the existing company name
            }
          }]);

          // Track as a child of the start URL
          if (!startUrlChildren[url].includes(targetUrl)) {
            startUrlChildren[url].push(targetUrl);
          }
        }
      }

      // Only enqueue links from start URLs, not from child URLs
      if (label === 'start') {
        // Process standard links with href attributes - enqueue if they contain INTERNAL_TOOL_INDICATORS or are on a different subdomain
        await enqueueLinks({
          strategy: 'same-hostname',
          transformRequestFunction: (req) => {
            const targetUrl = req.url;

            // Skip excluded URLs and the original URL itself
            if (shouldExcludeUrl(targetUrl) || targetUrl === url) return false;

            // Add to all explored URLs
            if (!allExploredUrls[url].includes(targetUrl)) {
              allExploredUrls[url].push(targetUrl);
            }

            // Check if it's a potential different service (includes subdomain differences)
            const isDifferentService = isPotentialDifferentService(url, targetUrl);

            // Also check for different subdomains explicitly
            const urlDomain = extractDomain(url);
            const targetDomain = extractDomain(targetUrl);
            const isDifferentSubdomain = urlDomain !== targetDomain;

            // Enqueue if it's a different service or on a different subdomain
            if (isDifferentService || isDifferentSubdomain) {
              // Track as a potential different service
              if (!potentialDifferentServices[url].includes(targetUrl)) {
                potentialDifferentServices[url].push(targetUrl);
                log.info(`Found potential different service for start URL ${url}: ${targetUrl}`);
              }

              req.userData = {
                label: 'child',
                parentUrl: url,
                originalDomain,
                companyName
              };
              return req;
            }

            return false;
          }
        });
      }


    },

    // Handle failures
    failedRequestHandler({ request, error, log }) {
      log.error(`Request to ${request.url} failed: ${error.message}`);
    }
  });

  // Start the crawler with initial URLs labeled as 'start'
  const initialRequests = [];
  for (const company of companies) {
    initialRequests.push({
      url: company.url,
      userData: {
        label: 'start',
        originalDomain: extractDomain(company.url),
        companyName: company.name.toLowerCase()  // Set company name for all initial requests
      }
    });
  }

  await crawler.run(initialRequests);

  // Process the results
  const results = companies.map(company => {
    const startUrl = company.url;
    // Filter out the original URL from potentialDifferentServices
    const filteredServices = (potentialDifferentServices[startUrl] || []).filter(serviceUrl =>
      serviceUrl !== startUrl
    );

    return {
      url: startUrl,
      potentialDifferentServices: filteredServices,
      allExploredUrls: allExploredUrls[startUrl] || []
    };
  });

  // Save the results
  await dataset.pushData(results);

  // Save the children of start URLs
  await dataset.pushData({
    startUrlChildren
  });

  return results;
}

// Replace the example usage section at the bottom with:
async function loadAndProcessCompanies(jsonFilePath) {
  try {
    // Read and parse the JSON file
    const fileContent = await fs.readFile(jsonFilePath, 'utf8');
    const data = JSON.parse(fileContent);

    // Extract and filter companies
    const activeCompanies = data.companies
      .filter(company => company.status !== 'Inactive')
      .map(company => ({
        name: company.name,
        url: company.website
      }));

    console.log(`Found ${activeCompanies.length} active companies to process`);

    // Process companies sequentially one by one
    const results = [];
    for (const company of activeCompanies) {
      console.log(`Processing company: ${company.name} (${company.url})`);

      // Run crawler for individual company
      const companyResult = await findCompanyServices([company]);
      results.push(companyResult[0]);
    }

    console.log(JSON.stringify(results, null, 2));

    return results;
  } catch (error) {
    console.error('Error processing companies:', error);
    throw error;
  }
}

// Example usage with command line argument for file path
const filePath = process.argv[2];
if (!filePath) {
  console.error('Please provide a path to the JSON file');
  process.exit(1);
}

loadAndProcessCompanies(filePath)
  .catch(error => {
    console.error('Error running crawler:', error);
    process.exit(1);
  });
