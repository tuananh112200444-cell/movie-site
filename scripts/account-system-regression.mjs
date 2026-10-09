import { readFile } from 'node:fs/promises';

const auth = await readFile('src/context/AuthContext.tsx', 'utf8');
const account = await readFile('src/pages/account/page.tsx', 'utf8');
const policy = await readFile('src/pages/policy/page.tsx', 'utf8');
const banners = await readFile('src/components/feature/CampaignBannerDemo.tsx', 'utf8');
const syncMigration = await readFile('supabase/migrations/20260930103000_add_user_account_sync.sql', 'utf8');

const checks = [
  [auth.includes('resetPasswordForEmail') && auth.includes("accountRedirectUrl('recovery')") && auth.includes('updateUser({ password })'), 'Password recovery is not wired end to end.'],
  [auth.includes("type: 'signup'") && auth.includes('resendConfirmation') && account.includes('Chưa nhận được email? Gửi lại'), 'Signup confirmation email cannot be resent.'],
  [auth.includes("provider: 'google'") && auth.includes("settings?.external?.google === true"), 'Google sign-in is not capability-gated by the live Supabase provider setting.'],
  [account.includes("type={passwordVisible ? 'text' : 'password'}") && account.includes('Nhập lại mật khẩu'), 'Password visibility or confirmation is missing.'],
  [account.includes('requirements.length') && account.includes('requirements.letter') && account.includes('requirements.number'), 'Strong-password guidance is missing.'],
  [account.includes('privacyAccepted') && account.includes('/policy?tab=privacy') && account.includes('/policy?tab=terms'), 'Signup does not require explicit privacy and terms consent.'],
  [banners.includes("/^\\/(?:tai-khoan|policy)(?:\\/|$)/") && banners.includes('suppressOnSensitiveForm'), 'The floating banner can still obstruct account or policy forms.'],
  [policy.includes('Nếu bạn tự nguyện tạo tài khoản') && policy.includes('Supabase để xác thực email') && policy.includes('Quyền Kiểm Soát & Xóa Dữ Liệu'), 'Privacy policy is inconsistent with the account system.'],
  [syncMigration.includes('alter table public.user_sync_items enable row level security') && syncMigration.includes('auth.uid() = user_id'), 'Account sync data is not protected by per-user RLS.'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', checks: checks.length }, null, 2));
