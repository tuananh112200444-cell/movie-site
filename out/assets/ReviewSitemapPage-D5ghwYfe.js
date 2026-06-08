import{r as s,j as t}from"./vendor-react-D6y2VlaL.js";const d="https://dzpddbthdeqbkrcjlzap.supabase.co",r="https://khophim.org";function f(){const[a,c]=s.useState(!0),[l,p]=s.useState(0);return s.useEffect(()=>{let i=!1;async function m(){try{const e=await fetch(`${d}/functions/v1/sitemap-reviews`,{signal:AbortSignal.timeout(15e3)});if(!e.ok)throw new Error(`HTTP ${e.status}`);const n=await e.text();if(i)return;const o=n.match(/<loc>/g);p((o==null?void 0:o.length)??0),document.open("text/xml"),document.write(n),document.close()}catch(e){if(i)return;const n=`<?xml version="1.0" encoding="UTF-8"?>
<!-- Error fetching reviews sitemap: ${String(e)} -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${r}/phim-moi-nhat</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;document.open("text/xml"),document.write(n),document.close(),c(!1)}}return m(),()=>{i=!0}},[]),a?t.jsxs("div",{style:{fontFamily:"monospace",padding:"40px",background:"#080a10",color:"#888",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"16px"},children:[t.jsx("div",{style:{fontSize:"16px",color:"#ccc"},children:"Generating reviews sitemap..."}),t.jsx("div",{style:{fontSize:"13px",color:"#555"},children:"Fetching review data from database"}),t.jsxs("div",{style:{fontSize:"12px",color:"#444",marginTop:"8px"},children:[r,"/sitemap-reviews.xml"]})]}):t.jsxs("div",{style:{fontFamily:"monospace",padding:"20px",background:"#080a10",color:"#666"},children:["Reviews sitemap: ",l," entries"]})}export{f as default};
