const _ = require('underscore');

// Taken from https://zapier.com/blog/extract-links-email-phone-regex/
const EMAIL_REGEX = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/g;

// Supports 'tel://123...', 'tel:/123...' and 'tel:123...'
const PHONE_URL_PREFIX_REGEX = /^tel:(\/)?(\/)?/i;

const EMAIL_URL_PREFIX_REGEX = /^mailto:/i;


// Add more formats as needed
const PHONE_REGEXS = [
    '[0-9]{6,15}', // 775123456

    '[0-9]{2,4}-[0-9]{2,4}-[0-9]{2,4}-[0-9]{2,6}', // 413-577-1234-564
    '[0-9]{2,4}-[0-9]{2,4}-[0-9]{2,6}', // 413-577-1234
    '[0-9]{2,4}-[0-9]{2,6}', // 413-577

    '[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,6}', // 413.577.1234.564
    '[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,6}', // 413.577.1234
    '[0-9]{2,4}\\.[0-9]{2,6}', // 413.577

    '[0-9]{2,4} [0-9]{2,4} [0-9]{2,6}', // 413 577 1234
    '[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,6}', // 413 577 1234 564

    '([0-9]{1,4}( )?)?\\([0-9]{2,4}\\)( )?[0-9]{2,4}(( )?-)?( )?[0-9]{2,6}', // 1(413)555-2378 or 1 (413) 555-2378 or 1 (413) 555 2378 or (303) 494-2320

    // TODO: (262) 955-95-79
    // TODO: skip strings that looks like dates (e.g. "2005-11-22")

];


// NOTE: All phones might be prefixed with '+' or '00'
for (let i=0; i<PHONE_REGEXS.length; i++) {
    PHONE_REGEXS[i] = `(00|\\+)?${PHONE_REGEXS[i]}`;
}

const PHONE_REGEX = new RegExp(`(${PHONE_REGEXS.join('|')})`, 'ig');


const extractPhonesFromText = exports.extractPhonesFromText = (text) => {
    let phones = (text ? text.match(PHONE_REGEX) : []) || [];

    // Skip too short phones, they are most likely incorrect
    phones = phones.filter((phone) => {
        return phone && phone.length >= 7;
    });

    return phones;
};

/**
 * Goes through an array of URLs and extracts phone numbers from it.
 * For example, for link `tel://123456789` it extracts `123456789`.
 */
const extractPhonesFromUrls = (urls) => {
    const phones = [];
    urls.forEach((linkUrl) => {
        if (linkUrl && PHONE_URL_PREFIX_REGEX.test(linkUrl)) {
            phones.push(linkUrl.replace(PHONE_URL_PREFIX_REGEX, ''));
        }
    });
    return phones;
};

exports.extractPhonesFromUrls = extractPhonesFromUrls;

const extractEmailsFromUrls = (urls) => {
    const emails = [];
    urls.forEach((linkUrl) => {
        if (linkUrl && EMAIL_URL_PREFIX_REGEX.test(linkUrl)) {
            const email = linkUrl.replace(EMAIL_URL_PREFIX_REGEX, '');
            if (EMAIL_REGEX.test(email)) {
                emails.push(email);
            }
        }
    });
    return emails;
};

exports.extractEmailsFromUrls = extractEmailsFromUrls;


const extractEmailsFromText = exports.extractEmailsFromText = (text) => {
    const emails = text ? text.match(EMAIL_REGEX) : [];
    return emails ? emails : [];
};


/*
console.dir(PHONE_REGEX);

const testPhones = `
775123456
+420775123456
00420775123456

413-577-1234
981-413-777-8888
413.233.2343
562-3113
401 311 7898
1 (413) 555-2378
1(413)555-2378
1 (413) 555-2378
1 (413) 555 2378

4135552375

+44 7911 123456

123-456-789
123 456 789
  123.456.789

(000)000-0000
(000)000 0000
(000)000.0000
(000) 000-0000
(000) 000 0000
(000) 000.0000

000-0000
000 0000
000.0000

0000000
0000000000
(000)0000000

`;

if (testPhones) {
    console.log('Test found phone numbers:');
    let m;
    do {
        m = PHONE_REGEX.exec(testPhones);
        if (m) console.log(m[0]);
    } while (m);
}

process.exit(0);

*/
