// Small flat illustrations, one per idea. Fixed palette on purpose: they sit
// on tinted cards and read the same in light and dark.
const ART = {
  tag: `<rect x="22" y="16" width="156" height="108" rx="12" fill="#14161f" />
<rect x="22" y="38" width="156" height="86" rx="0" fill="#fffdf5" />
<path d="M22 112h156v0a12 12 0 0 1-12 12H34a12 12 0 0 1-12-12z" fill="#fffdf5" />
<circle cx="38" cy="27" r="4" fill="#ff6b57" /><circle cx="52" cy="27" r="4" fill="#ffd43b" /><circle cx="66" cy="27" r="4" fill="#3dd69c" />
<rect x="36" y="50" width="62" height="8" rx="4" fill="#d6ceb4" />
<rect x="52" y="60" width="14" height="8" rx="3" fill="#f5b800" /><rect x="92" y="60" width="14" height="8" rx="3" fill="#f5b800" /><rect x="132" y="60" width="14" height="8" rx="3" fill="#f5b800" />
<rect x="36" y="66" width="128" height="28" rx="7" fill="#ffd43b" />
<text x="100" y="85" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="13" font-weight="700" fill="#14161f">&lt;my-block&gt;</text>
<rect x="36" y="102" width="96" height="8" rx="4" fill="#d6ceb4" />`,
  reactive: `<rect x="14" y="52" width="76" height="36" rx="18" fill="#14161f" />
<text x="52" y="75" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="13" font-weight="700" fill="#ffd43b">count++</text>
<path d="M96 70h20" stroke="#2f6bff" stroke-width="5" stroke-linecap="round" />
<path d="M112 60l12 10-12 10z" fill="#2f6bff" />
<rect x="130" y="22" width="56" height="96" rx="10" fill="#fffdf5" />
<rect x="138" y="34" width="40" height="8" rx="4" fill="#d6ceb4" />
<rect x="138" y="50" width="28" height="8" rx="4" fill="#d6ceb4" />
<rect x="134" y="62" width="48" height="16" rx="6" fill="#3dd69c" />
<rect x="140" y="67" width="26" height="6" rx="3" fill="#0e8e5f" />
<rect x="138" y="84" width="36" height="8" rx="4" fill="#d6ceb4" />
<rect x="138" y="100" width="22" height="8" rx="4" fill="#d6ceb4" />`,
  direct: `<path d="M100 30v26M100 56L60 84M100 56l40 28M60 84v24M140 84l-18 24M140 84l18 24" stroke="#14161f" stroke-width="4" stroke-linecap="round" fill="none" />
<rect x="84" y="16" width="32" height="24" rx="7" fill="#fffdf5" /><rect x="84" y="46" width="32" height="24" rx="7" fill="#fffdf5" />
<rect x="44" y="74" width="32" height="24" rx="7" fill="#fffdf5" /><rect x="124" y="74" width="32" height="24" rx="7" fill="#fffdf5" />
<rect x="44" y="104" width="32" height="24" rx="7" fill="#fffdf5" /><rect x="142" y="104" width="32" height="24" rx="7" fill="#fffdf5" />
<rect x="104" y="102" width="34" height="28" rx="8" fill="#ff6b57" />
<path d="M22 26l26 4-12 10 20 4-30 22 8-18-16-2z" fill="#ffd43b" />
<path d="M52 66q30 34 50 44" stroke="#e5432d" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 9" fill="none" />`,
  route: `<rect x="18" y="18" width="164" height="104" rx="12" fill="#fffdf5" />
<rect x="28" y="28" width="34" height="84" rx="7" fill="#14161f" />
<rect x="35" y="38" width="20" height="6" rx="3" fill="#ffd43b" /><rect x="35" y="52" width="20" height="6" rx="3" fill="#565b73" /><rect x="35" y="66" width="20" height="6" rx="3" fill="#565b73" />
<rect x="146" y="28" width="26" height="84" rx="7" fill="#d6ceb4" />
<rect x="78" y="36" width="62" height="76" rx="8" fill="#1f4fd1" />
<rect x="70" y="28" width="62" height="76" rx="8" fill="#5b8cff" />
<rect x="80" y="40" width="34" height="8" rx="4" fill="#fffdf5" /><rect x="80" y="56" width="42" height="6" rx="3" fill="#d9e4ff" /><rect x="80" y="68" width="30" height="6" rx="3" fill="#d9e4ff" />
<path d="M92 90a10 10 0 1 1 10 6" stroke="#ffd43b" stroke-width="4" stroke-linecap="round" fill="none" />
<path d="M106 102l-8-6 9-4z" fill="#ffd43b" />`,
  persist: `<path d="M62 44v52c0 9 17 16 38 16s38-7 38-16V44z" fill="#19b37b" />
<path d="M62 70c0 9 17 16 38 16s38-7 38-16" stroke="#0e8e5f" stroke-width="4" fill="none" />
<ellipse cx="100" cy="44" rx="38" ry="16" fill="#3dd69c" />
<ellipse cx="100" cy="44" rx="20" ry="7" fill="#0e8e5f" />
<rect x="12" y="22" width="40" height="30" rx="7" fill="#fffdf5" /><rect x="12" y="22" width="40" height="9" rx="4" fill="#14161f" /><rect x="19" y="38" width="22" height="6" rx="3" fill="#ffd43b" />
<rect x="148" y="22" width="40" height="30" rx="7" fill="#fffdf5" /><rect x="148" y="22" width="40" height="9" rx="4" fill="#14161f" /><rect x="155" y="38" width="22" height="6" rx="3" fill="#ffd43b" />
<path d="M40 58q8 22 22 26M160 58q-8 22-22 26" stroke="#14161f" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 9" fill="none" />`,
  stack: `<rect x="16" y="40" width="168" height="74" rx="14" fill="#14161f" />
<circle cx="48" cy="77" r="19" fill="#5b8cff" />
<path d="M152 56l19 11v22l-19 11-19-11V67z" fill="#ff6b57" />
<rect x="78" y="62" width="44" height="34" rx="5" fill="#ffd43b" />
<rect x="83" y="54" width="13" height="9" rx="3" fill="#ffd43b" /><rect x="104" y="54" width="13" height="9" rx="3" fill="#ffd43b" />
<rect x="78" y="86" width="44" height="10" rx="0" fill="#f5b800" /><path d="M78 91h44v0a5 5 0 0 1-5 5H83a5 5 0 0 1-5-5z" fill="#f5b800" />
<path d="M100 14v22M90 28l10 10 10-10" stroke="#19b37b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
  server: `<rect x="14" y="30" width="62" height="80" rx="10" fill="#14161f" />
<rect x="24" y="42" width="42" height="14" rx="4" fill="#3a3f52" /><circle cx="32" cy="49" r="3" fill="#3dd69c" />
<rect x="24" y="63" width="42" height="14" rx="4" fill="#3a3f52" /><circle cx="32" cy="70" r="3" fill="#ffd43b" />
<rect x="24" y="84" width="42" height="14" rx="4" fill="#3a3f52" /><circle cx="32" cy="91" r="3" fill="#ff6b57" />
<path d="M84 70h22" stroke="#2f6bff" stroke-width="5" stroke-linecap="round" /><path d="M102 60l12 10-12 10z" fill="#2f6bff" />
<rect x="122" y="24" width="64" height="92" rx="10" fill="#fffdf5" />
<rect x="130" y="34" width="48" height="20" rx="5" fill="#ffd43b" /><rect x="130" y="60" width="48" height="20" rx="5" fill="#5b8cff" /><rect x="130" y="86" width="48" height="20" rx="5" fill="#3dd69c" />
<path d="M150 44l4 4 8-8M150 70l4 4 8-8M150 96l4 4 8-8" stroke="#14161f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
};

/** The illustration as an SVG string, for b-html. */
export const spotSVG = (name) =>
  `<svg class="lg-spot" viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ART[name] || ''}</svg>`;
