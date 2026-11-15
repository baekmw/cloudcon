import { fetchYes24ProductDetail, parseYes24OpenAt } from '../server/yes24Crawler.js';

async function check() {
  const detail = await fetchYes24ProductDetail('61134');
  console.log('Detail for 61134:');
  console.log('Title:', detail?.title);
  console.log('TicketOpen:', detail?.ticketOpen);
}

check();
