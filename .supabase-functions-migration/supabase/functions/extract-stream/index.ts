import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOTCHILL_BASES = [
  'https://motchill40.net',
  'https://motchill40.tv',
  'https://motchill40.com'
];
function tryBase64Decode(str) {
  try {
    const decoded = atob(str);
    if (decoded.includes('http') || decoded.includes('.m3u8')) return decoded;
  } catch  {}
  return '';
}
function tryHexDecode(str) {
  try {
    if (!/^[0-9a-fA-F]+$/.test(str) || str.length % 2 !== 0) return '';
    let out = '';
    for(let i = 0; i < str.length; i += 2){
      out += String.fromCharCode(parseInt(str.substring(i, i + 2), 16));
    }
    if (out.includes('http') || out.includes('.m3u8')) return out;
  } catch  {}
  return '';
}
function tryRot13(str) {
  return str.replace(/[a-zA-Z]/g, (c)=>{
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
  });
}
function tryCaesar(str, shift) {
  return str.replace(/[a-zA-Z]/g, (c)=>{
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + shift + 26) % 26 + base);
  });
}
function tryReverse(str) {
  return str.split('').reverse().join('');
}
function tryXor(str, key) {
  let out = '';
  for(let i = 0; i < str.length; i++){
    out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}
/**
 * Scan a string for any http URL containing .m3u8
 */ function extractM3u8(text) {
  const m = text.match(/(https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?)/i);
  return m ? m[1] : '';
}
function extractEmbed(text) {
  const m = text.match(/(https?:\/\/[^\s"'<>]+(?:embed|player|stream|video)[^\s"'<>]*)/i);
  return m ? m[1] : '';
}
function applyDecoders(encoded) {
  const results = [];
  const b64 = tryBase64Decode(encoded);
  if (b64) results.push(b64);
  const hex = tryHexDecode(encoded);
  if (hex) results.push(hex);
  const rot = tryRot13(encoded);
  if (rot.includes('http')) results.push(rot);
  const rev = tryReverse(encoded);
  if (rev.includes('http')) results.push(rev);
  for(let s = 1; s <= 25; s++){
    const caesar = tryCaesar(encoded, s);
    if (caesar.includes('http')) {
      results.push(caesar);
      break;
    }
  }
  return results;
}
/**
 * Parse HTML to find stream links.
 */ function parseStreamFromHTML(html) {
  let m3u8 = '';
  let embed = '';
  // Direct iframe embed
  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (iframeMatch) {
    embed = iframeMatch[1];
    if (!embed.startsWith('http')) embed = `https:${embed}`;
  }
  // Video src
  const videoMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (videoMatch && videoMatch[1].includes('.m3u8')) {
    m3u8 = videoMatch[1];
  }
  // Source tag
  const sourceMatch = html.match(/<source[^>]+src=["']([^"']+)["'][^>]*type=["']application\/x-mpegURL["']/i);
  if (sourceMatch) m3u8 = sourceMatch[1];
  // Parse all scripts
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let sm;
  while((sm = scriptRegex.exec(html)) !== null){
    const script = sm[1];
    if (!script.trim()) continue;
    // Direct m3u8 URL in script
    const directM3u8 = extractM3u8(script);
    if (directM3u8) m3u8 = directM3u8;
    // atob patterns
    const atobMatches = [
      ...script.matchAll(/atob\(["']([^"']+)["']\)/gi)
    ];
    for (const am of atobMatches){
      const decoded = tryBase64Decode(am[1]);
      if (decoded) {
        const dm = extractM3u8(decoded) || extractEmbed(decoded);
        if (dm) {
          m3u8 = extractM3u8(decoded) || m3u8;
          embed = extractEmbed(decoded) || embed;
        }
      }
    }
    // btoa reverse patterns: atob(str.split('').reverse().join(''))
    const revAtobMatch = script.match(/atob\(([\w.]+)\.split\(['"]\)['"]\)\.reverse\(\)\.join\(['"]\)/i);
    if (revAtobMatch) {
      // Try to find the variable value in the same script
      const varName = revAtobMatch[1];
      const varRegex = new RegExp(`${varName}\\s*=\\s*["']([^"']+)["']`, 'i');
      const varMatch = script.match(varRegex);
      if (varMatch) {
        const rev = tryReverse(varMatch[1]);
        const decoded = tryBase64Decode(rev);
        if (decoded) {
          m3u8 = extractM3u8(decoded) || m3u8;
          embed = extractEmbed(decoded) || embed;
        }
      }
    }
    // decodeURIComponent + escape patterns
    const decMatch = script.match(/decodeURIComponent\(escape\(["']([^"']+)["']\)\)/i);
    if (decMatch) {
      try {
        const decoded = decodeURIComponent(escape(decMatch[1]));
        if (decoded.includes('http')) {
          m3u8 = extractM3u8(decoded) || m3u8;
          embed = extractEmbed(decoded) || embed;
        }
      } catch  {}
    }
    // JSON.parse(atob(...))
    const jsonAtobMatch = script.match(/JSON\.parse\(atob\(["']([^"']+)["']\)\)/i);
    if (jsonAtobMatch) {
      try {
        const decoded = tryBase64Decode(jsonAtobMatch[1]);
        if (decoded) {
          m3u8 = extractM3u8(decoded) || m3u8;
          embed = extractEmbed(decoded) || embed;
        }
      } catch  {}
    }
    // Long hex strings
    const hexMatches = [
      ...script.matchAll(/["']([0-9a-fA-F]{40,})["']/g)
    ];
    for (const hm of hexMatches){
      const decoded = tryHexDecode(hm[1]);
      if (decoded && decoded.includes('http')) {
        m3u8 = extractM3u8(decoded) || m3u8;
        embed = extractEmbed(decoded) || embed;
      }
    }
    // data-embed or data-url attributes in nearby HTML
    const dataEmbedMatch = html.match(/data-embed=["']([^"']+)["']/i);
    if (dataEmbedMatch) {
      const de = dataEmbedMatch[1];
      const dm = extractM3u8(de) || extractEmbed(de);
      if (dm) embed = dm;
      // Try decoders
      const decoders = applyDecoders(de);
      for (const d of decoders){
        if (d.includes('.m3u8')) m3u8 = d;
        else if (d.startsWith('http')) embed = d;
      }
    }
    // Encrypted link variables: var link = 'xxxx'; var key = 'yyyy';
    const linkVarMatch = script.match(/var\s+link\s*=\s*["']([^"']+)["']/i);
    if (linkVarMatch) {
      const lv = linkVarMatch[1];
      const decoders = applyDecoders(lv);
      for (const d of decoders){
        if (d.includes('.m3u8')) m3u8 = d;
        else if (d.startsWith('http')) embed = d;
      }
    }
    // JWPlayer / Plyr / VideoJS setup
    const playerMatch = script.match(/(?:jwplayer|plyr|videojs)[\s\S]*?file\s*[:=]\s*["']([^"']+)["']/i);
    if (playerMatch) {
      const pm = playerMatch[1];
      if (pm.includes('.m3u8')) m3u8 = pm;
      else if (pm.startsWith('http')) embed = pm;
    }
    // HLS.js setup
    const hlsMatch = script.match(/new\s+Hls\([\s\S]*?loadSource\s*\(\s*["']([^"']+)["']\s*\)/i);
    if (hlsMatch && hlsMatch[1].includes('.m3u8')) {
      m3u8 = hlsMatch[1];
    }
  }
  return {
    link_m3u8: m3u8,
    link_embed: embed,
    source_url: ''
  };
}
async function tryExtract(slug, base) {
  const urls = [
    `${base}/phim/${encodeURIComponent(slug)}`,
    `${base}/xem-phim/${encodeURIComponent(slug)}`
  ];
  for (const url of urls){
    try {
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), 12000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8'
        },
        redirect: 'follow'
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 1000 || /captcha|cloudflare|cf-browser-verification|turnstile/i.test(html)) {
        continue;
      }
      const result = parseStreamFromHTML(html);
      if (result.link_m3u8 || result.link_embed) {
        result.source_url = url;
        return result;
      }
    } catch  {}
  }
  return null;
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS
    });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug')?.trim();
  const sourceUrl = url.searchParams.get('source_url')?.trim();
  if (!slug && !sourceUrl) {
    return new Response(JSON.stringify({
      status: false,
      msg: 'Missing slug or source_url'
    }), {
      status: 400,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }
  let result = null;
  // If source_url provided, try that directly first
  if (sourceUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), 12000);
      const res = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8'
        },
        redirect: 'follow'
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        if (html.length >= 1000 && !/captcha|cloudflare|cf-browser-verification|turnstile/i.test(html)) {
          result = parseStreamFromHTML(html);
          if (result.link_m3u8 || result.link_embed) {
            result.source_url = sourceUrl;
          } else {
            result = null;
          }
        }
      }
    } catch  {}
  }
  // Fallback to motchill bases
  if (!result && slug) {
    for (const base of MOTCHILL_BASES){
      result = await tryExtract(slug, base);
      if (result) break;
    }
  }
  if (!result || !result.link_m3u8 && !result.link_embed) {
    return new Response(JSON.stringify({
      status: false,
      msg: 'Không thể trích xuất link stream từ nguồn ngoài',
      link_m3u8: '',
      link_embed: ''
    }), {
      status: 404,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }
  return new Response(JSON.stringify({
    status: true,
    link_m3u8: result.link_m3u8,
    link_embed: result.link_embed,
    source_url: result.source_url
  }), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=120'
    }
  });
});
