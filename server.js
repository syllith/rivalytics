// server.js
import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { v4 as uuid } from 'uuid'
import puppeteer from 'puppeteer'
import dotenv from 'dotenv'

dotenv.config()

const IMAGES_DIR = process.env.IMAGES_DIR || '/hdd/docker/paddleocr/images'
const API_LOG_PATH = process.env.API_LOG_PATH || '/hdd/webroot/rivalytics/api-access.log'
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium'
const DOCKER_CWD = process.env.DOCKER_CWD || '/hdd/docker'

const app = express()
app.use(express.json())

// ensure upload directory exists
fs.mkdirSync(IMAGES_DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
    filename: (_req, file, cb) =>
      cb(null, `${uuid()}${path.extname(file.originalname)}`),
  }),
})

app.get('/', (_req, res) => res.send('OK'))

// API access logging middleware
app.use((req, res, next) => {
  const logLine = `[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.originalUrl}\n`;
  fs.appendFile(API_LOG_PATH, logLine, err => {
    if (err) console.error('API log error:', err);
  });
  next();
});

// OCR endpoint (unchanged)
app.post('/api/ocr', upload.single('file'), (req, res) => {
  const filename = req.file.filename
  const containerPath = `/data/images/${filename}`
  const pythonScript = `
import json
from paddleocr import PaddleOCR
ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=True, show_log=False)
res = ocr.ocr('${containerPath}', cls=True)
out=[]
for line in res:
    for box,(txt,score) in line:
        out.append({"text": txt, "score": float(score), "box": box})
print(json.dumps(out))
`.trim()

  const proc = spawn(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.yaml',
      'exec',
      '-T',
      'paddleocr',
      'python',
      '-',
    ],
    { cwd: DOCKER_CWD, stdio: ['pipe', 'pipe', 'pipe'] }
  )

  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0)
  proc.stdin.write(pythonScript)
  proc.stdin.end()
  proc.stdout.on('data', d => { stdout = Buffer.concat([stdout, d]) })
  proc.stderr.on('data', d => { stderr = Buffer.concat([stderr, d]) })

  proc.on('close', code => {
    fs.unlink(path.join(IMAGES_DIR, filename), () => { })
    if (code !== 0) {
      return res.status(500).send(stderr.toString() || `exit status ${code}`)
    }
    try {
      const parsed = JSON.parse(stdout.toString())
      res.json({ raw: stdout.toString(), result: parsed })
    } catch {
      res.status(200).send(stdout.toString())
    }
  })

  proc.on('error', err => {
    fs.unlink(path.join(IMAGES_DIR, filename), () => { })
    res.status(500).send(err.message)
  })
})

// ——— New: scrape career segments without API key ———



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

// Shared Puppeteer launch options and helper
const puppeteerOptions = {
  headless: true,
  executablePath: CHROMIUM_PATH,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled'
  ],
};

async function scrapeJson(url) {
  const browser = await puppeteer.launch(puppeteerOptions);
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(bypassScript);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const text = await page.evaluate(() => document.body.innerText || '');
    return JSON.parse(text);
  } finally {
    await browser.close();
  }
}

// ── RAW career segments ──
app.get('/api/rivals/:username/career', async (req, res) => {
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${req.params.username}/segments/career?mode=all`;
  try {
    const json = await scrapeJson(url);
    res.json(json);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── RAW match history ──
app.get('/api/rivals/:username/matches', async (req, res) => {
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${req.params.username}?season=4`;
  try {
    const json = await scrapeJson(url);
    res.json(json);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── RAW ranked history ──
app.get('/api/rivals/:username/ranked', async (req, res) => {
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${req.params.username}/stats/overview/ranked`;
  try {
    const json = await scrapeJson(url);
    res.json(json);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
})

app.listen(8099, () =>
  console.log('🚀 Listening on http://localhost:8099')
)
