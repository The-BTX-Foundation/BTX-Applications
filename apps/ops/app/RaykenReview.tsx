// Rayken Review loader for the Next.js app router.
// 1. Run `rr snippet <project>` and paste the code between <script> and </script> (not the tags) between
//    the backticks below. String.raw keeps the backslashes in the loader intact.
// 2. Render <RaykenReview /> as the first child of <head> in app/layout.tsx.
// 3. Set NEXT_PUBLIC_RAYKEN_REVIEW=1 only on the Preview environment of the review address.
// The loader still checks the address at runtime, so a production build that includes it stays idle.

const LOADER = String.raw`
/* Rayken Review loader. Idle unless this is a review host and the browser holds a pass. */
(function (w, d) {
  try {
    var P = "btx-ops", S = "https://review.raykendigital.com", H = ["btx-ops-git-review-dominick-littleton-s-projects.vercel.app"], h = location.hostname.toLowerCase();
    if (!H.some(function (x) { return x == h || (x[0] == "*" && h.length >= x.length && h.slice(1 - x.length) == x.slice(1)); })) return;
    "pointerdown pointerup mousedown mouseup click dblclick auxclick contextmenu touchstart touchend submit keydown keyup keypress beforeinput input focusin focusout dragstart".split(" ").forEach(function (n) {
      w.addEventListener(n, function (e) { var R = w.__raykenReview; if (R && R.onEvent) try { R.onEvent(e); } catch (x) {} }, { capture: true, passive: n[0] == "t" });
    });
    var K = "rayken-review:" + P, C = "rr_" + P, L = w.localStorage, u = location, t, m;
    function db(f) { try { var r = indexedDB.open("rayken-review", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); r.result.createObjectStore("queue", { keyPath: "seq", autoIncrement: true }); }; r.onsuccess = function () { try { f(r.result.transaction("kv", "readwrite").objectStore("kv")); } catch (x) {} }; } catch (x) {} }
    function go(v) {
      try { L.setItem(K, v); } catch (x) {}
      d.cookie = C + "=" + v + "; path=/; max-age=5184000; SameSite=Lax" + (u.protocol == "https:" ? "; Secure" : "");
      db(function (s) { s.put(v, "pass:" + P); });
      w.__raykenReview = { project: P, service: S, token: v };
      var s = d.createElement("script"); s.src = S + "/w/boot.js?p=" + encodeURIComponent(P); s.async = true; d.head.appendChild(s);
    }
    var re = /([#?&])rr=(rr[pd]_[\w-]{20,})&?/, cut = function (s) { return s.replace(re, "$1").replace(/[#?&]$/, ""); };
    if (m = u.hash.match(re) || u.search.match(re)) { history.replaceState(history.state, "", u.pathname + cut(u.search) + cut(u.hash)); return go(m[2]); }
    try { t = L.getItem(K); } catch (x) {}
    t = t || (d.cookie.match("(?:^|; )" + C + "=(rr[pd]_[\\w-]+)") || [])[1];
    if (t) return go(t);
    db(function (s) { var g = s.get("pass:" + P); g.onsuccess = function () { g.result && go(g.result); }; });
  } catch (x) {}
})(window, document);
`;

export default function RaykenReview() {
  if (process.env.NEXT_PUBLIC_RAYKEN_REVIEW !== '1') {
    return null;
  }
  return <script id="rayken-review" dangerouslySetInnerHTML={{ __html: LOADER }} />;
}
