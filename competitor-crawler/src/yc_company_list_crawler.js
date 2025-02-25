// Y Combinator Companies Crawler
// This script crawls the YC companies directory and extracts company information
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { setTimeout } from 'timers/promises';

const batchList = [
  'X25',
  'W25',
  'F24',
  'S24',
  'W24',
  'S23',
  'W23',
  'S22',
  'W22',
  'S21',
  'W21',
  'S20',
  'W20',
  'S19',
  'W19',
  'S18',
  'W18',
  'S17',
  'W17',
  'IK12',
  'S16',
  'W16',
  'S15',
  'W15',
  'S14',
  'W14',
  'S13',
  'W13',
  'S12',
  'W12',
  'S11',
  'W11',
  'S10',
  'W10',
  'S09',
  'W09',
  'S08',
  'W08',
  'S07',
  'W07',
  'S06',
  'W06',
  'S05',
]

// Create a dataset to store the results
const dataset = await Dataset.open('yc-companies');

// Track total companies across all batches
let totalCompaniesOverall = 0;
const batchStats = {};

// Store companies by batch
const companiesByBatch = {};

// Initialize the crawler
const crawler = new PlaywrightCrawler({
  // Maximum number of concurrent requests
  headless: false,
  autoscaledPoolOptions: {
    maxConcurrency: 20,
    desiredConcurrency: 20,
  },
  launchContext: {
    launchOptions: {
      viewport: {
        width: 800,
        height: 600
      }
    }
  },
  browserPoolOptions: {
    // Keep more pages open per browser
    maxOpenPagesPerBrowser: 10,

    // Only retire browsers after processing many pages
    retireBrowserAfterPageCount: 20,

    // Keep inactive browsers alive longer
    closeInactiveBrowserAfterSecs: 200,
  },
  // Handler for each request
  async requestHandler({ page, request, enqueueLinks }) {
    console.log(`Processing: ${request.url}`);

    // If this is the main page or a batch page
    if (request.label === 'BATCH') {
      const batchName = request.userData.batch;
      console.log(`Processing companies for batch ${batchName}`);

      // Initialize array for this batch if it doesn't exist
      if (!companiesByBatch[batchName]) {
        companiesByBatch[batchName] = [];
      }

      // wait for network to be idle
      await page.waitForLoadState('networkidle');

      // Add a small delay to ensure all content is loaded
      await setTimeout(1000);

      // Implement infinite scrolling to load all companies
      let previousCompanyCount = 0;
      let currentCompanyCount = await page.$$eval('a[class="_company_i9oky_355"], .CompaniesGrid_company__Mf_hV a', (links) => links.length);
      console.log(`Initial company count: ${currentCompanyCount}`);

      // Keep scrolling until no new companies are loaded
      let noChangeCounter = 0;
      while (noChangeCounter < 3) { // Try a few times before giving up
        previousCompanyCount = currentCompanyCount;

        // Scroll to the bottom of the page
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        await page.waitForTimeout(200);

        // Get the new count
        currentCompanyCount = await page.$$eval('a[class="_company_i9oky_355"], .CompaniesGrid_company__Mf_hV a', (links) => links.length);
        // console.log(`Current company count: ${currentCompanyCount}`);

        // Check if we've loaded new companies
        if (currentCompanyCount > previousCompanyCount) {
          noChangeCounter = 0; // Reset counter if we found new companies
        } else {
          noChangeCounter++; // Increment counter if no new companies were loaded
          // console.log(`No new companies loaded (attempt ${noChangeCounter}/3)`);
        }
      }

      console.log(`Finished scrolling. Total companies found for batch ${batchName}: ${currentCompanyCount}`);

      // Store batch statistics
      batchStats[batchName] = currentCompanyCount;
      totalCompaniesOverall += currentCompanyCount;

      // Extract company names and links
      const companyLinks = await page.$$eval('a[class="_company_i9oky_355"], .CompaniesGrid_company__Mf_hV a', (links) =>
        links.map(link => link.href).filter(href => href.includes('/companies/'))
      );

      console.log(`Found ${companyLinks.length} companies on this page`);

      // Queue each company detail page
      for (const link of companyLinks) {
        await crawler.addRequests([{
          url: link,
          label: 'COMPANY',
          userData: {
            batch: request.userData.batch,
            referrer: request.url
          }
        }]);
      }

    }

    // If this is a company detail page
    else if (request.label === 'COMPANY') {
      console.log(`Processing company detail page: ${request.url}`);
      const batchName = request.userData.batch;

      try {
        // Wait for the company information to load
        await page.waitForSelector('h1', { timeout: 30000 });

        // Extract company name (use the one from userData if available)
        const companyName = request.userData.name || await page.$eval('h1', el => el.textContent.trim());

        // Grab the company description
        let companyDescription = '';
        try {
          companyDescription = await page.$eval('div[class="prose hidden max-w-full md:block"]', el => el.textContent.trim());
        } catch (e) {
          console.log(`No description found for ${companyName}`);
        }

        // Extract all metadata from the pills div
        let batchInfo = '';
        let status = '';
        let industries = [];
        let locations = [];

        try {
          // Get all text from the div with pills
          const metadataText = await page.$eval('div[class*="align-center flex flex-row flex-wrap gap-x-2 gap-y-2"]', (div) => {
            // Extract all text from all child elements
            const allText = [];

            // Get batch info
            const batchElement = div.querySelector('div[class*="yc-tw-Pill"] span');
            const batchInfo = batchElement ? batchElement.textContent.trim() : '';
            if (batchInfo) allText.push(`Batch: ${batchInfo}`);

            // Get status (Public, Acquired, etc.) - it's the pill with the colored dot
            const statusElement = div.querySelector('div[class*="yc-tw-Pill"]:not(:has(a)) div.flex.flex-row.items-center.justify-between');
            const status = statusElement ? statusElement.textContent.trim() : '';
            if (status) allText.push(`Status: ${status}`);

            // Get all industry pills
            const industryPills = Array.from(div.querySelectorAll('a[href^="/companies/industry/"] div[class*="yc-tw-Pill"]'));
            const industries = industryPills.map(pill => pill.textContent.trim());
            if (industries.length) allText.push(`Industries: ${industries.join(', ')}`);

            // Get all location pills
            const locationPills = Array.from(div.querySelectorAll('a[href^="/companies/location/"] div[class*="yc-tw-Pill"]'));
            const locations = locationPills.map(pill => pill.textContent.trim());
            if (locations.length) allText.push(`Locations: ${locations.join(', ')}`);

            return {
              fullText: allText.join(' | '),
              batch: batchInfo,
              status: status,
              industries: industries,
              locations: locations
            };
          });

          batchInfo = metadataText.batch;
          status = metadataText.status;
          industries = metadataText.industries;
          locations = metadataText.locations;

          console.log(`Metadata: ${metadataText.fullText}`);
        } catch (e) {
          console.log(`Error extracting metadata for ${companyName}: ${e.message}`);
        }

        // grab linkedin url
        let linkedinUrl = '';
        try {
          linkedinUrl = await page.$eval('a[href^="https://www.linkedin.com/company/"]', el => el.href);
        } catch (e) {
          console.log(`No LinkedIn URL found for ${companyName}`);
        }

        // Extract website link from the specific element structure
        let websiteLink = '';
        try {
          // Target the specific div structure containing the website link
          websiteLink = await page.$eval('div[class*="group flex flex-row items-center px-3 leading-none text-linkColor"] a', el => el.href);
        } catch (e) {

          console.log(`No website link found for ${companyName}`);

        }

        // Save the updated data with the website
        const companyData = {
          name: companyName,
          website: websiteLink,
          ycBatch: request.userData.batch || batchInfo || '',
          status: status,
          industries: industries,
          locations: locations,
          ycProfileUrl: request.url,
          linkedinUrl: linkedinUrl,
          description: companyDescription,
        };

        // console.log('Extracted company data:', companyData);

        // Add to the batch array instead of directly to dataset
        if (companiesByBatch[batchName]) {
          companiesByBatch[batchName].push(companyData);
        } else {
          companiesByBatch[batchName] = [companyData];
        }

      } catch (error) {
        console.error(`Error processing company page ${request.url}:`, error);
      }
    }
  },

  // Handle failures
  failedRequestHandler({ request }) {
    console.error(`Request ${request.url} failed`);
  },
});

// Generate batch URLs and start the crawler
const startUrls = batchList.map(batch => ({
  url: `https://www.ycombinator.com/companies?batch=${batch}`,
  label: 'BATCH',
  userData: {
    batch: batch
  }
}));

// Start the crawler with all batch URLs
await crawler.run(startUrls);


// Save each batch as a separate item in the dataset
console.log('\nSaving batch data to dataset...');
for (const [batch, companies] of Object.entries(companiesByBatch)) {
  await dataset.pushData({
    batch: batch,
    companyCount: companies.length,
    companies: companies
  });
  console.log(`Saved batch ${batch} with ${companies.length} companies`);
}

// Print summary statistics
console.log('\n===== BATCH STATISTICS =====');
for (const batch of batchList) {
  const count = (companiesByBatch[batch] || []).length;
  batchStats[batch] = count;
  console.log(`${batch}: ${count} companies`);
}
console.log(`\nTOTAL COMPANIES ACROSS ALL BATCHES: ${totalCompaniesOverall}`);

console.log('\nCrawler finished');
console.log(`Results saved to ${dataset.localStoragePath}`);
