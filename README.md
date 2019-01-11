
The actor performs a crawl of web pages from a provided list of naked domain names using headless Chrome.
For each web page visited, the crawler extracts and saves the following information:

- Page data:
  - Page title
  - List of all links
  - [JSON+LD](https://en.wikipedia.org/wiki/JSON-LD) linked data
- Social handles
  - Emails
  - Phone numbers
  - Facebook profiles
  - LinkedIn profiles
  - Twitter profiles
  - Instagram profiles
- Screenshot (if `saveScreenshot` setting is `true`). The screenshots are stored in JPEG format to save disk space.
  Note that taking screenshots is quite resource intensive and will slow your crawler down.
- HTML content (if `saveHtml` setting is `true`)
- Text body of the page (if `saveText` setting is `true`)
- HTTP response headers
- Information about SSL/TLS certificate

For each domain (e.g. `example.com`) from the input, the actor tries to load the following pages:

- `http://example.com`
- `https://example.com` (only if `crawlHttpsVersion` setting is `true`)
- `http://www.example.com` (only if `crawlWwwSubdomain` setting is `true`)
- `https://www.example.com` (only if both `crawlHttpsVersion` and `crawlWwwSubdomain` settings are `true`)

Additionally, if the `crawlLinkCount` setting is greater than zero, for each domain
the crawler tries to open `crawlLinkCount` pages linked from the main page and analyse them too.
The crawler prefers the links that contains the `/contact` text, to increase the chance it will find
more emails, phone numbers and other social handles.

The results of the crawler are stored into a dataset. For each web page crawled
there is one record. The optional screenshots and HTML snapshots of web pages are stored
into separate records into the key-value store.

For example, for the web page `https://example.com` the resulting record in the dataset will look as follows (in JSON format):

```
{
  "domain": "example.com",
  "url": "http://example.com",
  "response": {
    "url": "http://example.com/",
    "status": 200,
    "remoteAddress": {
      "ip": "93.184.216.34",
      "port": 80
    },
    "headers": {
      "content-encoding": "gzip",
      "cache-control": "max-age=604800",
      "content-type": "text/html; charset=UTF-8",
      "date": "Sat, 24 Nov 2018 22:04:40 GMT",
      "etag": "\"1541025663+gzip\"",
      "expires": "Sat, 01 Dec 2018 22:04:40 GMT",
      "last-modified": "Fri, 09 Aug 2013 23:54:35 GMT",
      "server": "ECS (dca/24D5)",
      "vary": "Accept-Encoding",
      "x-cache": "HIT",
      "content-length": "606"
    },
    "securityDetails": null
  },
  "page": {
    "title": "Example Domain",
    "linkUrls": [
      "http://www.iana.org/domains/example"
    ],
    "linkedDataObjects": []
  },
  "social": {
    "emails": [],
    "phones": [],
    "linkedIns": [],
    "twitters": [],
    "instagrams": [],
    "facebooks": []
  },
  "screenshot": {
    "url": "https://api.apify.com/v2/key-value-stores/<actor_run_id>/records/screenshot-example.com-00.jpg",
    "length": 18572
  },
  "html": {
    "url": "https://api.apify.com/v2/key-value-stores/<actor_run_id>/records/content-example.com-00.html",
    "length": 1262
  },
  "text": " EXAMPLE DOMAIN\nThis domain is established to be used for illustrative examples in documents.\nYou may use this domain in examples without prior coordination or asking for\npermission.\n\nMore information..."
}
```

If the web page cannot be loaded for any reason, the record contains the information about the error:

```
{
  "domain": "non-existent-domain.net",
  "url": "http://non-existent-domain.net",
  "errorMessage": "Error: net::ERR_NAME_NOT_RESOLVED at http://non-existent-domain.net\n    at navigate (/Users/jan/Projects/actor-analyse-domains/node_modules/puppeteer/lib/FrameManager.js:103:37)\n    at <anonymous>\n    at process._tickCallback (internal/process/next_tick.js:189:7)\n  -- ASYNC --\n    at Frame.<anonymous> (/Users/jan/Projects/actor-analyse-domains/node_modules/puppeteer/lib/helper.js:144:27)\n    at Page.goto (/Users/jan/Projects/actor-analyse-domains/node_modules/puppeteer/lib/Page.js:587:49)\n    at Page.<anonymous> (/Users/jan/Projects/actor-analyse-domains/node_modules/puppeteer/lib/helper.js:145:23)\n    at PuppeteerCrawler.gotoFunction (/Users/jan/Projects/actor-analyse-domains/node_modules/apify/build/puppeteer_crawler.js:30:53)\n    at PuppeteerCrawler._handleRequestFunction (/Users/jan/Projects/actor-analyse-domains/node_modules/apify/build/puppeteer_crawler.js:322:48)\n    at <anonymous>\n    at process._tickCallback (internal/process/next_tick.js:189:7)"
}
```
