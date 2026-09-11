import fs from 'node:fs';

const config = fs.readFileSync('src/config/socialLinks.ts', 'utf8');
const icon = fs.readFileSync('src/components/base/SocialBrandIcon.tsx', 'utf8');
const navbar = fs.readFileSync('src/components/feature/Navbar.tsx', 'utf8');
const footer = fs.readFileSync('src/components/feature/Footer.tsx', 'utf8');
const about = fs.readFileSync('src/pages/about/page.tsx', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

const facebookUrl = 'https://www.facebook.com/share/19BH4GRjXq/?mibextid=wwXIfr';
const checks = [
  [config.includes(`facebook: '${facebookUrl}'`), 'The official Facebook URL must remain centralized and exact'],
  [navbar.includes('SOCIAL_URLS.facebook') && footer.includes('SOCIAL_URLS.facebook') && about.includes('SOCIAL_URLS.facebook'), 'Navbar, footer and contact page must share the official Facebook URL'],
  [icon.includes("'facebook' | 'messenger' | 'tiktok'") && icon.includes('TIKTOK_NOTE'), 'The three social brands must use the shared SVG icon set'],
  [footer.includes('Mạng xã hội KhoPhim') && footer.includes('<SocialBrandIcon'), 'Mobile and desktop footers must expose accessible social links'],
  [index.includes(facebookUrl), 'Organization schema must include the official Facebook URL'],
  [!navbar.includes('ri-facebook') && !navbar.includes('ri-messenger') && !navbar.includes('ri-tiktok'), 'Navbar must not regress to mismatched font-brand icons'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('social links regression passed');
