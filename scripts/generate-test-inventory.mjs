#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(backendRoot, "..");
const dashboardRoot = path.join(workspaceRoot, "dashboard");
const frontendRoot = path.join(workspaceRoot, "frontend");
const mediaRoot = path.join(workspaceRoot, "media-server-infantscare");
const outputDir = path.join(backendRoot, "docs", "testing");
const jsonPath = path.join(outputDir, "route-inventory.json");
const markdownPath = path.join(outputDir, "coverage-matrix.md");
const checkMode = process.argv.includes("--check");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function rel(file) {
  return path.relative(backendRoot, file).split(path.sep).join("/");
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function normalizePath(value) {
  let result = value.replace(/\\/g, "/");
  if (!result.startsWith("/")) result = `/${result}`;
  result = result.replace(/\/{2,}/g, "/");
  if (result.length > 1) result = result.replace(/\/$/, "");
  return result || "/";
}

function joinPaths(base, routePath) {
  const left = base.replace(/\/$/, "");
  const right = routePath.replace(/^\//, "");
  if (!right) return normalizePath(left || "/");
  return normalizePath(`${left}/${right}`);
}

function unquote(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^([`'"])([\s\S]*)\1$/);
  return match ? match[2] : null;
}

function isCommented(text, index) {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  if (text.slice(lineStart, index).trim().startsWith("//")) return true;
  const before = text.slice(0, index);
  return before.lastIndexOf("/*") > before.lastIndexOf("*/");
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findCalls(text, prefix) {
  const calls = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(prefix, cursor);
    if (start === -1) break;
    const open = text.indexOf("(", start + prefix.length);
    if (open === -1) break;
    if (text.slice(start + prefix.length, open).trim() !== "") {
      cursor = start + prefix.length;
      continue;
    }
    if (isCommented(text, start)) {
      cursor = open + 1;
      continue;
    }
    const close = findMatchingParen(text, open);
    if (close === -1) break;
    calls.push({
      start,
      open,
      close,
      inner: text.slice(open + 1, close),
      line: lineAt(text, start),
    });
    cursor = close + 1;
  }
  return calls;
}

function splitTopLevel(value) {
  const parts = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      current += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractRequires(text) {
  const map = new Map();
  const regex =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  for (const match of text.matchAll(regex)) map.set(match[1], match[2]);
  return map;
}

function resolveRequire(fromFile, request) {
  if (!request.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [base, `${base}.js`, `${base}.mjs`, path.join(base, "index.js")];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function emptyAuth() {
  return { token: false, admin: false, permissions: [] };
}

function mergeAuth(...values) {
  const result = emptyAuth();
  for (const value of values) {
    if (!value) continue;
    result.token = result.token || value.token;
    result.admin = result.admin || value.admin;
    for (const permission of value.permissions) {
      if (!result.permissions.includes(permission)) result.permissions.push(permission);
    }
  }
  return result;
}

function detectAuth(source) {
  const auth = emptyAuth();
  auth.token = /\b(?:verifyToken|authMiddleware)\b/.test(source);
  auth.admin = /\b(?:requireAdmin|adminMiddleware)\b/.test(source);
  for (const match of source.matchAll(
    /requirePermission\(\s*["'`]([^"'`]+)["'`]/g
  )) {
    auth.permissions.push(match[1]);
  }
  for (const match of source.matchAll(
    /requirePermission\(\s*\[([\s\S]*?)\]\s*\)/g
  )) {
    for (const item of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
      auth.permissions.push(item[1]);
    }
  }
  if (auth.permissions.length) auth.token = true;
  return auth;
}

function accessLabel(auth) {
  if (auth.permissions.length) return `permission:${auth.permissions.join("|")}`;
  if (auth.admin) return "admin";
  if (auth.token) return "authenticated";
  return "public";
}

function handlerName(lastArg) {
  const value = lastArg.trim().replace(/;\s*$/, "");
  if (/^[A-Za-z_$][\w$]*$/.test(value)) return value;
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(value)) return value;
  return "inline";
}

function areaFor(base) {
  if (base.startsWith("/api/v1/admin")) return "dashboard";
  if (base === "/api/v1/health") return "operations";
  if (
    base === "/api/v1/attributes" ||
    base === "/api/v1/settings" ||
    base.startsWith("/api/v1/cms")
  ) {
    return "shared";
  }
  return "storefront";
}

function domainFor(file, base, fullPath) {
  const fileKey = rel(file);
  const rest = fullPath.slice(base.length).split("/").filter(Boolean);
  const first = rest[0] || "";

  if (fileKey === "src/routes/adminRoutes.js") {
    const map = {
      dashboard: "Dashboard",
      products: "Products",
      orders: "Orders",
      customers: "Customers",
      reviews: "Reviews",
      coupons: "Offers",
      categories: "Categories",
      reports: "Reports",
      notifications: "Notifications",
      "error-logs": "Error Logs",
      users: "Admin Users",
      revalidate: "Cache & Revalidation",
    };
    return map[first] || "Admin API";
  }
  if (fileKey.includes("routes/admin/revalidate.js")) return "Cache & Revalidation";
  if (fileKey.includes("features/cms/pages")) return "CMS Pages";
  if (fileKey.includes("features/cms")) return "CMS";
  if (fileKey.includes("features/product/product.cms")) return "CMS Products";
  if (fileKey.includes("features/product/product.admin")) return "Products";

  const map = {
    "auth.js": "Auth",
    "product.js": "Products",
    "categoryRoutes.js": "Categories",
    "variantRoutes.js": "Product Variants",
    "filterRoutes.js": "Product Filters",
    "hybridCartRoutes.js": "Cart",
    "orderRoutes.js": "Orders",
    "addressRoutes.js": "Addresses",
    "reviewRoutes.js": "Reviews",
    "wishlistRoutes.js": "Wishlist",
    "paymentRoutes.js": "Payments",
    "healthRoutes.js": "Health",
    "homepageRoutes.js": "Storefront Homepage",
    "footerRoutes.js": "Storefront Footer",
    "faqRoutes.js": "FAQs",
    "stockNotificationRoutes.js": "Stock Notifications",
    "metaConversionRoutes.js": "Meta Conversions",
    "siteSettingsRoutes.js": "Site Settings",
    "chatRoutes.js": "Chat",
    "adminAiReportRoutes.js": "Reports",
    "deliveryPartnerRoutes.js": "Delivery Partners",
    "mediaRoutes.js": "Media",
    "faqCategoryRoutes.js": "FAQs",
    "csvImageRoutes.js": "CSV Import",
    "asset.js": "Media Assets",
    "attributeRoutes.js": "Attributes",
    "collectionRoutes.js": "Collections",
    "collectionStorefrontRoutes.js": "Collections",
    "analyticsRoutes.js": "Analytics",
    "cmsRoutes.js": "CMS",
  };
  return map[path.basename(file)] || "Other";
}

function casesFor(method, fullPath) {
  const cases = ["H", "VAL", "AUTH", "ERR", "BND"];
  if (method === "GET") cases.push("STATE");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    cases.push("IDEM", "CLN");
  }
  if (/export|download|csv/i.test(fullPath)) cases.push("EXP");
  if (/upload|media|asset|image/i.test(fullPath)) cases.push("FILE");
  return cases.join(",");
}

function extractEndpoints(file, base, inheritedAuth) {
  const text = read(file);
  const requires = extractRequires(text);
  const auth = mergeAuth(inheritedAuth, emptyAuth());
  const subrouters = [];
  const endpoints = [];

  for (const call of findCalls(text, "router.use")) {
    const args = splitTopLevel(call.inner);
    if (!args.length) continue;
    const target = args[args.length - 1].trim();
    if (requires.has(target)) {
      const subFile = resolveRequire(file, requires.get(target));
      if (subFile) {
        const mountPath = unquote(args[0]);
        if (mountPath !== null) {
          subrouters.push({ file: subFile, base: joinPaths(base, mountPath) });
          continue;
        }
      }
    }
    Object.assign(auth, mergeAuth(auth, detectAuth(call.inner)));
  }

  for (const method of ["get", "post", "put", "patch", "delete", "all"]) {
    for (const call of findCalls(text, `router.${method}`)) {
      const args = splitTopLevel(call.inner);
      if (!args.length) continue;
      const routePath = unquote(args[0]);
      if (routePath === null) continue;
      const fullPath = joinPaths(base, routePath);
      const routeAuth = mergeAuth(auth, detectAuth(args.slice(1).join(",")));
      endpoints.push({
        method: method.toUpperCase(),
        path: fullPath,
        domain: domainFor(file, base, fullPath),
        area: areaFor(base),
        access: accessLabel(routeAuth),
        auth: routeAuth,
        handler: handlerName(args[args.length - 1]),
        source: `${rel(file)}:${call.line}`,
        cases: casesFor(method.toUpperCase(), fullPath),
      });
    }
  }

  for (const call of findCalls(text, "router.route")) {
    const args = splitTopLevel(call.inner);
    const routePath = args.length ? unquote(args[0]) : null;
    if (routePath === null) continue;
    let tailStart = call.close + 1;
    while (tailStart < text.length) {
      const tail = text.slice(tailStart);
      const match = tail.match(/^\s*\.(get|post|put|patch|delete)\s*\(/);
      if (!match) break;
      const method = match[1];
      const open = tailStart + match[0].lastIndexOf("(");
      const close = findMatchingParen(text, open);
      if (close === -1) break;
      const chainArgs = splitTopLevel(text.slice(open + 1, close));
      const fullPath = joinPaths(base, routePath);
      const routeAuth = mergeAuth(auth, detectAuth(chainArgs.join(",")));
      endpoints.push({
        method: method.toUpperCase(),
        path: fullPath,
        domain: domainFor(file, base, fullPath),
        area: areaFor(base),
        access: accessLabel(routeAuth),
        auth: routeAuth,
        handler: handlerName(chainArgs[chainArgs.length - 1] || ""),
        source: `${rel(file)}:${lineAt(text, tailStart + match[0].indexOf("."))}`,
        cases: casesFor(method.toUpperCase(), fullPath),
      });
      tailStart = close + 1;
    }
  }

  return { endpoints, subrouters };
}

function collectBackend() {
  const appFile = path.join(backendRoot, "src", "app.js");
  const appText = read(appFile);
  const adminPrefix =
    appText.match(/ADMIN_PREFIX\s*=\s*process\.env\.ADMIN_API_PREFIX\s*\|\|\s*["'`]([^"'`]+)["'`]/)?.[1] ||
    "/admin";
  const requires = extractRequires(appText);
  const mounts = [];

  for (const call of findCalls(appText, "app.use")) {
    const args = splitTopLevel(call.inner);
    if (args.length < 2) continue;
    let base = unquote(args[0]);
    if (base === null) continue;
    base = base.replace(/\$\{ADMIN_PREFIX\}/g, adminPrefix);
    const target = args[1].trim();
    let request = null;
    const inlineRequire = target.match(/^require\(\s*["'`]([^"'`]+)["'`]\s*\)$/);
    if (inlineRequire) request = inlineRequire[1];
    else if (requires.has(target)) request = requires.get(target);
    if (!request) continue;
    const file = resolveRequire(appFile, request);
    if (!file) continue;
    const targetText = read(file);
    if (!targetText.includes("express.Router")) continue;
    mounts.push({
      file,
      base: normalizePath(base),
      source: `src/app.js:${call.line}`,
    });
  }

  const endpoints = [];
  const visited = new Set();
  const mountedFiles = new Set(mounts.map((mount) => mount.file));
  const queue = mounts.map((mount) => ({
    ...mount,
    auth: emptyAuth(),
    chain: [],
  }));

  while (queue.length) {
    const current = queue.shift();
    const key = `${current.file}|${current.base}|${current.chain.join(">")}`;
    if (visited.has(key)) continue;
    visited.add(key);
    mountedFiles.add(current.file);
    const parsed = extractEndpoints(current.file, current.base, current.auth);
    endpoints.push(...parsed.endpoints);
    for (const subrouter of parsed.subrouters) {
      queue.push({
        ...subrouter,
        auth: emptyAuth(),
        chain: [...current.chain, current.file],
      });
    }
  }

  const unique = new Map();
  for (const endpoint of endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (!unique.has(key)) {
      unique.set(key, { ...endpoint, duplicates: [] });
    } else {
      unique.get(key).duplicates.push(endpoint.source);
    }
  }

  const routeFiles = [];
  const routeRoot = path.join(backendRoot, "src", "routes");
  const featureRoot = path.join(backendRoot, "src", "features");
  for (const entry of fs.readdirSync(routeRoot)) {
    if (entry.endsWith(".js")) routeFiles.push(path.join(routeRoot, entry));
  }
  const walkFeatures = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walkFeatures(full);
      else if (entry.name.endsWith(".routes.js")) routeFiles.push(full);
    }
  };
  walkFeatures(featureRoot);

  const sortedEndpoints = [...unique.values()].sort(
    (a, b) =>
      a.area.localeCompare(b.area) ||
      a.domain.localeCompare(b.domain) ||
      a.path.localeCompare(b.path) ||
      a.method.localeCompare(b.method)
  );
  const adminWeak = sortedEndpoints.filter(
    (item) =>
      item.path.startsWith("/api/v1/admin") &&
      item.access !== "admin" &&
      !item.access.startsWith("permission:")
  );
  const unmounted = routeFiles
    .filter((file) => !mountedFiles.has(file))
    .map((file) => rel(file))
    .sort();

  return {
    endpoints: sortedEndpoints,
    mounts: mounts
      .map((mount) => ({
        base: mount.base,
        file: rel(mount.file),
        source: mount.source,
      }))
      .sort((a, b) => a.base.localeCompare(b.base) || a.file.localeCompare(b.file)),
    unmounted,
    rawEndpointCount: endpoints.length,
    mountCount: mounts.length,
    duplicateCount: [...unique.values()].filter((item) => item.duplicates.length).length,
    findings: {
      adminWeak,
      duplicates: [...unique.values()].filter((item) => item.duplicates.length),
      unmounted,
    },
  };
}

const dashboardRoutes = [
  ["/login", "LoginPage", "public", "Auth", "Login, invalid login, redirect when authenticated"],
  ["/reset-password", "ResetPasswordPage", "public", "Auth", "Request reset, reset with token, invalid/expired token"],
  ["/", "DashboardPage", "authenticated", "Dashboard", "Stats, charts, role-based home redirect"],
  ["/products", "ProductsPage", "authenticated", "Products", "List, search, filter, sort, pagination, quick edit, select, export, delete"],
  ["/products/new", "NewProductPage", "authenticated", "Products", "Create simple, configurable, and bundle products"],
  ["/products/:productId/edit", "EditProductPage", "authenticated", "Products", "Load, edit, validate, publish, draft, delete"],
  ["/products/import", "CsvImportPage", "authenticated", "Products", "CSV validate, preview, commit, errors, AI import"],
  ["/categories", "CategoriesPage", "authenticated", "Categories", "Tree/list, create, edit, delete, bulk, reorder, active state"],
  ["/collections", "CollectionsPage", "authenticated", "Collections", "List, create, edit, delete, product assignment"],
  ["/cms/home", "CmsHomePage", "authenticated", "CMS", "Blocks, widgets, preview, save, publish"],
  ["/cms/header", "CmsHeaderPage", "authenticated", "CMS", "Announcement, navigation, preview, save"],
  ["/cms/footer", "CmsFooterPage", "authenticated", "CMS", "Footer sections, social/legal, preview, save"],
  ["/cms/pages", "PagesListPage", "authenticated", "CMS Pages", "List, create, delete, draft/publish filters"],
  ["/cms/pages/:pageId/edit", "PageEditorPage", "authenticated", "CMS Pages", "Block builder, preview, draft/publish, validation"],
  ["/cms/landings", "LandingsListPage", "authenticated", "CMS Pages", "List, create, delete, draft/publish filters"],
  ["/cms/landings/:slug/edit", "LandingEditorPage", "authenticated", "CMS Pages", "Block builder, preview, draft/publish, validation"],
  ["/gallery", "GalleryPage", "authenticated", "Media", "Upload, list, preview, delete, validation"],
  ["/offers", "OffersPage", "authenticated", "Offers", "List, create, edit, delete, status/date, product search"],
  ["/orders", "OrdersPage", "authenticated", "Orders", "List, search, filter, sort, pagination, export"],
  ["/orders/cod-pending", "CodPendingPage", "authenticated", "Orders", "COD pending list, filters, mark paid"],
  ["/orders/:orderId", "OrderDetailsPage", "authenticated", "Orders", "Detail, edit, items, addresses, payment, fulfillment, refund, timeline"],
  ["/site-config", "SiteConfigPage", "authenticated", "Settings", "Site metadata, maintenance, configuration save"],
  ["/popular-searches", "PopularSearchesPage", "authenticated", "Settings", "List, add, reorder, delete"],
  ["/delivery-partners", "DeliveryPartnersPage", "authenticated", "Settings", "List, create, edit, delete, active state"],
  ["/product-attributes", "ProductAttributesPage", "authenticated", "Settings", "Attributes, values, roles, filters, validation"],
  ["/profile", "ProfilePage", "authenticated", "Profile", "Profile update, change password, reset password"],
  ["/customers", "CustomersPage", "authenticated", "Customers", "List, search, filter, pagination, detail navigation"],
  ["/customers/:customerId", "CustomerDetailsPage", "authenticated", "Customers", "Profile, orders, addresses, account state"],
  ["/reviews", "ReviewsPage", "authenticated", "Reviews", "List, filter, approve, reject, reply, delete"],
  ["/cache", "CachePage", "authenticated", "Cache & Revalidation", "Inspect, clear, revalidate"],
  ["/error-logs", "ErrorLogsPage", "permission:view:error_logs", "Error Logs", "List, filter, inspect, delete"],
  ["/admin-users", "AdminUsersPage", "permission:manage:users|manage:roles", "Admin Users", "List, create, role change, delete, audit"],
  ["/reports/sales-by-product", "SalesByProductPage", "permission:view:analytics|view:financial_data", "Reports", "Date range, filters, table, export"],
  ["/reports/customers", "CustomersReportPage", "permission:view:analytics|view:financial_data", "Reports", "Date range, filters, table, export"],
  ["/reports/revenue-over-time", "RevenueOverTimePage", "permission:view:analytics|view:financial_data", "Reports", "Date range, filters, chart/table, export"],
  ["/reports/orders-by-status", "OrdersByStatusPage", "permission:view:analytics|view:financial_data", "Reports", "Date range, filters, chart/table, export"],
  ["/reports/returns-cancellations", "ReturnsCancellationsPage", "permission:view:analytics|view:financial_data", "Reports", "Date range, filters, table, export"],
  ["/reports/payment-method-split", "PaymentMethodSplitPage", "permission:view:analytics|view:financial_data", "Reports", "Date range, filters, chart/table, export"],
  ["/reports/ai-daily-report", "AiDailyReportPage", "authenticated", "Reports", "Generate/load report, errors, empty state"],
  ["/chat", "ChatPage", "authenticated", "Chat", "Sessions, messages, AI response, errors"],
  ["*", "NotFoundPage", "authenticated", "Platform", "404 page and return navigation"],
].map(([route, component, access, domain, actions], index) => {
  const isPublic = route === "/login" || route === "/reset-password";
  return {
    id: `UI-D-${String(index + 1).padStart(3, "0")}`,
    route,
    component,
    access,
    domain,
    actions,
    cases: "RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y",
    source: "dashboard/src/routes/routesConfig.tsx",
    testOwner: isPublic
      ? "dashboard/e2e/public-routes.spec.ts"
      : "dashboard/e2e/routes.spec.ts",
    status: "PARTIAL (RENDER)",
  };
});

function storefrontRouteFromFile(file) {
  const relative = path.relative(path.join(frontendRoot, "src", "app"), file).split(path.sep);
  const segments = relative
    .slice(0, -1)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .map((segment) => {
      if (segment.startsWith("[[...") && segment.endsWith("]]")) return "*";
      if (segment.startsWith("[...") && segment.endsWith("]")) return "*";
      if (segment.startsWith("[") && segment.endsWith("]")) return `:${segment.slice(1, -1)}`;
      return segment;
    });
  return normalizePath(segments.length ? `/${segments.join("/")}` : "/");
}

function storefrontDomain(route) {
  if (route === "/") return "Home";
  if (route === "/auth") return "Auth";
  if (route.startsWith("/account")) return "Account";
  if (route === "/cart") return "Cart";
  if (route === "/checkout") return "Checkout";
  if (route === "/categories") return "Categories";
  if (route.startsWith("/category/")) return "Category Listing";
  if (route.startsWith("/collection/")) return "Collection Listing";
  if (route.startsWith("/product/")) return "Product Detail";
  if (route === "/search") return "Search";
  if (route === "/wishlist") return "Wishlist";
  if (route === "/contact") return "Contact";
  if (route === "/orders/track") return "Order Tracking";
  if (route.startsWith("/order-confirmation")) return "Order Confirmation";
  if (route === "/offline") return "PWA";
  if (route.includes("&")) return "Policies";
  if (route === "/product-card-demo") return "Development";
  if (route === "/api/revalidate") return "Cache & Revalidation";
  return "CMS Page";
}

function collectStorefront() {
  const appRoot = path.join(frontendRoot, "src", "app");
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (entry.name === "page.tsx" || entry.name === "route.ts") {
        files.push(full);
      }
    }
  };
  walk(appRoot);
  return files
    .map((file) => {
      const route = storefrontRouteFromFile(file);
      return {
        route,
        file: path.relative(workspaceRoot, file).split(path.sep).join("/"),
        type: path.basename(file) === "route.ts" ? "API route" : "Page",
        domain: storefrontDomain(route),
        cases:
          path.basename(file) === "route.ts"
            ? "H,VAL,AUTH,ERR,IDEM"
            : "RENDER,STATE,INTERACTION,RESPONSIVE,A11Y",
        status: "TODO",
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route))
    .map((item, index) => ({
      id: `UI-S-${String(index + 1).padStart(3, "0")}`,
      ...item,
      testOwner: "frontend/tests/e2e/05-route-surfaces.spec.ts",
      status: item.type === "API route" ? "PARTIAL (API)" : "PARTIAL (RENDER)",
    }));
}

function mediaCases(method, routePath) {
  if (routePath === "/api/media/verify-key") return "H,VAL,AUTH,ERR";
  if (routePath === "/api/media/backup/zip") return "H,AUTH,ERR,BND,FILE";
  if (routePath === "/api/media/upload" || routePath === "/api/media/upload-multiple") {
    return "H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE";
  }
  if (routePath === "/api/media/delete" || routePath === "/api/media/delete-batch") {
    return "H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE";
  }
  if (routePath === "/api/media/list" || routePath === "/api/media/stats") {
    return "H,AUTH,ERR,STATE,FILE";
  }
  return casesFor(method, routePath);
}

function collectDirectAppRoutes() {
  const file = path.join(backendRoot, "src", "app.js");
  const text = fs.existsSync(file) ? read(file) : "";
  const items = [];

  for (const method of ["get", "post", "put", "patch", "delete"]) {
    for (const call of findCalls(text, `app.${method}`)) {
      const args = splitTopLevel(call.inner);
      const routePath = args.length ? unquote(args[0]) : null;
      if (routePath === null || !routePath.startsWith("/")) continue;
      const middleware = args.slice(1).join(",");
      const isPayment =
        routePath.includes("/webhook") ||
        routePath.includes("confirmation") ||
        routePath.includes("/api/payments");
      const access = /\brequireAdmin\b/.test(middleware)
        ? "admin"
        : /\bverifyToken\b/.test(middleware)
          ? "authenticated"
          : routePath.includes("/webhook")
            ? "signature"
            : "public";
      const cases = routePath.includes("/webhook")
        ? "H,VAL,AUTH,SIG,ERR,IDEM"
        : routePath === "/"
          ? "H"
          : routePath === "/email-logo.png"
            ? "H,ERR"
            : routePath.includes("confirmation")
              ? "H,VAL,ERR,STATE"
              : "H,VAL,AUTH,ERR";
      items.push({
        method: method.toUpperCase(),
        path: routePath,
        access,
        handler: handlerName(args[args.length - 1] || ""),
        source: path.relative(workspaceRoot, file).split(path.sep).join("/") + `:${call.line}`,
        cases,
        area: isPayment ? "payments" : "platform",
        domain: isPayment ? "Payments" : "Platform",
      });
    }
  }

  if (text.includes('"/api-docs"')) {
    items.push({
      method: "GET",
      path: "/api-docs",
      access: "public-dev",
      handler: "swagger-ui",
      source: "backend/src/app.js:256",
      cases: "H,RENDER,A11Y",
      area: "platform",
      domain: "Platform",
    });
  }

  return items
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
    .map((item, index) => ({
      id: `APP-${String(index + 1).padStart(3, "0")}`,
      ...item,
      coverage: {
        status: "COVERED",
        testOwner: "backend/tests/integration/directAppRoutes.test.js",
      },
    }));
}

function collectBackgroundJobs() {
  return [
    {
      id: "JOB-001",
      name: "Media cleanup cron",
      trigger: "cron",
      source: "backend/src/services/mediaCleanupService.js:81",
      cases: "H,ERR,RETRY,IDEM,CLN",
      status: "COVERED",
      testOwner: "backend/tests/integration/backgroundJobsSurface.test.js",
    },
    {
      id: "JOB-002",
      name: "CSV image cleanup cron",
      trigger: "cron",
      source: "backend/src/services/csvImageCleanupService.js:96",
      cases: "H,ERR,RETRY,IDEM,CLN",
      status: "COVERED",
      testOwner: "backend/tests/integration/backgroundJobsSurface.test.js",
    },
    {
      id: "JOB-003",
      name: "Expired asset cleanup cron and startup run",
      trigger: "cron+startup",
      source: "backend/src/jobs/cleanupExpiredAssets.js:132",
      cases: "H,ERR,RETRY,IDEM,CLN",
      status: "COVERED",
      testOwner: "backend/tests/integration/backgroundJobsSurface.test.js",
    },
    {
      id: "JOB-004",
      name: "Daily AI report cron",
      trigger: "cron",
      source: "backend/src/services/aiReportService.js:458",
      cases: "H,ERR,RETRY,IDEM,EXP",
      status: "COVERED",
      testOwner: "backend/tests/integration/backgroundJobsSurface.test.js",
    },
  ];
}

function collectMediaServer() {
  const items = [
    {
      method: "GET",
      path: "/",
      access: "public",
      handler: "dashboard-html",
      source: "media-server-infantscare/server.js",
      cases: "H,STATE,RENDER,A11Y",
    },
    {
      method: "GET",
      path: "/dashboard",
      access: "public",
      handler: "dashboard-html",
      source: "media-server-infantscare/server.js",
      cases: "H,STATE,RENDER,A11Y",
    },
    {
      method: "GET",
      path: "/uploads/*",
      access: "public",
      handler: "static-files",
      source: "media-server-infantscare/server.js",
      cases: "H,ERR,BND",
    },
  ];

  const file = path.join(mediaRoot, "routes", "media.js");
  if (fs.existsSync(file)) {
    const text = read(file);
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      for (const call of findCalls(text, `router.${method}`)) {
        const args = splitTopLevel(call.inner);
        const routePath = args.length ? unquote(args[0]) : null;
        if (routePath === null) continue;
        const authSource = args.slice(1).join(",");
        const access = /\bcheckKey\b/.test(authSource) ? "media-api-key" : "public";
        const fullPath = joinPaths("/api/media", routePath);
        items.push({
          method: method.toUpperCase(),
          path: fullPath,
          access,
          handler: handlerName(args[args.length - 1] || ""),
          source: path
            .relative(workspaceRoot, file)
            .split(path.sep)
            .join("/") + `:${call.line}`,
          cases: mediaCases(method.toUpperCase(), fullPath),
        });
      }
    }
  }

  return items
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
    .map((item, index) => ({
      id: `MEDIA-${String(index + 1).padStart(3, "0")}`,
      area: "media",
      domain: "Media Server",
      status: "COVERED",
      testOwner: "media-server-infantscare/tests/mediaServer.test.js",
      ...item,
    }));
}

const actionCoverage = {
  "ACT-001": ["PARTIAL", "backend/tests/integration/authSurface.test.js; dashboard/e2e/auth-interactions.spec.ts"],
  "ACT-002": ["PARTIAL", "backend/tests/integration/authSurface.test.js; dashboard/e2e/auth-interactions.spec.ts"],
  "ACT-003": ["PARTIAL", "backend/tests/integration/adminAuthSurface.test.js; backend/tests/integration/securitySurface.test.js"],
  "ACT-004": ["PARTIAL", "dashboard/e2e/routes.spec.ts; dashboard/e2e/interactions.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts"],
  "ACT-005": ["PARTIAL", "dashboard/e2e/routes.spec.ts"],
  "ACT-006": ["PARTIAL", "backend/tests/integration/productSurface.test.js; dashboard/e2e/interactions.spec.ts"],
  "ACT-007": ["PARTIAL", "backend/tests/integration/productSurface.test.js; backend/tests/integration/product.test.js"],
  "ACT-008": ["PARTIAL", "backend/tests/integration/bulk-import.test.js; backend/tests/integration/productSurface.test.js"],
  "ACT-009": ["PARTIAL", "backend/tests/integration/bundleProductSurface.test.js"],
  "ACT-010": ["PARTIAL", "backend/tests/integration/assetSurface.test.js"],
  "ACT-011": ["PARTIAL", "backend/tests/integration/bulk-import.test.js; backend/tests/integration/variantImportSurface.test.js"],
  "ACT-012": ["PARTIAL", "backend/tests/integration/productSearchSurface.test.js"],
  "ACT-013": ["PARTIAL", "backend/tests/integration/catalogSurface.test.js"],
  "ACT-014": ["PARTIAL", "backend/tests/integration/catalogSurface.test.js"],
  "ACT-015": ["PARTIAL", "backend/tests/integration/productSurface.test.js; backend/tests/integration/cartSurface.test.js"],
  "ACT-016": ["PARTIAL", "backend/tests/integration/adminOperationsSurface.test.js; backend/tests/integration/cartSurface.test.js"],
  "ACT-017": ["PARTIAL", "backend/tests/integration/orderSurface.test.js"],
  "ACT-018": ["PARTIAL", "backend/tests/integration/orderSurface.test.js; dashboard/e2e/order-details.spec.ts"],
  "ACT-019": ["PARTIAL", "backend/tests/integration/orderSurface.test.js"],
  "ACT-020": ["PARTIAL", "backend/tests/integration/refundSurface.test.js"],
  "ACT-021": ["PARTIAL", "backend/tests/integration/orderSurface.test.js"],
  "ACT-022": ["PARTIAL", "backend/tests/integration/adminOperationsSurface.test.js; backend/tests/integration/accountSurface.test.js"],
  "ACT-023": ["PARTIAL", "backend/tests/integration/reviewSurface.test.js; backend/tests/integration/reviewSharing.test.js"],
  "ACT-024": ["PARTIAL", "backend/tests/integration/cmsSurface.test.js"],
  "ACT-025": ["PARTIAL", "backend/tests/integration/cmsSurface.test.js"],
  "ACT-026": ["PARTIAL", "backend/tests/integration/cmsSurface.test.js; backend/tests/integration/storefrontContentSurface.test.js"],
  "ACT-027": ["PARTIAL", "backend/tests/integration/cmsSurface.test.js"],
  "ACT-028": ["PARTIAL", "backend/tests/integration/cmsSurface.test.js; frontend/tests/e2e/04-landing-pages.spec.ts"],
  "ACT-029": ["PARTIAL", "frontend/tests/e2e/04-landing-pages.spec.ts; dashboard/e2e/interactions.spec.ts"],
  "ACT-030": ["PARTIAL", "backend/tests/integration/assetSurface.test.js"],
  "ACT-031": ["COVERED", "media-server-infantscare/tests/mediaServer.test.js"],
  "ACT-032": ["COVERED", "backend/tests/integration/cmsContractSurface.test.js"],
  "ACT-033": ["PARTIAL", "frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/cmsSurface.test.js"],
  "ACT-034": ["PARTIAL", "backend/tests/integration/settingsSurface.test.js"],
  "ACT-035": ["PARTIAL", "backend/tests/integration/adminOperationsSurface.test.js"],
  "ACT-036": ["PARTIAL", "backend/tests/integration/catalogSurface.test.js"],
  "ACT-037": ["PARTIAL", "backend/tests/integration/authSurface.test.js; backend/tests/integration/accountSurface.test.js"],
  "ACT-038": ["COVERED", "backend/tests/integration/adminUserSurface.test.js"],
  "ACT-039": ["PARTIAL", "backend/tests/integration/sales-by-product.test.js; backend/tests/integration/reports-date-range.test.js; dashboard/e2e/routes.spec.ts"],
  "ACT-040": ["PARTIAL", "frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/cmsSurface.test.js"],
  "ACT-041": ["COVERED", "backend/tests/integration/errorLogSurface.test.js"],
  "ACT-042": ["COVERED", "backend/tests/integration/adminOperationsSurface.test.js"],
  "ACT-043": ["PARTIAL", "backend/tests/integration/chatSurface.test.js"],
  "ACT-044": ["PARTIAL", "frontend/tests/e2e/04-landing-pages.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts"],
  "ACT-045": ["PARTIAL", "frontend/tests/e2e/05-route-surfaces.spec.ts"],
  "ACT-046": ["PARTIAL", "backend/tests/integration/productSearchSurface.test.js; frontend/tests/e2e/05-route-surfaces.spec.ts"],
  "ACT-047": ["PARTIAL", "frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/productSurface.test.js"],
  "ACT-048": ["PARTIAL", "backend/tests/integration/cartSurface.test.js; frontend/tests/e2e/01-free-gift-cart.spec.ts"],
  "ACT-049": ["PARTIAL", "backend/tests/integration/cartSurface.test.js; frontend/tests/e2e/02-guest-checkout.spec.ts"],
  "ACT-050": ["PARTIAL", "backend/tests/integration/paymentsSurface.test.js"],
  "ACT-051": ["PARTIAL", "frontend/tests/e2e/05-route-surfaces.spec.ts; frontend/tests/e2e/02-guest-checkout.spec.ts"],
  "ACT-052": ["PARTIAL", "backend/tests/integration/accountSurface.test.js"],
  "ACT-053": ["PARTIAL", "backend/tests/integration/wishlistSurface.test.js; frontend/tests/e2e/05-route-surfaces.spec.ts"],
  "ACT-054": ["PARTIAL", "backend/tests/integration/reviewSurface.test.js"],
  "ACT-055": ["PARTIAL", "frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/storefrontContentSurface.test.js"],
  "ACT-056": ["PARTIAL", "backend/tests/integration/chatSurface.test.js"],
  "ACT-057": ["PARTIAL", "frontend/tests/e2e/05-route-surfaces.spec.ts; frontend/tests/e2e/06-seo.spec.ts"],
  "ACT-058": ["COVERED", "frontend/tests/e2e/06-seo.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts"],
  "ACT-059": ["PARTIAL", "backend/tests/integration/storefrontTrackingSurface.test.js"],
  "ACT-060": ["PARTIAL", "dashboard/e2e/interactions.spec.ts; dashboard/e2e/public-routes.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts"],
  "ACT-061": ["PARTIAL", "backend/tests/integration/securitySurface.test.js; backend/tests/integration/authSurface.test.js"],
  "ACT-062": ["PARTIAL", "backend/tests/integration/cartSurface.test.js; backend/tests/integration/orderSurface.test.js"],
  "ACT-063": ["PARTIAL", "backend/tests/integration/productSearchSurface.test.js; backend/tests/integration/chatSurface.test.js; backend/tests/integration/paymentsSurface.test.js"],
  "ACT-064": ["PARTIAL", "backend/tests/integration/health.test.js; backend/tests/integration/adminOperationsSurface.test.js"],
  "ACT-065": ["COVERED", "backend/tests/integration/backgroundJobsSurface.test.js"],
};

const actionGroups = [
  ["Platform", "Authentication and session", "Login, logout, refresh, expired session, redirect, role home", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Platform", "Password recovery", "Forgot password, reset token, expired/invalid token, password rules", "H,VAL,AUTH,ERR,BND", "API,COMP,E2E"],
  ["Platform", "Authorization", "Route guards, permission gates, forbidden actions, role matrix", "AUTH,ERR", "UNIT,API,E2E"],
  ["Platform", "Navigation and error states", "Sidebar, 404, 403, 500, loading, retry", "STATE,INTERACTION,A11Y", "COMP,E2E"],
  ["Dashboard", "Dashboard overview", "Stats, charts, date/range data, empty/error/loading", "H,STATE,ERR,RENDER", "API,COMP,E2E"],
  ["Products", "Product listing", "Search, filter, sort, pagination, quick edit, select, bulk delete, export", "H,VAL,ERR,BND,STATE,IDEM,CLN,EXP", "API,COMP,E2E"],
  ["Products", "Simple product", "Create, edit, images, price, stock, SEO, draft, publish, delete", "H,VAL,AUTH,ERR,BND,IDEM,CLN,DRAFT", "API,COMP,E2E"],
  ["Products", "Configurable product", "Attributes, variant generation, option values, variant pricing/stock, edit, publish", "H,VAL,ERR,BND,IDEM,CLN,DRAFT", "API,COMP,E2E"],
  ["Products", "Bundle product", "Child selection, quantities, stock, pricing, publish, edit", "H,VAL,ERR,BND,IDEM,CLN,DRAFT", "API,COMP,E2E"],
  ["Products", "Product media", "Upload, image dimensions, validation, remove, reorder, broken URLs", "H,VAL,ERR,BND,FILE,CLN", "UNIT,API,COMP,E2E"],
  ["Products", "CSV and AI import", "Upload, validate, preview, commit, partial failure, duplicate SKU, AI generate/fix", "H,VAL,ERR,BND,IDEM,RETRY,CLN", "UNIT,API,E2E"],
  ["Products", "Search indexing", "Reindex, SKU lookup, design families, count-filter-value, Meili failure", "H,ERR,RETRY", "UNIT,API"],
  ["Categories", "Categories", "Tree/list, CRUD, bulk delete, reorder, image, active/inactive", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Collections", "Collections", "CRUD, product assignment, slug/path, color, redirects", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Inventory", "Inventory", "Stock list, filter, update, low/out-of-stock, concurrency", "H,VAL,ERR,BND,IDEM,STATE", "API,COMP,E2E"],
  ["Offers", "Coupons and offers", "CRUD, date/status, product search, usage limits, discount rules", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "UNIT,API,COMP,E2E"],
  ["Orders", "Order listing", "Search, filter, sort, pagination, status counts, export, invoice", "H,VAL,ERR,BND,STATE,EXP", "API,COMP,E2E"],
  ["Orders", "Order detail", "Items, customer, addresses, totals, payment, timeline, edit", "H,VAL,ERR,BND,IDEM", "API,COMP,E2E"],
  ["Orders", "Fulfillment", "Status update, mark paid, mark COD paid, tracking, partial fulfillment", "H,VAL,ERR,BND,IDEM,CLN", "API,E2E"],
  ["Orders", "Refunds and cancellations", "Refund request, partial/full, cancel, returns, inventory restore", "H,VAL,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Orders", "COD pending", "List, filters, mark paid, race conditions, audit", "H,VAL,ERR,BND,IDEM,STATE", "API,COMP,E2E"],
  ["Customers", "Customers", "List, search, detail, orders, addresses, account state", "H,VAL,ERR,BND,STATE", "API,COMP,E2E"],
  ["Reviews", "Reviews", "List, filter, approve, reject, reply, delete, sharing", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["CMS", "CMS home", "Blocks/widgets, preview, save, publish, empty/error", "H,VAL,ERR,BND,DRAFT", "API,COMP,E2E"],
  ["CMS", "CMS header", "Announcement strip, navigation menu, links, preview, save", "H,VAL,ERR,BND,DRAFT", "API,COMP,E2E"],
  ["CMS", "CMS footer", "Sections, social/legal links, preview, save", "H,VAL,ERR,BND,DRAFT", "API,COMP,E2E"],
  ["CMS", "Static pages", "List, create, edit, delete, draft/publish, preview, URL validation", "H,VAL,ERR,BND,IDEM,CLN,DRAFT", "API,COMP,E2E"],
  ["CMS", "Landing pages", "List, create, edit, delete, draft/publish, preview, URL validation", "H,VAL,ERR,BND,IDEM,CLN,DRAFT", "API,COMP,E2E"],
  ["CMS", "Block builder", "All widget types, reorder, gap, product/category picker, validation", "H,VAL,ERR,BND,DRAFT", "UNIT,COMP,E2E"],
  ["CMS", "Media and gallery", "Upload, list, delete, dimensions, validation, broken assets", "H,VAL,ERR,BND,FILE,CLN", "UNIT,API,COMP,E2E"],
  ["CMS", "Media server", "Image/video upload, multiple upload, delete, batch delete, list, stats, ZIP backup, API-key auth", "H,VAL,AUTH,ERR,BND,FILE,IDEM,CLN,EXP", "API,COMP,E2E"],
  ["CMS", "Shared CMS contracts", "Content types, page schema, block payload compatibility", "H,VAL,BND", "UNIT,CONTRACT"],
  ["CMS", "Revalidation", "CMS update, page update, landing update, cache invalidation failure", "H,ERR,RETRY", "API,E2E"],
  ["Settings", "Site settings", "Metadata, maintenance mode, popular searches, suggested products", "H,VAL,AUTH,ERR,BND,IDEM", "API,COMP,E2E"],
  ["Settings", "Delivery partners", "CRUD, active state, assignment", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Settings", "Product attributes", "Attribute CRUD, values, roles, filter config, validation", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Profile", "Admin profile", "Update info, change password, reset password, validation", "H,VAL,AUTH,ERR,BND", "API,COMP,E2E"],
  ["Admin", "Admin users", "List, create, role change, delete, permissions, audit", "H,VAL,AUTH,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Reports", "Reports", "7 reports, date range, filters, empty/error, export", "H,VAL,ERR,BND,STATE,EXP", "UNIT,API,COMP,E2E"],
  ["Operations", "Cache management", "Inspect, clear, refresh, revalidate, failure", "H,ERR,RETRY", "API,E2E"],
  ["Operations", "Error logs", "List, filter, inspect, delete, permission", "H,VAL,AUTH,ERR,BND,CLN", "API,COMP,E2E"],
  ["Operations", "Notifications", "List, mark read, mark all read, delete", "H,VAL,AUTH,ERR,IDEM,CLN", "API,COMP,E2E"],
  ["Operations", "Chat", "Sessions, messages, AI response, failure, history", "H,VAL,AUTH,ERR,RETRY,STATE", "API,COMP,E2E"],
  ["Storefront", "Home", "CMS widgets, sliders, banners, deals, reviews, recently viewed", "H,ERR,STATE,RENDER,A11Y", "API,COMP,E2E"],
  ["Storefront", "Category and collection listings", "Filters, sort, pagination, URL state, empty/error", "H,VAL,ERR,BND,STATE", "API,COMP,E2E"],
  ["Storefront", "Search", "Query, popular searches, suggestions, empty/error", "H,VAL,ERR,BND,STATE", "API,COMP,E2E"],
  ["Storefront", "Product detail", "Variants, images, stock, price, reviews, wishlist, notify, suggested", "H,VAL,ERR,BND,STATE", "API,COMP,E2E"],
  ["Storefront", "Cart", "Guest/user cart, merge, quantity, remove, coupon, stock, totals", "H,VAL,ERR,BND,IDEM,STATE", "UNIT,API,COMP,E2E"],
  ["Storefront", "Checkout", "Address, shipping, coupon, payment, order, validation, retry", "H,VAL,ERR,BND,IDEM,CLN", "API,COMP,E2E"],
  ["Storefront", "Payments", "COD, online sandbox, success/failure/cancel, callback, refund", "H,VAL,ERR,BND,IDEM,RETRY", "API,E2E,MANUAL"],
  ["Storefront", "Order confirmation and tracking", "Confirmation, COD confirmation, tracking, not found", "H,VAL,ERR,STATE", "API,COMP,E2E"],
  ["Storefront", "Account", "Profile, orders, order detail, addresses, password, protected routes", "H,VAL,AUTH,ERR,BND,IDEM", "API,COMP,E2E"],
  ["Storefront", "Wishlist", "Guest/user, add/remove, move to cart, empty state", "H,VAL,AUTH,ERR,BND,IDEM", "API,COMP,E2E"],
  ["Storefront", "Reviews", "Submit, validation, moderation, display, duplicate", "H,VAL,ERR,BND,IDEM", "API,COMP,E2E"],
  ["Storefront", "FAQs, contact, policies, static/landing pages", "Render, navigation, forms, validation, 404", "H,VAL,ERR,STATE,A11Y", "API,COMP,E2E"],
  ["Storefront", "Chat and AI", "Session, messages, suggestions, failure, fallback", "H,VAL,ERR,RETRY,STATE", "API,COMP,E2E"],
  ["Storefront", "PWA and offline", "Manifest, install prompt, offline page, service worker", "H,ERR,STATE,A11Y", "COMP,E2E,MANUAL"],
  ["Storefront", "SEO and metadata", "Metadata, JSON-LD, sitemap, robots, canonical, revalidation", "H,VAL,ERR", "UNIT,E2E"],
  ["Storefront", "Analytics", "GA, Clarity, Meta Pixel, conversion events, blocked scripts", "H,ERR,RETRY", "UNIT,E2E,MANUAL"],
  ["Cross-cutting", "Responsive and accessibility", "Mobile/tablet/desktop, keyboard, focus, labels, contrast, screen reader", "RESP,A11Y", "COMP,E2E,A11Y"],
  ["Cross-cutting", "Security", "Authn/authz, rate limits, CORS, uploads, injection, mass assignment, secrets", "AUTH,VAL,SEC", "UNIT,API,SEC"],
  ["Cross-cutting", "Data integrity and concurrency", "Transactions, duplicate submissions, stock races, idempotency, cleanup", "IDEM,CLN,BND", "UNIT,API,LOAD"],
  ["Cross-cutting", "External failure and resilience", "Mongo, Redis, Meili, media, payment, email, AI timeout/retry", "ERR,RETRY", "UNIT,API,E2E"],
  ["Cross-cutting", "Health and observability", "Health, logs, error tracking, metrics, alerts", "H,ERR", "API,E2E,MANUAL"],
  ["Cross-cutting", "Background jobs", "Media cleanup, CSV cleanup, asset cleanup, AI daily report", "H,ERR,IDEM,RETRY", "UNIT,API"],
].map(([area, feature, actions, cases, layers], index) => {
  const id = `ACT-${String(index + 1).padStart(3, "0")}`;
  const [status, testOwner] = actionCoverage[id] || [
    "TODO",
    "Unassigned",
  ];
  return {
    id,
    area,
    feature,
    actions,
    cases,
    layers,
    status,
    testOwner,
  };
});

function collectExistingTests() {
  const tests = [];
  const add = (file, domain, framework) => {
    tests.push({
      file: path.relative(workspaceRoot, file).split(path.sep).join("/"),
      domain,
      framework,
    });
  };
  const backendTests = path.join(backendRoot, "tests");
  if (fs.existsSync(backendTests)) {
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.test\.js$/.test(entry.name)) {
          const name = entry.name.toLowerCase();
          const domainMatchers = [
            [/report|sales/, "Reports"],
            [/bulk-import|catalog|product|design/, "Products"],
            [/filter/, "Product Filters"],
            [/meta/, "Meta Conversions"],
            [/chat/, "Chat"],
            [/asset/, "Media Assets"],
            [/payments?/, "Payments"],
            [/tracking/, "Analytics"],
            [/backgroundjobs/, "Background Jobs"],
            [/security/, "Security"],
            [/errorlog/, "Error Logs"],
            [/directapproutes|publicread|storefrontcontent/, "Storefront"],
            [/cart/, "Cart"],
            [/cms/, "CMS"],
            [/settings/, "Settings"],
            [/faq/, "FAQs"],
            [/account/, "Account"],
            [/wishlist/, "Wishlist"],
            [/adminoperations/, "Admin Operations"],
            [/adminuser/, "Admin Users"],
            [/refund/, "Refunds"],
            [/bundleproduct/, "Bundle Products"],
            [/order/, "Orders"],
            [/collection/, "Collections"],
            [/review/, "Reviews"],
            [/auth|google/, "Auth"],
            [/health/, "Health"],
            [/maintenance/, "Platform"],
          ];
          const domain =
            domainMatchers.find(([pattern]) => pattern.test(name))?.[1] ||
            "Unmapped";
          add(full, domain, "Jest");
        }
      }
    };
    walk(backendTests);
  }
  const dashboardTests = path.join(dashboardRoot, "e2e");
  if (fs.existsSync(dashboardTests)) {
    for (const entry of fs.readdirSync(dashboardTests)) {
      if (!/\.spec\.ts$/.test(entry)) continue;
      add(
        path.join(dashboardTests, entry),
        entry.includes("order")
          ? "Orders"
          : entry.includes("public") || entry.includes("auth")
            ? "Auth"
            : entry.includes("routes") || entry.includes("interactions")
              ? "Dashboard"
              : "Unmapped",
        "Playwright"
      );
    }
  }
  const frontendTests = path.join(frontendRoot, "tests", "e2e");
  if (fs.existsSync(frontendTests)) {
    for (const entry of fs.readdirSync(frontendTests)) {
      if (!/\.spec\.ts$/.test(entry)) continue;
      const name = entry.toLowerCase();
      const domain = name.includes("cart")
        ? "Cart"
        : name.includes("checkout")
          ? "Checkout"
          : name.includes("product")
            ? "Product Detail"
            : name.includes("landing") || name.includes("cms")
              ? "CMS"
              : name.includes("route")
                ? "Storefront"
                : name.includes("seo")
                  ? "SEO"
                  : "Unmapped";
      add(path.join(frontendTests, entry), domain, "Playwright");
    }
  }
  return tests.sort((a, b) => a.file.localeCompare(b.file));
}

const testOwners = {
  auth: "backend/tests/integration/authSurface.test.js",
  adminAuth: "backend/tests/integration/adminAuthSurface.test.js",
  adminUsers: "backend/tests/integration/adminUserSurface.test.js",
  catalog: "backend/tests/integration/catalogSurface.test.js",
  product: "backend/tests/integration/productSurface.test.js",
  productCreate: "backend/tests/integration/product.test.js",
  settings: "backend/tests/integration/settingsSurface.test.js",
  faq: "backend/tests/integration/faqSurface.test.js",
  cms: "backend/tests/integration/cmsSurface.test.js",
  account: "backend/tests/integration/accountSurface.test.js",
  adminOperations:
    "backend/tests/integration/adminOperationsSurface.test.js",
  cart: "backend/tests/integration/cartSurface.test.js",
  order: "backend/tests/integration/orderSurface.test.js",
  payments: "backend/tests/integration/paymentsSurface.test.js",
  storefrontContent:
    "backend/tests/integration/storefrontContentSurface.test.js",
  review: "backend/tests/integration/reviewSurface.test.js",
  asset: "backend/tests/integration/assetSurface.test.js",
  tracking: "backend/tests/integration/storefrontTrackingSurface.test.js",
  variantImport:
    "backend/tests/integration/variantImportSurface.test.js",
  chat: "backend/tests/integration/chatSurface.test.js",
  productSearch: "backend/tests/integration/productSearchSurface.test.js",
};

function covered(testOwner) {
  return { status: "COVERED", testOwner };
}

function backendRowCoverage(item) {
  const { method, path: routePath, access, domain } = item;

  if (domain === "Auth" && routePath.startsWith("/api/v1/auth/")) {
    return covered(testOwners.auth);
  }

  if (
    /^\/api\/v1\/(admin\/)?categor(?:y|ies)(\/|$)/.test(routePath) ||
    /^\/api\/v1\/(admin\/)?attributes(\/|$)/.test(routePath) ||
    routePath === "/api/v1/filter/:slug"
  ) {
    return covered(testOwners.catalog);
  }

  if (routePath === "/api/v1/collection/:slug") {
    return covered(testOwners.catalog);
  }
  if (
    method === "GET" &&
    routePath === "/api/v1/admin/collections"
  ) {
    return covered(testOwners.catalog);
  }
  if (
    method === "POST" &&
    routePath === "/api/v1/admin/collections"
  ) {
    return covered(testOwners.catalog);
  }
  if (
    method === "DELETE" &&
    routePath === "/api/v1/admin/collections/:id"
  ) {
    return covered(testOwners.catalog);
  }

  if (routePath === "/api/v1/product/create") {
    return covered(testOwners.productCreate);
  }

  if (method === "GET" && routePath === "/api/v1/product/search") {
    return covered(testOwners.productSearch);
  }

  const productRows = new Set([
    "GET /api/v1/product/all",
    "POST /api/v1/product/all",
    "GET /api/v1/product/:param",
    "POST /api/v1/product/:productId",
    "DELETE /api/v1/product/:productId",
    "POST /api/v1/product/bulk-delete",
    "POST /api/v1/product/check-stock",
    "GET /api/v1/product/price-stock/:url_key",
    "GET /api/v1/product/recommendations",
    "GET /api/v1/product/search-index",
    "GET /api/v1/product/search/suggest",
    "PUT /api/v1/product/update",
    "GET /api/v1/product/url/:url_key",
    "POST /api/v1/product/url/:url_key",
    "GET /api/v1/product/variant/:variantId",
    "GET /api/v1/admin/products",
    "POST /api/v1/admin/products",
    "POST /api/v1/admin/products/:productId",
    "GET /api/v1/admin/products/:productId",
    "PATCH /api/v1/admin/products/:productId",
    "DELETE /api/v1/admin/products/:productId",
    "POST /api/v1/admin/products/bulk-delete",
    "PATCH /api/v1/variants/:productId/bulk-price",
    "PATCH /api/v1/variants/:productId/bulk-stock",
    "GET /api/v1/variants/:productId/export",
  ]);
  if (productRows.has(`${method} ${routePath}`)) {
    return covered(testOwners.product);
  }

  if (/^\/api\/v1\/admin\/users(\/|$)/.test(routePath)) {
    return covered(testOwners.adminUsers);
  }
  if (/^\/api\/v1\/admin\/revalidate(\/|$)/.test(routePath)) {
    return covered(testOwners.adminOperations);
  }
  if (/^\/api\/v1\/admin\/collections(\/|$)/.test(routePath)) {
    return covered(testOwners.catalog);
  }
  if (/^\/api\/v1\/admin\/csv-images(\/|$)/.test(routePath)) {
    return covered(testOwners.asset);
  }
  if (/^\/api\/v1\/admin\/error-logs(\/|$)/.test(routePath)) {
    return covered(testOwners.errorLog);
  }
  if (/^\/api\/v1\/admin\/dashboard(\/|$)/.test(routePath)) {
    return covered(testOwners.dashboard);
  }
  if (/^\/api\/v1\/admin\/media(\/|$)/.test(routePath)) {
    return covered(testOwners.asset);
  }
  if (routePath === "/api/v1/admin/products/commit-import" || routePath === "/api/v1/admin/products/validate-import") {
    return covered(testOwners.bulkImport);
  }
  if (routePath === "/api/v1/admin/products/create") {
    return covered(testOwners.productCreate);
  }
  if (routePath === "/api/v1/admin/products/search" || routePath === "/api/v1/admin/products/sku-lookup" || routePath === "/api/v1/admin/products/count-filter-value" || routePath === "/api/v1/admin/products/design-families" || routePath === "/api/v1/admin/products/reindex-search") {
    return covered(testOwners.product);
  }
  if (routePath.startsWith("/api/v1/admin/ai-reports")) {
    return covered(testOwners.backgroundJobs);
  }
  if (/^\/api\/v1\/admin\/reports(\/|$)/.test(routePath)) {
    return covered(testOwners.reports);
  }
  if (/^\/api\/v1\/admin\/products\/ai(\/|$)/.test(routePath)) {
    return covered(testOwners.product);
  }
  if (/^\/api\/v1\/admin\/reviews(\/|$)/.test(routePath)) {
    return covered(testOwners.review);
  }
  if (/^\/api\/v1\/health(\/|$)/.test(routePath)) {
    return covered(testOwners.health);
  }
  if (/^\/api\/v1\/chat\/admin(\/|$)/.test(routePath)) {
    return covered(testOwners.chat);
  }

  if (/^\/api\/v1\/(admin\/)?settings(\/|$)/.test(routePath)) {
    return covered(testOwners.settings);
  }

  if (/^\/api\/v1\/faqs(\/|$)/.test(routePath)) {
    return covered(testOwners.faq);
  }
  if (/^\/api\/v1\/admin\/faq-categories(\/|$)/.test(routePath)) {
    return covered(testOwners.faq);
  }

  if (/^\/api\/v1\/(admin\/)?cms(\/|$)/.test(routePath)) {
    return covered(testOwners.cms);
  }
  if (/^\/api\/v1\/admin\/pages(\/|$)/.test(routePath)) {
    return covered(testOwners.cms);
  }

  if (/^\/api\/v1\/addresses(\/|$)/.test(routePath)) {
    return covered(testOwners.account);
  }
  if (/^\/api\/v1\/wishlist(\/|$)/.test(routePath)) {
    return covered(testOwners.account);
  }

  if (/^\/api\/v1\/cart(\/|$)/.test(routePath)) {
    return covered(testOwners.cart);
  }

  if (/^\/api\/v1\/payments(\/|$)/.test(routePath)) {
    return covered(testOwners.payments);
  }

  if (/^\/api\/v1\/footer(\/|$)/.test(routePath)) {
    return covered(testOwners.storefrontContent);
  }
  if (/^\/api\/v1\/homepage(\/|$)/.test(routePath)) {
    return covered(testOwners.storefrontContent);
  }
  if (/^\/api\/v1\/stock-notify(\/|$)/.test(routePath)) {
    return covered(testOwners.storefrontContent);
  }

  if (
    routePath === "/api/v1/chat/session" ||
    routePath === "/api/v1/chat/message" ||
    /^\/api\/v1\/chat\/session\/:sessionId\/(?:contact|end|request-human)$/.test(
      routePath
    )
  ) {
    return covered(testOwners.chat);
  }

  if (routePath === "/api/v1/variants/:productId/import") {
    return covered(testOwners.variantImport);
  }

  if (routePath === "/api/v1/analytics/track") {
    return covered(testOwners.tracking);
  }
  if (routePath === "/api/v1/meta/event") {
    return covered(testOwners.tracking);
  }

  if (/^\/api\/v1\/admin\/assets(\/|$)/.test(routePath)) {
    return covered(testOwners.asset);
  }

  if (/^\/api\/v1\/review(\/|$)/.test(routePath)) {
    if (method === "GET" && routePath === "/api/v1/review/my-purchases") {
      return covered(testOwners.review);
    }
    return covered(testOwners.review);
  }

  if (/^\/api\/v1\/orders(\/|$)/.test(routePath)) {
    return covered(testOwners.order);
  }
  if (/^\/api\/v1\/admin\/orders(\/|$)/.test(routePath)) {
    return covered(testOwners.order);
  }

  if (/^\/api\/v1\/admin\/notifications(\/|$)/.test(routePath)) {
    return covered(testOwners.adminOperations);
  }
  if (/^\/api\/v1\/admin\/delivery-partners(\/|$)/.test(routePath)) {
    return covered(testOwners.adminOperations);
  }
  if (/^\/api\/v1\/admin\/coupons(\/|$)/.test(routePath)) {
    return covered(testOwners.adminOperations);
  }
  if (
    routePath === "/api/v1/admin/customers" ||
    /^\/api\/v1\/admin\/customers\/:customerId$/.test(routePath)
  ) {
    return covered(testOwners.adminOperations);
  }

  if (access === "admin" || access.startsWith("permission:")) {
    return { status: "PARTIAL (AUTH)", testOwner: testOwners.adminAuth };
  }

  return { status: "TODO", testOwner: "" };
}

function renderMarkdown(inventory) {
  const lines = [];
  lines.push("# Test Coverage Matrix");
  lines.push("");
  lines.push(
    "Generated from backend routes, dashboard routes, storefront pages, media server routes, and the feature action inventory."
  );
  lines.push("");
  lines.push("Regenerate:");
  lines.push("");
  lines.push("```bash");
  lines.push("node backend/scripts/generate-test-inventory.mjs");
  lines.push("node backend/scripts/generate-test-inventory.mjs --check");
  lines.push("```");
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("| Area | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| Backend mounts | ${inventory.counts.mounts} |`);
  lines.push(`| Backend endpoint surfaces | ${inventory.counts.endpoints} |`);
  lines.push(`| Protected admin route surfaces | ${inventory.counts.protectedAdminRoutes} |`);
  lines.push(`| Direct app routes | ${inventory.counts.directRoutes} |`);
  lines.push(`| Background jobs | ${inventory.counts.backgroundJobs} |`);
  lines.push(`| Backend duplicate method/path pairs | ${inventory.counts.duplicates} |`);
  lines.push(`| Dashboard routes | ${inventory.counts.dashboardRoutes} |`);
  lines.push(`| Storefront pages/routes | ${inventory.counts.storefrontRoutes} |`);
  lines.push(`| Media server routes | ${inventory.counts.mediaRoutes} |`);
  lines.push(`| Feature/action groups | ${inventory.counts.actions} |`);
  lines.push(`| Existing test files | ${inventory.counts.existingTests} |`);
  lines.push("");
  lines.push("## Completeness rule");
  lines.push("");
  lines.push(
    "Every backend endpoint, direct app route, background job, dashboard route, storefront route, media server route, and action group in this file must have a test owner and a status before a feature is considered complete. New routes or actions require regenerating this inventory and updating the status. The `--check` mode fails when the generated inventory differs from this file."
  );
  lines.push("");
  lines.push("## Case legend");
  lines.push("");
  lines.push(
    "`H` happy path, `VAL` validation, `AUTH` authentication/authorization, `SIG` webhook signature verification, `ERR` error/not-found/conflict, `BND` boundaries, `IDEM` idempotency/concurrency, `CLN` cleanup, `STATE` empty/loading/error/pagination/filter, `DRAFT` draft/persistence, `RENDER` render, `INTERACTION` user interaction, `RESP` responsive, `A11Y` accessibility, `SEC` security, `RETRY` integration failure/retry, `EXP` export, `FILE` upload/media."
  );
  lines.push("");
  lines.push("## Mounted route files");
  lines.push("");
  lines.push("| Base | File | Source |");
  lines.push("| --- | --- | --- |");
  for (const item of inventory.mounts) {
    lines.push(
      `| \`${escapeCell(item.base)}\` | \`${escapeCell(item.file)}\` | \`${escapeCell(item.source)}\` |`
    );
  }
  lines.push("");
  lines.push("## Unmounted route files");
  lines.push("");
  if (!inventory.unmounted.length) {
    lines.push("None.");
  } else {
    lines.push(
      "These files define routes but are not mounted from `src/app.js` or another mounted router. Confirm whether they are dead code or missing functionality."
    );
    lines.push("");
    for (const file of inventory.unmounted) lines.push(`- \`${file}\``);
  }
  lines.push("");
  lines.push("## Inventory review findings");
  lines.push("");
  lines.push("### Admin-prefixed endpoints without an admin or permission guard");
  lines.push("");
  lines.push(
    "Review these before treating them as defects. Some are public or authenticated routes mounted under the admin prefix so the same router can serve both dashboard and storefront callers."
  );
  lines.push("");
  if (!inventory.findings.adminWeak.length) {
    lines.push("None.");
  } else {
    lines.push("| Method | Endpoint | Access | Source |");
    lines.push("| --- | --- | --- | --- |");
    for (const item of inventory.findings.adminWeak) {
      lines.push(
        `| ${item.method} | \`${escapeCell(item.path)}\` | ${escapeCell(item.access)} | \`${escapeCell(item.source)}\` |`
      );
    }
  }
  lines.push("");
  lines.push("### Duplicate method/path definitions");
  lines.push("");
  if (!inventory.findings.duplicates.length) {
    lines.push("None.");
  } else {
    lines.push("| Method | Endpoint | Sources |");
    lines.push("| --- | --- | --- |");
    for (const item of inventory.findings.duplicates) {
      lines.push(
        `| ${item.method} | \`${escapeCell(item.path)}\` | ${[item.source, ...item.duplicates].map((value) => `\`${escapeCell(value)}\``).join("<br>")} |`
      );
    }
  }
  lines.push("");
  lines.push("## Missing referenced assets");
  lines.push("");
  if (!inventory.assetFindings.length) {
    lines.push("None.");
  } else {
    lines.push("| Asset | Referenced by | Issue |");
    lines.push("| --- | --- | --- |");
    for (const item of inventory.assetFindings) {
      lines.push(
        `| \`${escapeCell(item.asset)}\` | \`${escapeCell(item.referencedBy)}\` | ${escapeCell(item.issue)} |`
      );
    }
  }
  lines.push("");
  lines.push("## Direct app routes");
  lines.push("");
  lines.push("| ID | Area | Domain | Method | Route | Access | Handler | Cases | Source | Test owner | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of inventory.directAppRoutes) {
    lines.push(
      `| ${item.id} | ${escapeCell(item.area)} | ${escapeCell(item.domain)} | ${item.method} | \`${escapeCell(item.path)}\` | ${escapeCell(item.access)} | ${escapeCell(item.handler)} | ${escapeCell(item.cases)} | \`${escapeCell(item.source)}\` | ${item.coverage.testOwner ? `\`${escapeCell(item.coverage.testOwner)}\`` : ""} | ${escapeCell(item.coverage.status)} |`
    );
  }
  lines.push("");
  lines.push("## Background jobs");
  lines.push("");
  lines.push("| ID | Job | Trigger | Cases | Source | Test owner | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const item of inventory.backgroundJobs) {
    lines.push(
      `| ${item.id} | ${escapeCell(item.name)} | ${escapeCell(item.trigger)} | ${escapeCell(item.cases)} | \`${escapeCell(item.source)}\` | \`${escapeCell(item.testOwner)}\` | ${escapeCell(item.status)} |`
    );
  }
  lines.push("");
  lines.push("## Backend API inventory");
  lines.push("");
  lines.push("| ID | Area | Domain | Method | Endpoint | Access | Handler | Cases | Source | Test owner | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  inventory.backend.forEach((item, index) => {
    const coverage = backendRowCoverage(item);
    lines.push(
      `| API-${String(index + 1).padStart(4, "0")} | ${escapeCell(item.area)} | ${escapeCell(item.domain)} | ${item.method} | \`${escapeCell(item.path)}\` | ${escapeCell(item.access)} | ${escapeCell(item.handler)} | ${escapeCell(item.cases)} | \`${escapeCell(item.source)}\` | ${coverage.testOwner ? `\`${coverage.testOwner}\`` : ""} | ${coverage.status} |`
    );
  });
  lines.push("");
  lines.push("## Dashboard route inventory");
  lines.push("");
  lines.push("| ID | Domain | Route | Component | Access | Required actions | Cases | Test owner | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of inventory.dashboard) {
    lines.push(
      `| ${item.id} | ${escapeCell(item.domain)} | \`${escapeCell(item.route)}\` | ${escapeCell(item.component)} | ${escapeCell(item.access)} | ${escapeCell(item.actions)} | ${escapeCell(item.cases)} | \`${escapeCell(item.testOwner)}\` | ${escapeCell(item.status)} |`
    );
  }
  lines.push("");
  lines.push("## Storefront route inventory");
  lines.push("");
  lines.push("| ID | Domain | Route | Type | File | Cases | Test owner | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of inventory.storefront) {
    lines.push(
      `| ${item.id} | ${escapeCell(item.domain)} | \`${escapeCell(item.route)}\` | ${escapeCell(item.type)} | \`${escapeCell(item.file)}\` | ${escapeCell(item.cases)} | \`${escapeCell(item.testOwner)}\` | ${escapeCell(item.status)} |`
    );
  }
  lines.push("");
  lines.push("## Media server inventory");
  lines.push("");
  lines.push("| ID | Method | Route | Access | Handler | Cases | Source | Test owner | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of inventory.media) {
    lines.push(
      `| ${item.id} | ${item.method} | \`${escapeCell(item.path)}\` | ${escapeCell(item.access)} | ${escapeCell(item.handler)} | ${escapeCell(item.cases)} | \`${escapeCell(item.source)}\` | \`${escapeCell(item.testOwner)}\` | ${escapeCell(item.status)} |`
    );
  }
  lines.push("");
  lines.push("## Feature and action inventory");
  lines.push("");
  lines.push(
    "`PARTIAL` means at least one automated layer covers part of the group; unlisted cases remain gaps. `TODO` means no direct automated coverage yet."
  );
  lines.push("");
  lines.push(
    "| ID | Area | Feature | Actions | Cases | Layers | Test owner | Status |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of inventory.actions) {
    lines.push(
      `| ${item.id} | ${escapeCell(item.area)} | ${escapeCell(item.feature)} | ${escapeCell(item.actions)} | ${escapeCell(item.cases)} | ${escapeCell(item.layers)} | ${escapeCell(item.testOwner)} | ${escapeCell(item.status)} |`
    );
  }
  lines.push("");
  lines.push("## Existing test files");
  lines.push("");
  lines.push(
    "These suites already exist. They are not yet mapped to individual inventory rows; use them as a starting point and mark rows when each case is covered."
  );
  lines.push("");
  lines.push("| File | Domain | Framework | Status |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of inventory.existingTests) {
    lines.push(
      `| \`${escapeCell(item.file)}\` | ${escapeCell(item.domain)} | ${escapeCell(item.framework)} | EXISTING |`
    );
  }
  lines.push("");
  lines.push("## Known test-environment issues");
  lines.push("");
  lines.push(
    "- `SystemErrorLog.environment` does not accept `test`, so error persistence emits a validation warning during error-path tests."
  );
  lines.push(
    "- Redis is not available in Jest, so cache read/write warnings are expected and do not fail tests."
  );
  lines.push(
    "- Storefront guest-checkout mutation tests are skipped by default; set `E2E_ALLOW_ORDER_MUTATION=1` and `E2E_CHECKOUT_PRODUCT_SLUG` only against disposable test data."
  );
  lines.push("");
  lines.push("## Coverage notes");
  lines.push("");
  lines.push(
    `- \`backend/tests/integration/adminAuthSurface.test.js\` verifies the AUTH case for all ${inventory.counts.protectedAdminRoutes} protected admin route surfaces. Functional cases for those rows remain TODO.`
  );
  lines.push(
    "- `backend/tests/integration/authSurface.test.js` covers all 17 auth route surfaces, including registration/login OTP, password reset, refresh rotation, logout, profile access, change-password, and Google auth validation."
  );
  lines.push(
    "- `backend/tests/integration/catalogSurface.test.js` covers category CRUD/bulk-delete across public and admin prefixes, attribute CRUD and allowed-value lifecycle, collection listing/detail/deletion, and storefront filter generation."
  );
  lines.push(
    "- `backend/tests/integration/productSurface.test.js` covers public product list/detail/URL/category reads, price-stock/suggestions/index/recommendations/stock checks, variant URL and legacy reads, admin product list/detail/update/delete, and variant bulk stock/price/export."
  );
  lines.push(
    "- `backend/tests/integration/settingsSurface.test.js` covers site-setting list/scope, create/read/update/delete, registered-key and type validation, scope protection, public settings, popular searches, suggested products, and maintenance mode."
  );
  lines.push(
    "- `backend/tests/integration/faqSurface.test.js` covers FAQ category list/create/duplicate/update/delete/reorder/fix and FAQ list/create/update/delete/reorder."
  );
  lines.push(
    "- `backend/tests/integration/cmsSurface.test.js` covers CMS content CRUD and block updates, landing-page CRUD/public reads, and static-page draft/publish/public-read/list/delete."
  );
  lines.push(
    "- `backend/tests/integration/cmsContractSurface.test.js` verifies semantic parity between the backend CMS registry and `shared/cms/content-types.json`, then round-trips a canonical payload for every content type through draft, publish, and public read."
  );
  lines.push(
    "- `backend/tests/integration/accountSurface.test.js` covers authenticated address create/list/update/delete/permissions and wishlist read/toggle/enriched-product isolation."
  );
  lines.push(
    "- `backend/tests/integration/adminOperationsSurface.test.js` covers notification read/delete, delivery-partner CRUD, coupon CRUD/validation/product search, and customer list/detail stats."
  );
  lines.push(
    "- `backend/tests/integration/orderSurface.test.js` covers authenticated order history/detail, guest lookup/claim/convert, payment status, admin order list/status-counts/detail/CSV export, status transitions, mark-paid (online/COD), and invoice requests."
  );
  lines.push(
    "- `backend/tests/integration/cartSurface.test.js` covers cart create/get/HEAD, item add/update/remove/clear, count/items/price-summary/product-data/summary in GET and POST forms, guest merge, checkout recovery/locking, empty-cart and guest guards, and coupon listing/apply/remove."
  );
  lines.push(
    "- `backend/tests/integration/paymentsSurface.test.js` covers payment-option cart/empty/config guards, enabled-method filtering, Razorpay signature parameter validation, failed-signature order cancellation, paid-order confirmation, and unknown-order signature handling."
  );
  lines.push(
    "- `backend/tests/integration/storefrontContentSurface.test.js` covers footer content/empty reads, homepage enabled filtering/order/product-slider stock filtering/by-id reads, and stock-notification validation/upsert behavior."
  );
  lines.push(
    "- `media-server-infantscare/tests/mediaServer.test.js` covers dashboard/static serving, API-key auth, upload/optimization, multi-upload failures, listing/search/pagination, stats, single/batch delete, and ZIP backups."
  );
  lines.push(
    "- `backend/tests/integration/backgroundJobsSurface.test.js` covers stale media/CSV/asset retention cleanup, dry runs, delete failures, cron/startup triggers, and deterministic daily AI report generation."
  );
  lines.push(
    "- `backend/tests/integration/productSearchSurface.test.js` covers required search terms, published/in-stock text search, SKU-prefix matches, product-type filtering, and pagination."
  );
  lines.push(
    "- `backend/tests/integration/chatSurface.test.js` covers session creation/resume/contact capture, AI reply persistence and product suggestions, escalation/queued replies, human handoff, contact updates, and idempotent chat ending."
  );
  lines.push(
    "- `dashboard/e2e/routes.spec.ts` and `dashboard/e2e/public-routes.spec.ts` cover route-level render, auth guard, redirect, dynamic-route, 404 checks, and mobile login-form visibility for all 41 dashboard routes."
  );
  lines.push(
    "- `dashboard/e2e/auth-interactions.spec.ts` covers login email validation, invalid-credential errors, forgot-password transition, and OTP request/verification transition."
  );
  lines.push(
    "- `dashboard/e2e/interactions.spec.ts` covers desktop/mobile sidebar state and navigation, dashboard date presets, product/order/customer search, product and order filter/export surfaces, order selection/bulk actions, and the CMS create-page dialog. Remaining per-route interaction, state, responsive, and accessibility cases remain `PARTIAL (RENDER)`.",
    "- `dashboard/e2e/order-details.spec.ts` and `order-details.visual.spec.ts` cover item clamping, table/card chrome, section styling, location/customer de-duplication, the overflow action menu, and desktop/mobile visual baselines.",
    "- `frontend/tests/e2e/05-route-surfaces.spec.ts` covers all 23 storefront route surfaces: public render, unauthenticated redirects, live product/category/collection data, policy redirects, and revalidation API auth/validation/idempotency. Authenticated account, cart, checkout, wishlist, and per-route interaction/responsive/accessibility cases remain `PARTIAL (RENDER)`."
  );
  lines.push(
    `- \`backend/tests/integration/securitySurface.test.js\` covers baseline security headers, credentialed CORS preflight, Mongo operator login sanitization, profile mass-assignment rejection, admin RBAC, and login rate limiting. Upload validation, injection, secret scanning, and broader permission-matrix cases remain \`PARTIAL\` for ACT-061.`
  );
  lines.push(
    `- \`backend/tests/integration/wishlistSurface.test.js\` covers auth guards, empty state, add/remove toggling, per-user isolation, published-only enrichment, active/expired offers, and configurable variant price fallback. Guest wishlists and move-to-cart remain uncovered, so ACT-053 stays \`PARTIAL\`.`
  );
  lines.push(
    `- \`backend/tests/integration/errorLogSurface.test.js\` covers error-log permissions, source/status/search/date filters, pagination and source metadata, read-only field sanitization, single deletion/404, and full purge.`
  );
  lines.push(
    `- \`frontend/tests/e2e/06-seo.spec.ts\` covers robots allow/deny rules, sitemap static/category/product URLs, home canonical/social/JSON-LD metadata, product canonical/Product schema, search noindex, and the installable manifest. Sitemap fetching was corrected to the live \`/product/all\` and \`/category\` response shapes; install-prompt and service-worker behavior remain uncovered for ACT-057.`
  );
  lines.push(
    `- \`backend/tests/integration/adminUserSurface.test.js\` covers admin-user listing/search/pagination, safe fields, creation validation/duplicates/email, role and suspension changes, self and last-super-admin guards, deletion guards, permission denial, and the audit trail. Combined role+suspension updates now write separate audit entries.`
  );
  lines.push(
    `- \`backend/tests/integration/refundSurface.test.js\` covers refund auth/super-privilege gates, order lookup validation, unsupported methods/unpaid orders/amount bounds, full Razorpay refund persistence, automatic cancellation and inventory restore, duplicate-history prevention, email dispatch, and Razorpay status polling with attempt resolution. Partial-refund cancellation semantics and live PhonePe refund calls remain uncovered for ACT-020.`
  );
  lines.push(
    `- \`backend/tests/integration/bundleProductSurface.test.js\` covers bundle config validation, simple/variant child SKUs, quantity-based availability and deductions, derived PDP stock/pricing, child title enrichment, unpublished/out-of-stock child handling, and admin composition/pricing edits. Bundle create-through-dashboard and idempotent cleanup cases remain uncovered for ACT-009.`
  );
  lines.push(
    "- `backend/tests/integration/variantImportSurface.test.js` covers auth, missing-file, validate-only, single-row create, SKU-based re-import with embedded-id preservation, and missing-product failures for CSV variant import."
  );
  lines.push(
    "- `backend/tests/integration/storefrontTrackingSurface.test.js` covers analytics event shorthand/batch capping/invalid-event drops and Meta conversion validation plus normalized client/user-data forwarding."
  );
  lines.push(
    "- `backend/tests/integration/assetSurface.test.js` covers asset auth guards, filtered/page/cursor listing, temp/used/permanent delete rules, force archive, bulk delete outcomes, publicId/path promotion, upload validation and hash deduplication, and dry-run/real cleanup."
  );
  lines.push(
    "- `backend/tests/integration/reviewSurface.test.js` covers review auth guards, empty purchases, purchased-order product/variant enrichment, authenticated/guest review creation rules, owned review read/update/delete, public product/variant review pagination and approval filtering, and top-review formatting."
  );
  lines.push(
    "- `GET /email-logo.png` serves the local `mail_templates/logo.png` PNG asset; email templates still use the dashboard-hosted logo URL for delivery."
  );
  lines.push(
    "- `backend/tests/integration/publicReadSurface.test.js` covers public read smoke responses and payment-option validation. Response shape and data-state cases remain TODO."
  );
  lines.push(
    "- `backend/tests/integration/directAppRoutes.test.js` covers all 9 direct app routes, including the public email-logo PNG."
  );
  lines.push(
    "- `backend/tests/integration/cart_order.test.js` is skipped because it depends on missing test user/product fixtures."
  );
  lines.push(
    "- Auth, catalog, product, settings, FAQ, CMS, account, admin operations, order, cart, payment, storefront content, review, asset, analytics, Meta-conversion, CSV variant-import, customer-chat, product-search, background-job, and media-server rows in the backend API inventory are mapped to their owning suites and statuses. Protected admin rows without functional coverage are marked `PARTIAL (AUTH)`."
  );
  lines.push("");
  lines.push("## Execution order");
  lines.push("");
  lines.push("1. Run static checks: typecheck, lint, production build.");
  lines.push("2. Run backend unit tests.");
  lines.push("3. Run backend API integration tests for every endpoint row.");
  lines.push("4. Run dashboard and storefront component tests for logic and rendering.");
  lines.push("5. Run contract tests for request/response schemas.");
  lines.push("6. Run Playwright smoke tests.");
  lines.push("7. Run critical cross-application journeys.");
  lines.push("8. Run domain-by-domain Playwright tests.");
  lines.push("9. Run accessibility, responsive, visual, security, performance, and load tests.");
  lines.push("10. Run the full suite on merge and nightly.");
  lines.push("");
  lines.push("## Definition of done");
  lines.push("");
  lines.push("- Every inventory row has a test file and status.");
  lines.push("- Every write endpoint has happy, validation, auth, conflict, boundary, idempotency, and cleanup coverage.");
  lines.push("- Every route has render, access, loading/empty/error, and responsive coverage.");
  lines.push("- Every action group has at least one UI or API test.");
  lines.push("- Data cleanup is verified.");
  lines.push("- Tests run against an isolated database with external services mocked or sandboxed.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const backend = collectBackend();
const directAppRoutes = collectDirectAppRoutes();
const backgroundJobs = collectBackgroundJobs();
const assetFindings = [];
const emailLogo = path.join(backendRoot, "src", "mail_templates", "logo.png");
if (!fs.existsSync(emailLogo)) {
  assetFindings.push({
    asset: "backend/src/mail_templates/logo.png",
    referencedBy: "GET /email-logo.png",
    issue: "Referenced file is missing from the repository",
  });
}
const dashboard = dashboardRoutes;
const storefront = collectStorefront();
const media = collectMediaServer();
const existingTests = collectExistingTests();
const inventory = {
  counts: {
    mounts: backend.mountCount,
    endpoints: backend.endpoints.length,
    protectedAdminRoutes: backend.endpoints.filter(
      (route) => route.access === "admin" || route.access.startsWith("permission:")
    ).length,
    directRoutes: directAppRoutes.length,
    backgroundJobs: backgroundJobs.length,
    rawEndpoints: backend.rawEndpointCount,
    duplicates: backend.duplicateCount,
    dashboardRoutes: dashboard.length,
    storefrontRoutes: storefront.length,
    mediaRoutes: media.length,
    actions: actionGroups.length,
    existingTests: existingTests.length,
  },
  backend: backend.endpoints,
  directAppRoutes,
  backgroundJobs,
  mounts: backend.mounts,
  unmounted: backend.unmounted,
  findings: backend.findings,
  assetFindings,
  dashboard,
  storefront,
  media,
  actions: actionGroups,
  existingTests,
};
const json = `${JSON.stringify(inventory, null, 2)}\n`;
const markdown = renderMarkdown(inventory);

if (checkMode) {
  const currentJson = fs.existsSync(jsonPath) ? read(jsonPath) : "";
  const currentMarkdown = fs.existsSync(markdownPath) ? read(markdownPath) : "";
  if (currentJson !== json || currentMarkdown !== markdown) {
    console.error("Test inventory is outdated. Run node backend/scripts/generate-test-inventory.mjs");
    process.exit(1);
  }
  console.log("Test inventory is up to date.");
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(jsonPath, json);
fs.writeFileSync(markdownPath, markdown);
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
console.log(
  `Backend=${inventory.counts.endpoints} Direct=${inventory.counts.directRoutes} Jobs=${inventory.counts.backgroundJobs} Dashboard=${inventory.counts.dashboardRoutes} Storefront=${inventory.counts.storefrontRoutes} Media=${inventory.counts.mediaRoutes} Actions=${inventory.counts.actions}`
);
