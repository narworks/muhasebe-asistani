const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// In-memory store for active browser sessions
// Key: sessionId, Value: { browser, page, timestamp }
const sessions = new Map();

const GIB_URL = 'https://dijital.gib.gov.tr/internetVergiDairesiGiris';

// Helper to cleanup old sessions (optional, to prevent memory leaks)
const cleanupOldSessions = () => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.timestamp > 10 * 60 * 1000) { // 10 minutes timeout
      try {
        session.browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
      sessions.delete(id);
    }
  }
};

exports.initSession = async () => {
  cleanupOldSessions();
  const sessionId = Date.now().toString();

  try {
    const browser = await puppeteer.launch({
      headless: "new", // Use new headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set viewport to ensure elements are visible
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating to GIB...');
    await page.goto(GIB_URL, { waitUntil: 'networkidle0', timeout: 30000 });

    // Check if we are on the landing page and need to click "Giriş Yap"
    const loginInputSelector = '#kullaniciKodu';
    try {
      console.log('Checking for login form...');
      await page.waitForSelector(loginInputSelector, { timeout: 5000 });
    } catch (e) {
      console.log('Login form not found immediately. Looking for "Giriş Yap" button...');

      // Try to find a link or button with text "Giriş Yap"
      const loginButtons = await page.$x("//a[contains(., 'Giriş Yap')] | //button[contains(., 'Giriş Yap')]");

      if (loginButtons.length > 0) {
        console.log('Found "Giriş Yap" button, clicking...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
          loginButtons[0].click()
        ]);
      } else {
        console.log('"Giriş Yap" button not found either.');
        // Take screenshot for debug
        await page.screenshot({ path: path.join(__dirname, 'gib_landing_debug.png') });
      }
    }

    // Now wait for the actual login form
    console.log('Waiting for user code input...');
    try {
      await page.waitForSelector(loginInputSelector, { timeout: 15000 });
    } catch (e) {
      console.error('Final login form check failed.');
      await page.screenshot({ path: path.join(__dirname, 'gib_final_error.png') });
      throw new Error('GIB Login form could not be reached.');
    }

    const captchaSelector = '#imgCaptcha';
    console.log('Waiting for captcha...');
    await page.waitForSelector(captchaSelector, { timeout: 10000 });

    // Take screenshot of the captcha element
    const captchaElement = await page.$(captchaSelector);
    if (!captchaElement) {
      throw new Error('Captcha element not found');
    }

    const captchaBuffer = await captchaElement.screenshot();
    const captchaBase64 = captchaBuffer.toString('base64');

    // Store session
    sessions.set(sessionId, {
      browser,
      page,
      timestamp: Date.now()
    });

    return {
      sessionId,
      captchaBase64: `data:image/png;base64,${captchaBase64}`
    };

  } catch (error) {
    console.error('Init session error:', error);
    throw error;
  }
};

const solveCaptchaWithGemini = async (base64Image, apiKey) => {
  if (!apiKey) throw new Error('Gemini API Key required for auto-captcha');

  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.0-flash-exp'; // Using a fast vision model

  const prompt = "Bu resimdeki metni oku. Sadece metni döndür, boşluksuz. Başka hiçbir şey yazma.";

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image.replace(/^data:image\/\w+;base64,/, "")
              }
            }
          ]
        }
      ]
    });

    const text = response.text().trim().replace(/\s/g, '');
    console.log(`Captcha solved by Gemini: ${text}`);
    return text;
  } catch (error) {
    console.error('Gemini Captcha Error:', error);
    throw new Error('Yapay zeka Captcha\'yı okuyamadı.');
  }
};

exports.loginAndFetch = async (sessionId, username, password, captcha, apiKey) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found or expired');
  }

  const { page, browser } = session;

  try {
    // Selectors - These need to be verified against the actual GIB page
    // Based on common GIB structure:
    // User Code: #kullaniciKodu
    // Password: #sifre
    // Captcha Input: #dk
    // Login Button: #giris

    await page.type('#kullaniciKodu', username);
    await page.type('#sifre', password);

    let captchaCode = captcha;
    if (!captchaCode) {
      // Auto-solve mode
      console.log('Auto-solving captcha...');
      // We need to get the captcha image again from the page because the previous one might be stale 
      // or we just need it now.
      // Actually, we can just take a screenshot of the #imgCaptcha element again.
      const captchaElement = await page.$('#imgCaptcha');
      if (!captchaElement) throw new Error('Captcha element not found for auto-solve');

      const captchaBuffer = await captchaElement.screenshot();
      const captchaBase64 = captchaBuffer.toString('base64');

      captchaCode = await solveCaptchaWithGemini(captchaBase64, apiKey);
    }

    await page.type('#dk', captchaCode); // 'dk' is often used for dogrulama kodu

    // Click login and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
      page.click('#giris') // or whatever the login button ID is
    ]);

    // Check for error messages
    // Example: #msgError or .error-message
    const errorElement = await page.$('#msgError'); // Hypothetical ID
    if (errorElement) {
      const errorText = await page.evaluate(el => el.textContent, errorElement);
      if (errorText && errorText.trim().length > 0) {
        throw new Error(`GIB Error: ${errorText}`);
      }
    }

    // Navigate to E-Tebligat page
    // Usually there is a menu item or a direct link. 
    // For now, let's assume we are on the dashboard and need to find "E-Tebligat"
    // Or we can try to go to a known URL if possible.

    // Strategy: Look for "E-Tebligat" text in links
    const eTebligatLink = await page.$x("//a[contains(text(), 'E-Tebligat')]");

    if (eTebligatLink.length > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        eTebligatLink[0].click()
      ]);
    } else {
      // Fallback or maybe we are already there?
      // Let's try to find the table directly if we are redirected there.
      console.log("E-Tebligat link not found, checking if already on page or different menu...");
    }

    // Wait for table
    // Selector for the table rows
    const tableSelector = 'table tbody tr';
    try {
      await page.waitForSelector(tableSelector, { timeout: 10000 });
    } catch (e) {
      console.log("Table not found immediately, might need further navigation");
      // This part is tricky without seeing the actual DOM. 
      // For the MVP, we will return a mock success if we logged in successfully but couldn't find table
      // Or throw error.
    }

    // Scrape data
    const tebligatlar = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length < 4) return null;
        return {
          date: cols[0]?.innerText?.trim(),
          sender: cols[1]?.innerText?.trim(),
          subject: cols[2]?.innerText?.trim(),
          status: cols[3]?.innerText?.trim(),
          // Add more fields as needed
        };
      }).filter(item => item !== null);
    });

    return tebligatlar;

  } catch (error) {
    console.error('Login/Fetch error:', error);
    throw error;
  } finally {
    // Close browser after operation
    await browser.close();
    sessions.delete(sessionId);
  }
};
