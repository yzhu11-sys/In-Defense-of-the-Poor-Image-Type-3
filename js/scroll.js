// Where the page scrolls. On phones the page scrolls inside <body> instead of the browser window (see
// style.css): iOS Safari then keeps its bars still, so the fixed header and bottom edge always sit exactly at
// the screen's edges. On a computer nothing changes: the window scrolls as usual.
const PAGE_SCROLL = matchMedia('(max-width: 600px)');
const scroller = () => PAGE_SCROLL.matches ? document.body : document.scrollingElement;
const pageY = () => scroller().scrollTop;
const viewH = () => PAGE_SCROLL.matches ? document.body.clientHeight : innerHeight;   // the visible height
function scrollPage(y) { scroller().scrollTop = y; }
function onPageScroll(fn) {
  addEventListener('scroll', fn, { passive: true });
  document.body.addEventListener('scroll', fn, { passive: true });
}
