const firebase = require("firebase");
const puppeteer = require('puppeteer');
const R = require("ramda");
const {tryOrDefault, tryOrDefaultAsync} = require("tryordefault");
console.log(tryOrDefault(
    () => JSON.parse("[}"),
    {}
));


// Set the configuration for your app
// TODO: Replace with your project's config object
var config = require("./config");
firebase.initializeApp(config);

// Get a reference to the database service
var database = firebase.database();

async function getConfig() {
    let configNode = await firebase.database().ref('config').once('value');
    console.log (configNode.val());
    let config = {};
    if (!configNode.val()) {
        config = {
            from_id: "tt4761916",
            to_id: "tt0000001",
        };
        firebase.database().ref('config').set(config);
    } else {
        config = configNode.val();
    }
    return config;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getResourceTree(page) {
    var resource = await page._client.send('Page.getResourceTree');
    return resource.frameTree;
}

async function getResourceContent(page, url) {
    const { content, base64Encoded } = await page._client.send(
        'Page.getResourceContent',
        { frameId: String(page.mainFrame()._id), url },
    );
    return content;
};

async function crawlId(id, browser)
{
    const page = await browser.newPage();
    const response = await page.goto('https://www.imdb.com/title/'+id+'/');
    if (response.status() !== 200) {
        return {};
    }

    // year
    const cleanUpYear = cleanUpBracket = R.replace(/\((\d{4})\)/, "$1");
    const rawYear = await tryOrDefaultAsync(
        async () => await page.$eval("#titleYear", yearEl => yearEl.innerText),
        ""
    );
    console.log(rawYear);
    const year = cleanUpYear(rawYear);
    

    // title
    const removeYear = R.replace(rawYear, "");
    const cleanUpTitle = R.compose(
        R.trim,
        removeYear
    );
    const title = await tryOrDefaultAsync(
        async () => cleanUpTitle(await page.$eval("h1[itemprop='name']", h1 => h1.innerText)),
        ""
    );

    const parentTitle = await tryOrDefaultAsync(
        async () => await page.$eval("div.titleParent", h1 => h1.innerText),
        ""
    )

    // meta
    const subText = await page.$(".title_wrapper .subtext");
    const cleanUpDuration = R.trim;
    
    const duration = await tryOrDefaultAsync(
        async () => cleanUpDuration(await subText.$eval("[itemprop='duration']", el => el.innerText)),
        ""
    );

    const cleanUpGenre = R.map(R.trim);
    const genre = await tryOrDefaultAsync(
        async () => cleanUpGenre(await subText.$$eval("[itemprop='genre']", elements => elements.map(el => el.innerText))),
        ""
    );

    const thumbnailUrl = await tryOrDefaultAsync(
        async () => {return ""},
        ""
    );

    const thumbnailAsBase64 = await tryOrDefaultAsync(
        async () => {
            return "abc";
        },
        ""
    );

    await page.close();
    // 
    
    return {
        title: title,
        year: year,
        duration: duration,
        genres: genre,
        parent_title: parentTitle
    }
}

function composeNextId(currentId) {
    const getLetterPart = R.replace(/(\w{2})\d+/, "$1")
    const getNumberPart = R.replace(/\w{2}(\d+)/, "$1");
    const padWithLeadingZeroLength7 = R.curry(number => (new String(number)).padStart(7, "0"));
    const getNextIdNumberPart = R.compose(
        padWithLeadingZeroLength7,
        R.dec,
        parseInt,
        getNumberPart
    );
    // return getLetterPart(currentId);
    //return getNextIdNumberPart(currentId);
    const composeNextIdFromCurrentId = R.compose(
        R.join(""),
        R.values,
        R.applySpec({
            l: getLetterPart,
            n: getNextIdNumberPart
        })
    );
    const nextId = composeNextIdFromCurrentId(currentId);
    return nextId;
}

function nextId(config) {
    if (config.current_id) {
        const currentId = config.current_id;
        const nextId = composeNextId(currentId);
        config.current_id = nextId;
    } else {
        config.current_id = config.from_id;
    }
    return config.current_id;
}

async function main() {
    let config = await getConfig();
    let runtime = R.clone(config);
    
    const browser = await puppeteer.launch();
    do {
        currentId = nextId(runtime);
        console.log(currentId);
        const result = await crawlId(currentId, browser);
        console.log(result);
        firebase.database().ref('crawl/' + currentId).set(result);
        console.log("======================");
    } while(runtime.current_id !== runtime.to_id);
    await browser.close();
}

main();