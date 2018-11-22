const { URL } = require('url');
const _ = require('underscore');
const Apify = require('apify');
const utils = require('apify-shared/utilities');
const htmlToText = require('html-to-text');
// var html2plaintext = require('html2plaintext')
const parsers = require('./parsers');


const DEFAULT_RETRY_COUNT = 1;

// TODOs:
// - finish README !!!
// - support also passing list of URLs, not just domains,
//   automatically detect that (don't add www and https in that case)
// - move the parsing functions to SDK, write tests for them!


/**
 * This function normalizes the URL and removes the #fragment
 * @param url
 * @return {String}
 */
const normalizeUrl = (url) => {
    const nurl = utils.normalizeUrl(url);
    if (nurl) return nurl;

    const index = url.indexOf('#');
    if (index > 0) return url.substring(0, index);

    return url;
};


/**
 * Take a list of URLs are removes URLs going to non-HTTP(S) protocols or going to another domain.
 * @param linkUrls
 * @return {Array}
 */
const filterDomainUrls = (linkUrls, domain, omitUrls) => {
    const result = [];
    linkUrls.forEach((linkUrl) => {
        let parsed;

        // Skip invalid URLs
        try {
            parsed = new URL(linkUrl);
        } catch (e) {
            return;
        }

        // Skip non HTTP(S) links
        if (!/(http:|https:)/i.test(parsed.protocol)) return;

        // Skip links going out of the domain
        const hostname = parsed.hostname.toLowerCase();
        if (hostname !== domain && !hostname.endsWith(`.${domain}`)) return;

        // Skip URLs in omitUrls list
        if (omitUrls && omitUrls.indexOf(linkUrl) >= 0) return;

        result.push(linkUrl);
    });

    return result;
};


const processPage = async ({ input, url, page, domain, response, index }) => {
    console.log(`Processing page: ${url}`);

    const indexStr = `${index}`.padStart(2, '0');

    // Save screenshot, using low-quality JPEG to save space
    let screenshot;
    if (input.saveScreenshot) {
        const buffer = await page.screenshot({
            type: 'jpeg',
            quality: 60,
            fullPage: true
        });
        const screenshotKey = `screenshot-${domain}-${indexStr}.jpg`;
        await Apify.setValue(screenshotKey, buffer, { contentType: 'image/jpeg' });
        screenshot = {
            url: `https://api.apify.com/v2/key-value-stores/${process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID}/records/${screenshotKey}`,
            length: buffer.length,
        };
    }

    let html = await page.content();

    // Save HTML content
    let htmlDocument;
    if (input.saveHtmlContent) {
        const contentKey = `content-${domain}-${indexStr}.html`;
        await Apify.setValue(contentKey, html, { contentType: 'text/html; charset=utf-8' });
        htmlDocument = {
            url: `https://api.apify.com/v2/key-value-stores/${process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID}/records/${contentKey}`,
            length: html.length,
        };
    }

    /*let unfluffData;
    try {
        unfluffData = unfluff(html);
    } catch (e) {
        console.error(`Error generating unfluff data for ${url}: ${e.stack || e}`);
        unfluffData = {
            errorMessage: `${e}`,
        }
    }*/

    let text;
    try {
        text = htmlToText.fromString(html, { ignoreHref: true, ignoreImage: true });
    } catch (e) {
        console.error(`Error converting HTML to text for ${url}: ${e.stack || e}`);
        text = '';
    }

    // Find all links
    let linkUrls = await page.$$eval('a', (linkEls) => {
        return linkEls.map(link => link.href).filter(href => !!href);
    });
    linkUrls = linkUrls.map(normalizeUrl);
    linkUrls.sort();

    // Extract phone numbers and emails, sort them and remove duplicates
    let phones = parsers.extractPhonesFromUrls(linkUrls);
    let emails = parsers.extractEmailsFromUrls(linkUrls);
    if (text) {
        phones = phones.concat(parsers.extractPhonesFromText(text));
        emails = emails.concat(parsers.extractEmailsFromText(text));
    }
    phones.sort();
    phones = _.uniq(phones, true);
    emails.sort();
    emails = _.uniq(emails, true);

    let pageData = {
        title: await page.title(),
        linkUrls: _.uniq(linkUrls, true),
        phones,
        emails,
    };

    const securityDetailsRaw = response.securityDetails();
    const securityDetails = !securityDetailsRaw ? null : {
        issuer: securityDetailsRaw.issuer(),
        protocol: securityDetailsRaw.protocol(),
        subjectName: securityDetailsRaw.subjectName(),
        validFrom: new Date(securityDetailsRaw.validFrom() * 1000),
        validTo: new Date(securityDetailsRaw.validTo() * 1000),
    };

    return {
        domain,
        url,
        response: {
            url: response.url(),
            status: response.status(),
            remoteAddress: response.remoteAddress(),
            headers: response.headers(),
            securityDetails,
        },
        pageData,
        screenshot,
        htmlDocument,
        text: input.saveText ? text : undefined,
    };
};

const loadAndProcessPage = async ({ input, url, page, domain, index }) => {
    const retryCount = input.maxRequestRetries || DEFAULT_RETRY_COUNT;
    let lastError;

    for (let i = 0; i <= retryCount; i++) {
        try {
            console.log(`Loading page: ${url}`);

            const response = await page.goto(url);
            return await processPage({ input, url, page, domain, response, index });
        } catch (e) {
            lastError = e;
        }
    }

    // Request failed
    // TODO: Maybe restart the browser, just in case
    return {
        domain,
        url,
        errorMessage: lastError.stack || `${lastError}`,
    }
};

const DOMAIN_REGEX = /([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])\.[a-z]{2,30}(\.[a-z0-9]{2,30})?/gi;


Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    if (!input) {
        throw new Error('There is no INPUT!');
    }
    console.log('INPUT:');
    console.dir(input);

    // Download list of domains in form "example.com"
    // and create a RequestList with URLs in form "http://example.com"
    const domainsFromFile = input.domainsFileUrl
        ? await Apify.utils.downloadListOfUrls({ url: input.domainsFileUrl, urlRegExp: DOMAIN_REGEX })
        : [];

    const domainsFromInput = input.domains
        ? await Apify.utils.extractUrls({ string: input.domains, urlRegExp: DOMAIN_REGEX })
        : [];

    const allDomains = domainsFromInput.concat(domainsFromFile);
    if (allDomains.length === 0) throw new Error('Invalid INPUT: Neither "domains" nor file at "domainsFileUrl" contains any domains to crawl!');
    console.log(`Total domains: ${allDomains.length}`);

    const offset = input.domainsFileOffset || 0;
    const count = input.domainsFileCount;
    let domains = allDomains.slice(offset, count ? offset + count : undefined);

    console.log(`Domains to crawl: ${domains.length}`);

    const sources =_.map(domains, (domain) => {
        domain = domain.toLowerCase();
        return {
            url: `http://${domain}`,
            userData: { domain },
        };
    });
    const requestList = new Apify.RequestList({
        sources,
        persistStateKey: 'CRAWLER-STATE'
    });
    await requestList.initialize();


    // Start crawling
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        maxRequestRetries: input.maxRequestRetries || DEFAULT_RETRY_COUNT,

        // Use new browser for every domain
        retireInstanceAfterRequestCount: 1,

        useChrome: !!input.useChrome,
        useApifyProxy: !!input.useApifyProxy,
        apifyProxySession: Math.random(),

        launchPuppeteerFunction: async () => Apify.launchPuppeteer({
            defaultViewport: { width: 900, height: 800 },
        }),

        // For each domain, crawl one or more pages from that domain using the single Puppeteer Page instance.
        // This is to avoid the need to use RequestQueue, since we want to run this on a very large number of domains
        // and RequestQueue would contain too many items.
        // For each domain, we only crawl a few pages, so it's okay that on restarts we'll need to re-crawl these few pages.
        handlePageFunction: async ({ page, request, response }) => {
            const domain = request.userData.domain;
            let index = 0;

            const results = [
                await processPage({ url: request.url, input, page, domain, response, index: index++ }),
            ];

            // Prepare a list of additional URLs to crawl
            const crawlUrls = [];
            if (input.crawlHttpsVersion) crawlUrls.push(`https://${domain}`);
            if (input.crawlWwwSubdomain) crawlUrls.push(`http://www.${domain}`);
            if (input.crawlHttpsVersion && input.crawlWwwSubdomain) crawlUrls.push(`https://www.${domain}`);

            if (input.crawlLinkCount > 0) {
                const domainUrls = filterDomainUrls(results[0].pageData.linkUrls, domain, crawlUrls);

                // Sort the URLs in a way that URLs containing '/contact' text will get to front positions.
                // This is a heuristic to ensure we visit contact us pages if available
                // TODO: Perhaps we could prefer links with "www." or none sub-domain
                // TODO: We should all consider the link text, if it contains "contact" then follow it!!! (e.g. http://journeytomydestiny.com/?page_id=70)
                domainUrls.sort((a, b) => {
                    const aHasContact = a.indexOf('/contact') > 0;
                    const bHasContact = b.indexOf('/contact') > 0;
                    if (aHasContact && !bHasContact) return -1;
                    if (bHasContact && !aHasContact) return 1;
                    if (a < b) return -1;
                    if (a > b) return 1;
                    return 0;
                });

                for (let i = 0; i < Math.min(input.crawlLinkCount, domainUrls.length); i++) {
                    crawlUrls.push(domainUrls[i]);
                }
            }

            // Crawl the additional URLs
            for (let url of crawlUrls) {
                results.push(await loadAndProcessPage({ url, input, page, domain, index: index++ }))
            }

            // Push results from all pages together, so they are close to each other
            await Apify.pushData(results);
        },

        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Page failed ${request.retryCount + 1} times, giving up: ${request.url}`);

            const domain = request.userData.domain;

            await Apify.pushData({
                domain,
                url: request.url,
                errorMessage: _.last(request.errorMessages) || 'Unknown error',
            });
        },
    });

    await crawler.run();
});
