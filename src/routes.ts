import { websiteConfig } from './config/website';

/**
 * The routes for the application
 */
export enum Routes {
  Root = '/',

  // marketing pages
  FAQ = '/#faq',
  Features = '/#features',
  Pricing = '/pricing', // change to /#pricing if you want to use the pricing section in homepage
  Services = '/services',
  Bots = '/bots',
  Blog = '/blog',
  Docs = '/docs',
  About = '/about',
  Contact = '/contact',
  Waitlist = '/waitlist',
  Changelog = '/changelog',
  Roadmap = '/changelog',
  CookiePolicy = '/cookie',
  PrivacyPolicy = '/privacy',
  TermsOfService = '/terms',

  // auth routes
  Login = '/auth/login',
  Register = '/auth/register',
  AuthError = '/auth/error',
  ForgotPassword = '/auth/forgot-password',
  ResetPassword = '/auth/reset-password',

  // dashboard routes
  Dashboard = '/dashboard',
  Health = '/health',
  AIChat = '/ai-chat',
  Whiteboard = '/whiteboard',
  AdminBots = '/admin/bots',
  AdminUsers = '/admin/users',
  AdminOneWork = '/admin/onework',
  SettingsProfile = '/settings/profile',
  SettingsBilling = '/settings/billing',
  SettingsSecurity = '/settings/security',
  SettingsNotifications = '/settings/notifications',
  SettingsOneWork = '/settings/onework',
  OneWork = '/onework',
  OneWorkOAuthAuthorize = '/onework/oauth/authorize',
  OneWorkOAuthActivate = '/onework/activate',
}

/**
 * The routes that can not be accessed by logged in users
 */
export const routesNotAllowedByLoggedInUsers = [Routes.Login, Routes.Register];

/**
 * The routes that are protected and require authentication
 */
export const protectedRoutes = [
  Routes.Dashboard,
  Routes.Health,
  // Routes.AIChat 不再受保护：它是知识库「试吃」入口，游客必须能直接体验
  // （额度由 src/lib/free-trial-quota.ts 按 IP 哈希限制，会员无限）
  Routes.AdminBots,
  Routes.AdminUsers,
  Routes.AdminOneWork,
  Routes.SettingsProfile,
  Routes.SettingsBilling,
  Routes.SettingsSecurity,
  Routes.SettingsNotifications,
  Routes.SettingsOneWork,
  Routes.OneWorkOAuthAuthorize,
  Routes.OneWorkOAuthActivate,
];

/**
 * The default redirect path after logging in
 */
export const DEFAULT_LOGIN_REDIRECT =
  websiteConfig.routes.defaultLoginRedirect ?? Routes.Dashboard;
