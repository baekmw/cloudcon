import { fetchNolUpcomingClassical } from "../server/nolCrawler.js";

async function run() {
  await fetchNolUpcomingClassical();
  process.exit(0);
}

run();
