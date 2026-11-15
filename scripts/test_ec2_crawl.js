async function checkNoticeJs() {
  const res = await fetch('https://m.ticket.yes24.com/Notice/Scripts/Notice.js');
  const text = await res.text();
  console.log(text.slice(0, 2000));
}

checkNoticeJs();
