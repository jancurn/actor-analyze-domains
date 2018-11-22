
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
