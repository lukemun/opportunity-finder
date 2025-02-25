// For more information, see https://crawlee.dev/
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { router } from './routes.js';
import { detectSentry } from './detectors/sentry_detector.js';
import { detectDatadog } from './detectors/datadog_detector.js';
import { detectNewRelic } from './detectors/new_relic_detector.js';
import { detectBugsnag } from './detectors/bugsnag_detector.js';
import { detectRollbar } from './detectors/rollbar_detector.js';

// const startUrls = ['https://application-monitoring-react-dot-sales-engineering-sf.appspot.com/', 'https://checkr.com/', 'https://www.shutterstock.com/', 'https://www.coinbase.com/'];
const startUrls = ['https://application-monitoring-react-dot-sales-engineering-sf.appspot.com/'];
// const startUrls = ['https://www.duolingo.com/register'];

// const startUrls = ['https://crawlee.dev/'];

const crawler = new PlaywrightCrawler({
  // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
  requestHandler: router,
  // Comment this option to scrape the full website.
  maxRequestsPerCrawl: 20,
  // Add a preNavigationHook to execute JavaScript after the page loads
  preNavigationHooks: [
    async ({ page, request }) => {
      console.log(`Navigating to ${request.url}`);
    }
  ],
  // Add a postNavigationHook to execute JavaScript after the page loads
  postNavigationHooks: [
    async ({ page, request }) => {
      console.log(`Loaded ${request.url}`);

      // Initialize the final result object
      const finalResult = {
        url: request.url,
        report: {
          sentry: false,
          datadog: false,
          newRelic: false,
          bugsnag: false,
          rollbar: false
        },
        details: {}
      };

      // Check for Sentry
      try {
        const sentryData = await detectSentry(page);
        console.log('Sentry check results:');
        console.log(JSON.stringify(sentryData, null, 2));

        // Map the correct property - hasSentry to sentry
        finalResult.report.sentry = sentryData.hasSentry || false;
        if (sentryData.hasSentry) {
          finalResult.details.sentry = sentryData;
        }
      } catch (error) {
        console.error('Error retrieving Sentry data:', error.message);
      }

      // Check for Datadog
      try {
        const datadogData = await detectDatadog(page);
        console.log('Datadog check results:');
        console.log(JSON.stringify(datadogData, null, 2));

        // Map the correct property - hasDatadog to datadog
        finalResult.report.datadog = datadogData.hasDatadog || false;
        if (datadogData.hasDatadog) {
          finalResult.details.datadog = datadogData;
        }
      } catch (error) {
        console.error('Error retrieving Datadog data:', error.message);
      }

      // Check for New Relic
      try {
        const newRelicData = await detectNewRelic(page);
        console.log('New Relic check results:');
        console.log(JSON.stringify(newRelicData, null, 2));

        // Map the correct property - hasNewRelic to newRelic
        finalResult.report.newRelic = newRelicData.hasNewRelic || false;
        if (newRelicData.hasNewRelic) {
          finalResult.details.newRelic = newRelicData;
        }
      } catch (error) {
        console.error('Error retrieving New Relic data:', error.message);
      }

      // Check for Bugsnag
      try {
        const bugsnagData = await detectBugsnag(page);
        console.log('Bugsnag check results:');
        console.log(JSON.stringify(bugsnagData, null, 2));

        // Map the correct property - hasBugsnag to bugsnag
        finalResult.report.bugsnag = bugsnagData.hasBugsnag || false;
        if (bugsnagData.hasBugsnag) {
          finalResult.details.bugsnag = bugsnagData;
        }
      } catch (error) {
        console.error('Error retrieving Bugsnag data:', error.message);
      }

      // Check for Rollbar
      try {
        const rollbarData = await detectRollbar(page);
        console.log('Rollbar check results:');
        console.log(JSON.stringify(rollbarData, null, 2));

        // Map the correct property - hasRollbar to rollbar
        finalResult.report.rollbar = rollbarData.hasRollbar || false;
        if (rollbarData.hasRollbar) {
          finalResult.details.rollbar = rollbarData;
        }
      } catch (error) {
        console.error('Error retrieving Rollbar data:', error.message);
      }

      // Output the final result
      console.log('\n\n===== FINAL DETECTION REPORT =====');
      console.log(JSON.stringify(finalResult, null, 2));
      console.log('==================================\n\n');
    }
  ],
});

await crawler.run(startUrls);
