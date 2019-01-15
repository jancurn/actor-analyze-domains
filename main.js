const { URL } = require('url');
const _ = require('underscore');
const Apify = require('apify');
const utils = require('apify-shared/utilities');


const DEFAULT_RETRY_COUNT = 1;

// TODOs:
// - Better unique pages handling and retry logic for sub-links (restart browser!)
// - Prefer also sublinks that contain "Contact" in text, and then randomize the other links
//   to have a better chance of finding something
// - Add validation of input - if invalid string is passed (e.g. URL), then throw an error !
// - Improve extraction of text, the current way removes spaces between words where they should be kept


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
            fullPage: true,
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
    if (input.saveHtml) {
        const contentKey = `content-${domain}-${indexStr}.html`;
        await Apify.setValue(contentKey, html, { contentType: 'text/html; charset=utf-8' });
        htmlDocument = {
            url: `https://api.apify.com/v2/key-value-stores/${process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID}/records/${contentKey}`,
            length: html.length,
        };
    }

    let socialHandles = null;
    let parseData = {};
    try {
        socialHandles = Apify.utils.social.parseHandlesFromHtml(html, parseData);
    } catch (e) {
        console.error(`Error parsing social handles from HTML for ${url}: ${e.stack || e}`);
        if (!parseData.text) parseData.text = `Error occurred while parsing the HTML: ${e.stack || e}`;
    }

    // Find all links (skip "javascript:" links)
    // NOTE: We're using Puppeteer instead of Cheerio parsed data, since href is made absolute here!
    let linkUrls = await page.$$eval('a', (linkEls) => {
        return linkEls.map(link => link.href).filter(href => !!href && !/^javascript:/i.test(href));
    });
    // If the page contains something like <meta http-equiv="refresh" content="15;url=xxx.html">,
    // then add the target to the list of links too.
    let metaRefreshUrls = await page.$$eval('head meta[http-equiv=refresh]', (metas) => {
        const urls = [];
        metas.map(meta => meta.getAttribute('content')).filter(content => !!content).forEach((content) => {
            const matches = /^\s*[0-9]+\s*;\s*url\s*=\s*(.*)$/i.exec(content);
            if (matches) {
                const url = matches[1];
                urls.push(new URL(url, window.location.href).toString());
            }
        });
        return urls;
    });
    metaRefreshUrls.forEach((url) => linkUrls.push(url));

    linkUrls = linkUrls.map(normalizeUrl);
    linkUrls.sort();

    // Extract JSON-LD Linked Data
    // $('script[type="application/ld+json"]');
    let linkedDataObjects = await page.$$eval('script[type="application/ld+json"]', (elems) => {
        const objs = [];
        elems.forEach((elem) => {
            try {
                objs.push(JSON.parse(elem.text));
            } catch (e) {}
        });
        return objs;
    });

    // Get phone numbers from JSON+LD data
    linkedDataObjects.forEach((obj) => {
        if (obj && obj.telephone) socialHandles.phones.push(obj.telephone);
    });

    const pageData = {
        title: await page.title(),
        linkUrls: _.uniq(linkUrls, true),
        linkedDataObjects,
    };


    /*
    // Extract tree of frames
    const dumpFrameTree = async (frame, parentRec) => {
        const rec = {
            url: frame.url(),
            name: frame.name(),
            title: await frame.title(),
            childFrames: [],
        };
        for (let childFrame of frame.childFrames()) {
            await dumpFrameTree(childFrame, rec);
        }
        if (parentRec) {
            parentRec.childFrames.push(rec);
        }
        return rec;
    };
    pageData.mainFrame = await dumpFrameTree(page.mainFrame(), null);
    */

    // Search also child FRAMEs to find social handles
    if (input.considerChildFrames) {
        for (let childFrame of page.mainFrame().childFrames()) {
            const html = await childFrame.content();
            let childSocialHandles = null;
            let childParseData = {};
            try {
                childSocialHandles = Apify.utils.social.parseHandlesFromHtml(html, childParseData);

                // Extract phones from links separately, they are high-certainty
                const childLinkUrls = await childFrame.$$eval('a', (linkEls) => {
                    return linkEls.map(link => link.href).filter(href => !!href);
                });

                ['emails', 'phones', 'phonesUncertain', 'linkedIns', 'twitters', 'instagrams', 'facebooks'].forEach((field) => {
                    socialHandles[field] = socialHandles[field].concat(childSocialHandles[field]);
                });
            } catch (e) {
                console.error(`Error parsing social handles from HTML for ${url}: ${e.stack || e}`);
                if (!childParseData.text) childParseData.text = `Error occurred while parsing the HTML: ${e.stack || e}`;
            }
            parseData.text += `\n\n${childParseData.text}`;
        }

        ['emails', 'phones', 'phonesUncertain', 'linkedIns', 'twitters', 'instagrams', 'facebooks'].forEach((field) => {
            socialHandles[field] = _.uniq(socialHandles[field]);
        });
    }

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
        page: pageData,
        social: socialHandles,
        screenshot,
        html: htmlDocument,
        text: input.saveText ? parseData.text : undefined,
    };
};

const loadAndProcessPage = async (state) => {
    const { input, url, page, domain, index, puppeteerPool } = state;
    const retryCount = input.maxRequestRetries || DEFAULT_RETRY_COUNT;
    let lastError;

    for (let i = 0; i <= retryCount; i++) {
        try {
            console.log(`Loading page: ${url}`);

            const response = await page.goto(url);
            return await processPage({ input, url, page, domain, response, index });
        } catch (e) {
            lastError = e;

            // The original page might be in invalid state, so just try to open new one
            state.page = await puppeteerPool.newPage();
            await page.close().catch(() => {});
        }
    }

    // Request failed
    return {
        domain,
        url,
        errorMessage: lastError.stack || `${lastError}`,
    }
};

const DOMAIN_REGEX = /([a-z0-9]|[a-z0-9][a-z0-9\-]*[a-z0-9])\.[a-z]{2,30}(\.[a-z0-9]{2,30})?/gi;

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    if (!input) {
        throw new Error('There is no INPUT!');
    }
    console.log('INPUT:');
    console.dir(input);

    // Download list of domains in form "example.com"
    // and create a RequestList with URLs in form "http://example.com"
    let domainsFromFile;
    try {
        domainsFromFile = input.domainsFileUrl
            ? await Apify.utils.downloadListOfUrls({ url: input.domainsFileUrl, urlRegExp: DOMAIN_REGEX })
            : [];
    } catch (e) {
        console.error(`Error downloading the file with the list of domains from ${input.domainsFileUrl}`);
        throw e;
    }
    const offset = input.domainsFileOffset || 0;
    const count = input.domainsFileCount;
    domainsFromFile = domainsFromFile.slice(offset, count ? offset + count : undefined);

    const domainsFromInput = input.domains
        ? await Apify.utils.extractUrls({ string: input.domains, urlRegExp: DOMAIN_REGEX })
        : [];

    const allDomains = domainsFromInput.concat(domainsFromFile);
    if (allDomains.length === 0) throw new Error('Invalid INPUT: Neither "domains" nor file at "domainsFileUrl" contains any domains to crawl!');
    console.log(`Number of input domains: ${allDomains.length}`);

    const sources =_.map(allDomains, (domain) => {
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
    console.log(`Number of unique domains: ${requestList.length()}`);


    // Start crawling
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        maxRequestRetries: input.maxRequestRetries || DEFAULT_RETRY_COUNT,

        // Use new browser for every domain
        retireInstanceAfterRequestCount: 1,

        launchPuppeteerOptions: {
            defaultViewport: { width: 900, height: 800 },
            useChrome: !!input.useChrome,
            useApifyProxy: !!input.useApifyProxy,
            apifyProxySession: Math.random(),
        },

        // For each domain, crawl one or more pages from that domain using the single Puppeteer Page instance.
        // This is to avoid the need to use RequestQueue, since we want to run this on a very large number of domains
        // and RequestQueue would contain too many items.
        // For each domain, we only crawl a few pages, so it's okay that on restarts we'll need to re-crawl these few pages.
        handlePageFunction: async ({ page, request, response, puppeteerPool }) => {
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
                const domainUrls = filterDomainUrls(results[0].page.linkUrls, domain, crawlUrls);

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
            const state = { input, page, domain, puppeteerPool };
            for (let url of crawlUrls) {
                state.index = index++;
                state.url = url;
                results.push(await loadAndProcessPage(state))
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
