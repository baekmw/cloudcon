import { fetchYes24Classical } from '../server/yes24Crawler.js';

async function main() {
  console.log('[Script] Starting YES24 classical crawler on server...');
  const res = await fetchYes24Classical();
  console.log(`[Script] Successfully crawled ${res.length} YES24 classical concerts.`);
}

main().catch(err => {
  console.error('[Script] Crawler failed:', err);
  process.exit(1);
});
