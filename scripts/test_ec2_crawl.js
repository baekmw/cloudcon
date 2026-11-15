async function testBypass() {
  const pcUrl = 'http://ticket.yes24.com/Pages/Perf/Detail/Detail.aspx?IdPerf=61134';
  const mobileUrl = 'https://m.ticket.yes24.com/Perf/Detail/PerfInfo.aspx?IdPerf=61134';

  const userAgents = [
    'curl/8.5.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15'
  ];

  for (const url of [pcUrl, mobileUrl]) {
    for (const ua of userAgents) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          }
        });
        const html = await res.text();
        const isBlocked = html.includes('비정상적인 접근') || html.includes('Mbuster');
        console.log(`URL: ${url.slice(0, 35)}... | UA: ${ua.slice(0, 20)} | Status: ${res.status} | Len: ${html.length} | Blocked: ${isBlocked}`);
      } catch (err) {
        console.log(`URL: ${url} | Error: ${err.message}`);
      }
    }
  }
}

testBypass();
