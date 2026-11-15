async function check() {
  const detailUrl = 'https://m.ticket.yes24.com/Perf/Detail/PerfInfo.aspx?IdPerf=61134';
  const res = await fetch(detailUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  const html = await res.text();
  console.log(html);
}

check();
