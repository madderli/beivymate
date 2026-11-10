// Download only a Markdown response; an authentication/error HTML page is not a document.
document.querySelector('[data-return-editor]')?.addEventListener('click', event => {
 event.preventDefault(); const returnUrl = event.currentTarget.href; window.close();
 window.setTimeout(() => window.location.assign(returnUrl), 100);
});
document.querySelector('[data-download-md]')?.addEventListener('click', async event => {
 event.preventDefault(); const link = event.currentTarget;
 const notice = document.querySelector('#download-error'); notice.hidden = true;
 try {
  const response = await fetch(link.href, {credentials: 'same-origin'});
  const type = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!response.ok || type.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text)) throw new Error();
  const url = URL.createObjectURL(new Blob([text], {type:'text/markdown;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = link.download;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 } catch { notice.textContent = '未能下载 Markdown 文档，请确认已登录后重试。'; notice.hidden = false; }
});
const sections = document.querySelectorAll('.doc-content h2');
const observer = new IntersectionObserver(entries => {
 for (const entry of entries) if (entry.isIntersecting) {
  document.querySelectorAll('.doc-sidebar a').forEach(link => link.classList.toggle('active', link.hash === '#' + entry.target.id));
 }
}, {rootMargin:'-10% 0px -65% 0px'});
sections.forEach(section => observer.observe(section));
