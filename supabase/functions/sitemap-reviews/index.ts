Deno.serve(() => {
  // Sitemap reviews đã ngừng hoạt động — trả về XML rỗng
  // Lý do: trang chi tiết phim /phim/ được đặt noindex, SEO tập trung vào danh mục
  const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;

  return new Response(emptyXml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
