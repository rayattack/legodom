// Playground projects travel in the URL fragment, so sharing one needs no
// server and the code is never sent anywhere.

const toBase64Url = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
};
const pipe = async (bytes, stream) => {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
};

/** @param {Record<string, string>} files */
export const encodeProject = async (files) => {
  const bytes = new TextEncoder().encode(JSON.stringify(files));
  if (typeof CompressionStream === 'function') {
    return 'z.' + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }
  return 'j.' + toBase64Url(bytes);
};

/** @returns {Promise<Record<string, string> | null>} */
export const decodeProject = async (encoded) => {
  try {
    const [kind, body] = [encoded.slice(0, 2), encoded.slice(2)];
    let bytes = fromBase64Url(body);
    if (kind === 'z.') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j.') return null;
    const files = JSON.parse(new TextDecoder().decode(bytes));
    if (!files || typeof files !== 'object' || Array.isArray(files)) return null;
    const clean = {};
    for (const [name, text] of Object.entries(files)) {
      if (typeof text === 'string' && /^[a-z0-9][a-z0-9.-]*\.(lego|js|html)$/.test(name)) clean[name] = text;
    }
    return Object.keys(clean).length ? clean : null;
  } catch (e) {
    return null;
  }
};
