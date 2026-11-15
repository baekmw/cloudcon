async function testUrls() {
  const urls = [
    'https://m.ticket.yes24.com/Perf/61134',
    'http://ticket.yes24.com/Perf/61134',
    'http://ticket.yes24.com/Special/61134',
    'https://m.ticket.yes24.com/Perf/Detail/PerfInfo.aspx?IdPerf=61134'
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://m.ticket.yes24.com/Genre/List.aspx?genre=15459',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        }
      });
      const html = await res.text();
      const isBlocked = html.includes('비정상적인 접근') || html.includes('Mbuster');
      console.log(`URL: ${url} | Status: ${res.status} | Length: ${html.length} | Blocked: ${isBlocked}`);
      if (!isBlocked && html.length > 5000) {
        console.log('Title match:', html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim());
      }
    } catch (err) {
      console.log(`URL: ${url} | Error: ${err.message}`);
    }
  }
}

testUrls();
