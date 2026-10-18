// Preview is deliberately static: executable content never enters the application DOM.
const allowedTags = new Set('html head body title style main article section header footer nav aside h1 h2 h3 h4 h5 h6 p div span strong b em i u s small mark sub sup br hr ul ol li dl dt dd blockquote pre code table caption thead tbody tfoot tr th td details summary a figure figcaption abbr time kbd samp var'.split(' '));
const globalAttributes = new Set(['id', 'class', 'style', 'title', 'lang', 'dir', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden']);
export const htmlPreviewPolicy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export function buildHtmlPreview(source: string): string {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  for (const element of Array.from(parsed.querySelectorAll('*'))) {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !allowedTags.has(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      const local = element.localName;
      const allowed = globalAttributes.has(name)
        || local === 'a' && name === 'href' && attribute.value.startsWith('#')
        || local === 'details' && name === 'open'
        || (local === 'td' || local === 'th') && ['colspan', 'rowspan', 'scope'].includes(name)
        || local === 'ol' && ['start', 'reversed'].includes(name)
        || local === 'li' && name === 'value';
      if (!allowed) element.removeAttribute(name);
      // srcDoc resolves relative URLs against the embedding app; keep fragment links inside this document.
      else if (local === 'a' && name === 'href') element.setAttribute(name, 'about:srcdoc' + attribute.value);
    }
  }
  const policy = parsed.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = htmlPreviewPolicy;
  const viewport = parsed.createElement('meta');
  viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1';
  parsed.head.prepend(policy, viewport);
  return '<!doctype html>\n' + parsed.documentElement.outerHTML;
}
