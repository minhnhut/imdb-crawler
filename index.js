const firebase = require("firebase");
const puppeteer = require('puppeteer');
const cheerio = require("cheerio");
const R = require("ramda");

// Set the configuration for your app
// TODO: Replace with your project's config object
var config = {
    apiKey: "AIzaSyDALqs2H6Zi3Akl6KWpR5wutESXsl8I1g4",
    databaseURL: "https://noadsplayer.firebaseio.com/",
};
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

async function crawlId(id, browser)
{
    const page = await browser.newPage();
    const response = await page.goto('https://www.imdb.com/title/'+id+'/');
    console.log(response.status());
    if (response.status() !== 200) {
        return {};
    }

    const tryOrDefault = async (f, defaultValue) => {
        try {
            return await f();
        } catch (e) {
            return defaultValue;
        }
    };

    // year
    const cleanUpYear = cleanUpBracket = R.replace(/\((\d{4})\)/, "$1");
    const rawYear = await tryOrDefault(
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
    const title = tryOrDefault(
        async () => cleanUpTitle(await page.$eval("h1[itemprop='name']", h1 => h1.innerText)),
        ""
    );

    // meta
    const subText = await page.$(".title_wrapper .subtext");
    const cleanUpDuration = R.trim;
    
    const duration = cleanUpDuration();

    const cleanUpGenre = R.map(R.trim);
    const genre = cleanUpGenre(await subText.$$eval("[itemprop='genre']", elements => elements.map(el => el.innerText)));

    await page.close();
    // 
    
    return {
        title: title,
        year: year,
        duration: duration,
        genres: genre
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
    } while(runtime.current_id !== runtime.to_id);
    await browser.close();
}

main();
// firebase.database().ref('crawl/test').set({
//     username: "New",
//     email: "test"
// });