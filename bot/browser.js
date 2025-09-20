import puppeteer from 'puppeteer';
import { CHROMIUM_PATH, VERBOSE } from './config.js';

// * Base launch options — kept minimal & deterministic for container / server usage
const puppeteerOptions = {
  headless: 'new',
  executablePath: CHROMIUM_PATH,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-blink-features=AutomationControlled'
  ],
  defaultViewport: null
};

// * Anti‑automation fingerprint adjustments injected before any document scripts run
const bypassScript = `(function(w,n,wn){Object.defineProperty(n,'webdriver',{get:() => false});
Object.defineProperty(n,'plugins',{get:() =>[{name:"Chrome PDF Plugin"},{name:"Chrome PDF Viewer"},{name:"Native Client"}]});
Object.defineProperty(n,'languages',{get:() => ['en-US','en']});
Object.defineProperty(n,'vendor',{get:()=>'Google Inc.'});
delete wn.chrome;wn.chrome={runtime:{},loadTimes:function(){},csi:function(){},app:{}};
Object.defineProperty(n,'connection',{get:()=>({rtt:50,downlink:1.5,effectiveType:'4g'})});
Object.defineProperty(n,'permissions',{get:()=>({query:x=>Promise.resolve({state:'granted'})})});
const originalQuery = wn.DeviceOrientationEvent.requestPermission;
wn.DeviceOrientationEvent.requestPermission = originalQuery ? originalQuery.bind(wn.DeviceOrientationEvent) : (() => Promise.resolve('granted'));
Object.defineProperty(n,'hardwareConcurrency',{get:()=>4});
Object.defineProperty(n,'deviceMemory',{get:()=>8});})(window,navigator,window)`;

// * Headless scrape fallback (or primary when direct fetch fails) to obtain JSON body text
export async function scrapeJson(url) {
  if (VERBOSE) console.log(`🔍 Starting scrape for: ${url}`);
  let browser;
  try {
    browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(bypassScript);
    if (VERBOSE) console.log('📡 Navigating to URL...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    if (VERBOSE) console.log('📄 Extracting page content...');
    const text = await page.evaluate(() => document.body.innerText || '');
    if (VERBOSE) console.log(`📝 Raw text length: ${text.length}`);
    if (!text || text.length < 10) throw new Error('Empty or very short response from page'); // ! Guard: blank page
    if (VERBOSE) console.log('🔄 Parsing JSON...');
    const parsed = JSON.parse(text);
    if (VERBOSE) console.log(`✅ Successfully parsed JSON with keys: ${Object.keys(parsed).join(', ')}`);
    return parsed; // * Success
  } catch (error) {
    console.error(`❌ Scrape error for ${url}:`, error.message); // ! Scrape failed
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// * Attempt lightweight fetch first, fall back to headless scrape if blocked
export async function fetchJsonDirect(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 RivalyticsBot/1.0'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // ! Non-200 response
    return await res.json();
  } catch (e) {
    if (VERBOSE) console.log(`ℹ️ Direct fetch failed for ${url}: ${e.message}; falling back to headless scrape`);
    return await scrapeJson(url);
  }
}
