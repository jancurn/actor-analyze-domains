
The actor performs a crawl of web pages from a provided list of naked domain names using headless Chrome.
For each domain (e.g. `example.com`), the actor tries to load the following pages:

- `http://example.com`
- `https://example.com` (if `crawlHttpsVersion` setting is set to `true`)
- `http://www.example.com` (if `crawlWwwSubdomain` setting is set to `true`)
- `https://www.example.com` (if both `crawlHttpsVersion` and `crawlWwwSubdomain` settings are set to `true`)

Additionally, if the `crawlLinkCount` setting is greater than zero, for each domain
the crawler tries to open `crawlLinkCount` pages linked from the main page and analyse them too.

For each web page visited, the crawler extracts and saves the following information:

- Page screenshot format (if `saveScreenshot` setting is `true`). The screenshots are stored in JPEG format to save disk space.
  Note that taking screenshots is quite resource intensive and will slowdown your crawler.
- HTML content (if `saveHtmlContent` setting is `true`)
- Text body of the page (if `saveText` setting is `true`)
- HTTP response headers
- Information about SSL/TLS certificate
- Various data found on the page:
  - Page title
  - List of all links
  - List of email addresses
  - List of phone numbers

The results of the crawler are stored into the dataset - for each web page crawled
there will be one record. The optional screenshots and HTML content of pages is stored
into separate record in the key-value store.

For example, for the web page `https://example.com` the resulting record looks like this:

```
{
  "domain": "example.com",
  "url": "https://example.com",
  "response": {
    "url": "https://example.com/",
    "status": 200,
    "remoteAddress": {
      "ip": "93.184.216.34",
      "port": 443
    },
    "headers": {
      "status": "200",
      "content-encoding": "gzip",
      "accept-ranges": "bytes",
      "cache-control": "max-age=604800",
      "content-type": "text/html; charset=UTF-8",
      "date": "Thu, 22 Nov 2018 13:46:20 GMT",
      "etag": "\"1541025663+ident\"",
      "expires": "Thu, 29 Nov 2018 13:46:20 GMT",
      "last-modified": "Fri, 09 Aug 2013 23:54:35 GMT",
      "server": "ECS (dca/24D5)",
      "vary": "Accept-Encoding",
      "x-cache": "HIT",
      "content-length": "606"
    },
    "securityDetails": {
      "issuer": "DigiCert SHA2 High Assurance Server CA",
      "protocol": "TLS 1.3",
      "subjectName": "www.example.org",
      "validFrom": "2015-11-03T00:00:00.000Z",
      "validTo": "2018-11-28T12:00:00.000Z"
    }
  },
  "pageData": {
    "title": "Example Domain",
    "linkUrls": [
      "http://www.iana.org/domains/example"
    ],
    "phones": [],
    "emails": []
  },
  "screenshot": {
    "url": "https://api.apify.com/v2/key-value-stores/ACTOR_RUN_ID/records/screenshot-example.com-01.jpg",
    "length": 18550
  },
  "text": " EXAMPLE DOMAIN\nThis domain is established to be used for illustrative examples in documents.\nYou may use this domain in examples without prior coordination or asking for\npermission.\n\nMore information..."
}
```

If the web page cannot be loaded for any reason, the record contains the information about the error:

```
{
  "domain": "non-existent-domain.net",
  "url": "http://non-existent-domain.net",
  "errorMessage": "Error: net::ERR_NAME_NOT_RESOLVED at http://non-existent-domain.net\n    at navigate (/Users/jan/Projects/actor-analyse-pages/node_modules/puppeteer/lib/FrameManager.js:103:37)\n    at <anonymous>\n    at process._tickCallback (internal/process/next_tick.js:189:7)\n  -- ASYNC --\n    at Frame.<anonymous> (/Users/jan/Projects/actor-analyse-pages/node_modules/puppeteer/lib/helper.js:144:27)\n    at Page.goto (/Users/jan/Projects/actor-analyse-pages/node_modules/puppeteer/lib/Page.js:587:49)\n    at Page.<anonymous> (/Users/jan/Projects/actor-analyse-pages/node_modules/puppeteer/lib/helper.js:145:23)\n    at PuppeteerCrawler.gotoFunction (/Users/jan/Projects/actor-analyse-pages/node_modules/apify/build/puppeteer_crawler.js:30:53)\n    at PuppeteerCrawler._handleRequestFunction (/Users/jan/Projects/actor-analyse-pages/node_modules/apify/build/puppeteer_crawler.js:311:48)\n    at <anonymous>\n    at process._tickCallback (internal/process/next_tick.js:189:7)"
}
```
