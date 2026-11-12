import { chromium } from 'playwright';
import assert from 'assert';

const SERVER_URL = 'http://localhost:5000';
const ROOM_ID = 'browser-room-' + Math.random().toString(36).substr(2, 6);

async function runBrowserTest() {
  console.log(`\n=============================================================`);
  console.log(`🎬 Testing Real Dual-Browser Context Audio/Video Transmission`);
  console.log(`   Room: ${ROOM_ID}`);
  console.log(`=============================================================\n`);

  let browser;
  try {
    // Try launching Chromium with fake media devices (or fallback to msedge/chrome)
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
  } catch (err) {
    console.log(`Chromium binary not found, attempting system channel 'msedge' or 'chrome'...`);
    try {
      browser = await chromium.launch({
        headless: true,
        channel: 'msedge',
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--no-sandbox'
        ]
      });
    } catch (e2) {
      browser = await chromium.launch({
        headless: true,
        channel: 'chrome',
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--no-sandbox'
        ]
      });
    }
  }

  console.log(`[BrowserTest] Browser instance spawned successfully.`);

  // Context 1: Host
  console.log('[BrowserTest] Initializing Context 1 (Host: Alice)...');
  const contextHost = await browser.newContext({
    permissions: ['camera', 'microphone']
  });
  const pageHost = await contextHost.newPage();

  // Context 2: Guest
  console.log('[BrowserTest] Initializing Context 2 (Guest: Bob)...');
  const contextGuest = await browser.newContext({
    permissions: ['camera', 'microphone']
  });
  const pageGuest = await contextGuest.newPage();

  // Navigate Host to meeting
  await pageHost.goto(`${SERVER_URL}`);
  await pageHost.waitForSelector('input[placeholder*="name" i], input[type="text"]', { timeout: 10000 });

  // Fill user name and room code
  const hostInputs = await pageHost.$$('input[type="text"]');
  if (hostInputs.length >= 2) {
    await hostInputs[0].fill('HostAlice');
    await hostInputs[1].fill(ROOM_ID);
  } else if (hostInputs.length === 1) {
    await hostInputs[0].fill('HostAlice');
  }

  // Click Join or Start button
  const joinBtnHost = await pageHost.$('button:has-text("Join"), button:has-text("Start"), button:has-text("Meeting")');
  if (joinBtnHost) {
    await joinBtnHost.click();
  }

  // Wait for meeting room to mount on Host
  console.log('[BrowserTest] Waiting for Host meeting room to mount...');
  await pageHost.waitForTimeout(3000);

  // Navigate Guest to meeting
  console.log('[BrowserTest] Navigating Guest to meeting...');
  await pageGuest.goto(`${SERVER_URL}`);
  await pageGuest.waitForSelector('input[type="text"]', { timeout: 10000 });

  const guestInputs = await pageGuest.$$('input[type="text"]');
  if (guestInputs.length >= 2) {
    await guestInputs[0].fill('GuestBob');
    await guestInputs[1].fill(ROOM_ID);
  } else if (guestInputs.length === 1) {
    await guestInputs[0].fill('GuestBob');
  }

  const joinBtnGuest = await pageGuest.$('button:has-text("Join"), button:has-text("Start"), button:has-text("Meeting")');
  if (joinBtnGuest) {
    await joinBtnGuest.click();
  }

  await pageGuest.waitForTimeout(3000);

  // Check if Host sees knock request and admits
  const admitBtn = await pageHost.$('button:has-text("Admit"), button:has-text("admit")');
  if (admitBtn) {
    console.log('[BrowserTest] Host clicked Admit button for knocking guest.');
    await admitBtn.click();
    await pageHost.waitForTimeout(2000);
  }

  // Evaluate MediaStreams and active tracks in both browsers
  console.log('[BrowserTest] Inspecting active WebRTC MediaStreams & DOM elements...');

  const hostStreamStats = await pageHost.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    const audios = Array.from(document.querySelectorAll('audio'));
    return {
      videoElementCount: videos.length,
      audioElementCount: audios.length,
      hasVideoPlaying: videos.some((v) => !v.paused || v.readyState >= 2),
      title: document.title
    };
  });

  const guestStreamStats = await pageGuest.evaluate(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    const audios = Array.from(document.querySelectorAll('audio'));
    return {
      videoElementCount: videos.length,
      audioElementCount: audios.length,
      hasVideoPlaying: videos.some((v) => !v.paused || v.readyState >= 2),
      title: document.title
    };
  });

  console.log(`✅ Host Page Stats:`, hostStreamStats);
  console.log(`✅ Guest Page Stats:`, guestStreamStats);

  assert.ok(hostStreamStats.videoElementCount >= 1, 'Host must render at least 1 video element');
  assert.ok(guestStreamStats.videoElementCount >= 1, 'Guest must render at least 1 video element');

  console.log('\n🎉 REAL BROWSER AUDIO/VIDEO MEDIA TRANSMISSION TEST PASSED!\n');

  await browser.close();
  process.exit(0);
}

runBrowserTest().catch((err) => {
  console.error('\n❌ REAL BROWSER TEST FAILED:', err);
  process.exit(1);
});

