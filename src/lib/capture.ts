// "浏览器带回": when Amazon blocks the server, the visitor's own browser (a normal
// visitor on a normal IP) sends the product page it is showing to this app.
//
// Flow: bookmarklet on the Amazon page → opens <app>/?capture=1 → the app says
// "apa-ready" to its opener → the bookmarklet posts { url, html } back with the
// app's exact origin as target → the app checks the sender is an Amazon origin,
// strips the account bar / scripts / styles, and sends the HTML to /api/parse-html.

export const AMAZON_ORIGIN_RE = /^https:\/\/(www\.|smile\.)?amazon\.(com|ca|com\.mx|com\.br|co\.uk|de|fr|it|es|nl|com\.be|se|pl|com\.tr|ae|sa|eg|in|co\.jp|sg|com\.au)$/;

/** The bookmark's `javascript:` URL. Plain ES5 string so no bundler touches it. */
export function bookmarkletHref(appOrigin: string): string {
  const code =
    "(function(){var A=" +
    JSON.stringify(appOrigin) +
    ";" +
    "if(location.hostname.indexOf('amazon.')<0){alert('请在 Amazon 商品详情页上点击这个书签');return;}" +
    "var w=window.open(A+'/?capture=1','_blank');" +
    "if(!w){alert('浏览器拦截了弹窗：请允许 Amazon 弹出窗口后再点一次');return;}" +
    "var h=document.documentElement.outerHTML,u=location.href;" +
    "function f(e){if(e.origin===A&&e.data==='apa-ready'){w.postMessage({type:'apa-capture',url:u,html:h},A);window.removeEventListener('message',f);}}" +
    "window.addEventListener('message',f);" +
    "})();";
  return "javascript:" + encodeURIComponent(code);
}

/** Drop what the parser doesn't need — and the account bar, which carries the
 *  visitor's name and delivery address — before the page leaves the browser. */
export function slimAmazonHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll(
      "style, link, noscript, iframe, svg, video, template, #navbar, #nav-belt, #nav-main, #nav-subnav, [id^='nav-flyout'], #navFooter, #rhf, #sp-cc, header, footer",
    )
    .forEach((n) => n.remove());
  // keep only the scripts that hold product data the parser reads
  doc.querySelectorAll("script").forEach((s) => {
    if (!/colorImages|variationValues|dimensionValuesDisplayData/.test(s.textContent ?? "")) s.remove();
  });
  return "<!doctype html>" + doc.documentElement.outerHTML;
}
