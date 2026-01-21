import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { CHROMIUM_PATH, VERBOSE } from './config.js';

// * Base launch options for JSON scraping — with anti-detection measures
const scrapingOptions = {
  headless: true,
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

// * Separate launch options for screenshots — mimics chromedp approach (simpler, no stealth needed)
const screenshotOptions = {
  headless: true,
  executablePath: CHROMIUM_PATH,
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled'
  ],
  defaultViewport: { width: 1920, height: 1080 }
};

// * Anti‑automation fingerprint adjustments injected before any document scripts run (for scraping only)
const bypassScript = `(function(w,n,wn){Object.defineProperty(n,'webdriver',{get:() => false});
Object.defineProperty(n,'plugins',{get:() =>[{name:"Chrome PDF Plugin"},{name:"Chrome PDF Viewer"},{name:"Native Client"}]});
Object.defineProperty(n,'languages',{get:() => ['en-US','en']});
Object.defineProperty(n,'vendor',{get:()=>'Google Inc.'});
Object.defineProperty(n,'maxTouchPoints',{get:() => 0});
Object.defineProperty(n,'hardwareConcurrency',{get:() => 8});
Object.defineProperty(n,'deviceMemory',{get:() => 8});
w.chrome={runtime:{},app:{isInstalled:false},csi:function(){},loadTimes:function(){return{firstPaintTime:Date.now()/1e3}}};
const o=wn.permissions.query;wn.permissions.query=function(p){return p.name==='notifications'?Promise.resolve({state:Notification.permission}):o(p)};
})(window,navigator,window.navigator);`;

// * Create a configured browser page with anti-detection measures (for JSON scraping)
async function createConfiguredPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(bypassScript);
  return page;
}

// * Headless scrape fallback (or primary when direct fetch fails) to obtain JSON body text
export async function scrapeJson(url) {
  if (VERBOSE) console.log(`🔍 Starting scrape for: ${url}`);
  let browser;
  try {
    browser = await puppeteer.launch(scrapingOptions);
    const page = await createConfiguredPage(browser);
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // ! Non-200 response
    return await res.json();
  } catch (e) {
    if (VERBOSE) console.log(`ℹ️ Direct fetch failed for ${url}: ${e.message}; falling back to headless scrape`);
    return await scrapeJson(url);
  }
}

// * Take a screenshot of a tracker.gg match scoreboard using Puppeteer
// Uses a simpler browser config (mimics chromedp approach) without heavy stealth measures
// Returns a PNG buffer suitable for Discord attachments
export async function screenshotMatchScoreboard(matchId) {
  const matchUrl = `https://tracker.gg/marvel-rivals/matches/${matchId}`;
  
  console.log(`📸 Capturing scoreboard screenshot for match: ${matchId}`);
  console.log(`🌐 URL: ${matchUrl}`);
  
  let browser;
  try {
    browser = await puppeteer.launch(screenshotOptions);
    const page = await browser.newPage();
    
    // Set user agent (same as chromedp)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Use 1x scale factor
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    
    console.log('📡 Navigating to URL...');
    await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait 3 seconds for page to fully load (like chromedp)
    await new Promise(r => setTimeout(r, 3000));
    
    // Zoom out to 75% using CSS zoom
    await page.evaluate(() => {
      document.body.style.zoom = '0.75';
    });
    
    // Wait 2 more seconds after zoom (like chromedp)
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('📷 Taking full page screenshot...');
    const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
    
    console.log(`📐 Raw screenshot size: ${screenshotBuffer.length} bytes`);
    
    // Get image dimensions for cropping
    const metadata = await sharp(screenshotBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;
    
    console.log(`📐 Image dimensions: ${width}x${height}`);
    
    // Fixed crop values (in pixels)
    const topCrop = 230;
    const bottomCrop = 230;
    const leftCrop = 150;
    const rightCrop = 650;
    
    const cropWidth = width - leftCrop - rightCrop;
    const cropHeight = height - topCrop - bottomCrop;
    
    console.log(`✂️ Cropping: left=${leftCrop}, top=${topCrop}, width=${cropWidth}, height=${cropHeight}`);
    
    const croppedBuffer = await sharp(screenshotBuffer)
      .extract({ left: leftCrop, top: topCrop, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();
    
    console.log(`✅ Screenshot captured and cropped: ${croppedBuffer.length} bytes`);
    
    return croppedBuffer;
    
    return croppedBuffer;
  } catch (error) {
    console.error(`❌ Screenshot error for match ${matchId}:`, error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
