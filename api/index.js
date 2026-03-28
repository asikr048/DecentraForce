import registerHandler from './_auth/register.js';
import loginHandler from './_auth/login.js';
import logoutHandler from './_auth/logout.js';
import verifyHandler from './_auth/verify.js';
import forgotPasswordHandler from './_auth/forgot-password.js';
import resetPasswordHandler from './_auth/reset-password.js';

import adminInitHandler from './_admin/init.js';
import adminUsersHandler from './_admin/users.js';
import adminCoursesHandler from './_admin/courses.js';
import adminGrantAccessHandler from './_admin/grant-access.js';
import adminUpdateProfileHandler from './_admin/update-profile.js';
import adminCouponsHandler from './_admin/coupons.js';

import publicCoursesHandler from './_public/courses.js';
import publicVerifyCouponHandler from './_public/verify-coupon.js';

export default async function handler(req, res) {
  // Get the path being requested
  const path = req.url.split('?')[0];

  // --- AUTH ROUTES ---
  if (path.includes('/auth/register')) return registerHandler(req, res);
  if (path.includes('/auth/login')) return loginHandler(req, res);
  if (path.includes('/auth/logout')) return logoutHandler(req, res);
  if (path.includes('/auth/verify')) return verifyHandler(req, res);
  if (path.includes('/auth/forgot-password')) return forgotPasswordHandler(req, res);
  if (path.includes('/auth/reset-password')) return resetPasswordHandler(req, res);

  // --- ADMIN ROUTES ---
  if (path.includes('/admin/init')) return adminInitHandler(req, res);
  if (path.includes('/admin/users')) return adminUsersHandler(req, res);
  if (path.includes('/admin/courses')) return adminCoursesHandler(req, res);
  if (path.includes('/admin/grant-access')) return adminGrantAccessHandler(req, res);
  if (path.includes('/admin/update-profile')) return adminUpdateProfileHandler(req, res);
  if (path.includes('/admin/coupons')) return adminCouponsHandler(req, res);

  // --- PUBLIC ROUTES ---
  if (path.includes('/public/courses')) return publicCoursesHandler(req, res);
  if (path.includes('/public/verify-coupon')) return publicVerifyCouponHandler(req, res);

  return res.status(404).json({ success: false, error: 'API Endpoint not found' });
}

// Ensure payload limit is increased to 10mb globally for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};