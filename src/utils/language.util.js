/**
 * ============================================================================
 * QUY TẮC QUẢN LÝ NGÔN NGỮ & OUTPUT (I18N CONVENTION)
 * ============================================================================
 * 1. Tuyệt đối KHÔNG hardcode chuỗi thông báo trả về trong Controller, Service
 *    hay Middleware.
 * 2. Mỗi khi thêm một API output hoặc thông báo lỗi mới:
 *    - Bước 1: Kiểm tra phiên bản mới nhất của file `utils/language.util.js`.
 *    - Bước 2: Nếu trong `MESSAGES` đã có key phù hợp -> TÁI SỬ DỤNG key đó.
 *    - Bước 3: Nếu chưa có -> TẠO KEY MỚI theo chuẩn `UPPER_SNAKE_CASE` kèm
 *      đầy đủ cả 2 bản dịch `vi` và `en` trước khi sử dụng ở `ApiResponse`
 *      hoặc `AppError`.
 * ============================================================================
 */

const SUPPORTED_LANGS = ['vi', 'en'];
const DEFAULT_LANG = 'vi';

const MESSAGES = {
  // Common & System
  SUCCESS: {
    vi: 'Thành công',
    en: 'Success',
  },
  INTERNAL_ERROR: {
    vi: 'Lỗi hệ thống máy chủ nội bộ',
    en: 'Internal Server Error',
  },
  VALIDATION_ERROR: {
    vi: 'Dữ liệu đầu vào không hợp lệ',
    en: 'Validation failed',
  },
  INVALID_ID: {
    vi: 'Định dạng mã định danh không hợp lệ',
    en: 'Invalid identifier format',
  },
  DUPLICATE_DATA: {
    vi: 'Dữ liệu đã tồn tại trong hệ thống',
    en: 'Duplicate resource already exists',
  },
  ROUTE_NOT_FOUND: {
    vi: 'Không tìm thấy đường dẫn API',
    en: 'API endpoint not found',
  },

  // Auth & Permission
  UNAUTHORIZED: {
    vi: 'Vui lòng đăng nhập để tiếp tục',
    en: 'Authentication required. Please log in',
  },
  TOKEN_EXPIRED: {
    vi: 'Phiên đăng nhập đã hết hạn',
    en: 'Session token has expired',
  },
  INVALID_TOKEN: {
    vi: 'Mã xác thực không hợp lệ',
    en: 'Invalid authentication token',
  },
  FORBIDDEN: {
    vi: 'Bạn không có quyền truy cập tài nguyên này',
    en: 'You do not have permission to access this resource',
  },
  LOGIN_SUCCESS: {
    vi: 'Đăng nhập thành công',
    en: 'Logged in successfully',
  },
  INVALID_CREDENTIALS: {
    vi: 'Tài khoản hoặc mật khẩu không chính xác',
    en: 'Invalid username or password',
  },
  MISSING_CREDENTIALS: {
    vi: 'Vui lòng nhập đầy đủ username và password',
    en: 'Please provide both username and password',
  },
  ACCOUNT_NOT_FOUND: {
    vi: 'Tài khoản không tồn tại trong hệ thống',
    en: 'Account does not exist in the system',
  },
  INCORRECT_PASSWORD: {
    vi: 'Mật khẩu không chính xác',
    en: 'Incorrect password',
  },
  MISSING_DISCORD_CODE: {
    vi: 'Thiếu mã xác thực Discord',
    en: 'Missing Discord authorization code',
  },
  DISCORD_LINK_SUCCESS: {
    vi: 'Liên kết tài khoản Discord thành công',
    en: 'Discord account linked successfully',
  },

  // Player & Inventory
  LEADERBOARD_SUCCESS: {
    vi: 'Lấy bảng xếp hạng thành công',
    en: 'Leaderboard retrieved successfully',
  },
  PROFILE_SUCCESS: {
    vi: 'Lấy thông tin nhân vật thành công',
    en: 'Player profile retrieved successfully',
  },
  ME_SUCCESS: {
    vi: 'Lấy hồ sơ cá nhân thành công',
    en: 'Personal profile retrieved successfully',
  },
  PLAYER_NOT_FOUND: {
    vi: 'Không tìm thấy người chơi',
    en: 'Player not found',
  },
  INVENTORY_SUCCESS: {
    vi: 'Giải mã túi đồ thành công',
    en: 'Inventory decoded successfully',
  },
  INVENTORY_NOT_FOUND: {
    vi: 'Không tìm thấy dữ liệu người chơi',
    en: 'Player inventory data not found',
  },
  SEARCH_SUCCESS: {
    vi: 'Tìm kiếm vật phẩm thành công',
    en: 'Inventory search completed successfully',
  },
  SEARCH_KEYWORD_REQUIRED: {
    vi: 'Vui lòng nhập từ khóa tìm kiếm',
    en: 'Please enter a search keyword',
  },

  // Inventory Container & Slot Labels
  INVENTORY_MAIN: {
    vi: 'Túi đồ chính',
    en: 'Main Inventory',
  },
  INVENTORY_ENDER_CHEST: {
    vi: 'Rương Ender',
    en: 'Ender Chest',
  },
  LOCATION_EQUIPPED_ARMOR: {
    vi: 'Trang bị đang mặc (Slot {slot})',
    en: 'Equipped Armor (Slot {slot})',
  },
  LOCATION_OFFHAND: {
    vi: 'Tay phụ (Offhand)',
    en: 'Offhand',
  },
  LOCATION_HOTBAR: {
    vi: 'Thanh Hotbar (Ô {slot})',
    en: 'Hotbar (Slot {slot})',
  },
  LOCATION_MAIN_INVENTORY: {
    vi: 'Túi đồ chính (Slot {slot})',
    en: 'Main Inventory (Slot {slot})',
  },
  LOCATION_TRINKET: {
    vi: 'Ô Trang Sức ({type})',
    en: 'Trinket Slot ({type})',
  },
  LOCATION_ENDER_CHEST: {
    vi: 'Rương Ender (Slot {slot})',
    en: 'Ender Chest (Slot {slot})',
  },
  LOCATION_BACKPACK: {
    vi: '{bagName} [{parentLocation} -> Slot {bagSlot}] - Ô số {slot}',
    en: '{bagName} [{parentLocation} -> Slot {bagSlot}] - Slot {slot}',
  },
  // Private Assets (Jobs, Mounts, Crops, Waystones)
  JOBS_SUCCESS: {
    vi: 'Lấy dữ liệu nghề phụ thành công',
    en: 'Player jobs data retrieved successfully',
  },
  MOUNTS_SUCCESS: {
    vi: 'Lấy dữ liệu thú cưỡi thành công',
    en: 'Player mounts data retrieved successfully',
  },
  CROPS_SUCCESS: {
    vi: 'Lấy dữ liệu vườn cây thành công',
    en: 'Player crops data retrieved successfully',
  },
  WAYSTONES_SUCCESS: {
    vi: 'Lấy dữ liệu điểm dịch chuyển cá nhân thành công',
    en: 'Personal waystones retrieved successfully',
  },
  WORLD_WAYSTONES_SUCCESS: {
    vi: 'Lấy danh sách điểm dịch chuyển trên bản đồ thành công',
    en: 'World waystones retrieved successfully',
  },
  // RBAC & Admin Moderation
  INVALID_ROLE: {
    vi: 'Vai trò phân quyền không hợp lệ',
    en: 'Invalid role specified',
  },
  ROLE_UPDATED_SUCCESS: {
    vi: 'Cập nhật vai trò người dùng thành công',
    en: 'User role updated successfully',
  },
  MOD_ACTION_NOT_ALLOWED: {
    vi: 'Moderator không có quyền thực hiện thao tác này',
    en: 'Moderators are not permitted to perform this action',
  },
  MOD_LIMIT_EXCEEDED: {
    vi: 'Thao tác vượt quá giới hạn cho phép của Moderator ({limit})',
    en: 'Action exceeds Moderator policy limit ({limit})',
  },
  POLICY_UPDATED_SUCCESS: {
    vi: 'Cập nhật giới hạn quyền Moderator thành công',
    en: 'Moderator policy updated successfully',
  },
  ADMIN_INSPECT_SUCCESS: {
    vi: 'Truy xuất dữ liệu kiểm tra thành công',
    en: 'Inspection data retrieved successfully',
  },
  ACTION_QUEUED_SUCCESS: {
    vi: 'Đã gửi lệnh thực thi tới máy chủ thành công',
    en: 'Action queued for server execution successfully',
  },
  CANNOT_MODIFY_SELF_ROLE: {
    vi: 'Không thể tự thay đổi vai trò của chính mình',
    en: 'You cannot modify your own role',
  },
  // Operator View All & Global Inspection
  OPERATOR_PLAYERS_LIST_SUCCESS: {
    vi: 'Lấy danh sách tài khoản người chơi thành công',
    en: 'Players directory retrieved successfully',
  },
  OPERATOR_WAYSTONES_ALL_SUCCESS: {
    vi: 'Lấy toàn bộ điểm dịch chuyển trên máy chủ thành công',
    en: 'All server waystones retrieved successfully',
  },
  OPERATOR_GLOBAL_SEARCH_SUCCESS: {
    vi: 'Quét vật phẩm toàn máy chủ hoàn tất',
    en: 'Server-wide item scan completed',
  },
  OPERATOR_MOUNTS_ALL_SUCCESS: {
    vi: 'Lấy toàn bộ dữ liệu thú cưỡi trên máy chủ thành công',
    en: 'All server mounts retrieved successfully',
  },
  OPERATOR_CROPS_ALL_SUCCESS: {
    vi: 'Lấy toàn bộ dữ liệu cây trồng trên máy chủ thành công',
    en: 'All server crops retrieved successfully',
  },
  OPERATOR_JOBS_ALL_SUCCESS: {
    vi: 'Lấy toàn bộ dữ liệu nghề phụ trên máy chủ thành công',
    en: 'All server jobs retrieved successfully',
  },
};

const normalizeLang = (rawLang) => {
  if (!rawLang || typeof rawLang !== 'string') return DEFAULT_LANG;
  const shortCode = rawLang.trim().slice(0, 2).toLowerCase();
  return SUPPORTED_LANGS.includes(shortCode) ? shortCode : DEFAULT_LANG;
};

const resolveLang = (req) => {
  if (!req) return DEFAULT_LANG;
  const candidate =
    req.query?.lang ||
    req.headers?.['x-lang'] ||
    req.headers?.['accept-language'];
  return normalizeLang(candidate);
};

const t = (key, lang = DEFAULT_LANG, params = {}) => {
  if (!key) return '';
  const targetLang = normalizeLang(lang);
  const entry = MESSAGES[key];

  let template = entry ? entry[targetLang] || entry[DEFAULT_LANG] : String(key);

  if (params && typeof params === 'object') {
    for (const [paramKey, paramVal] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
    }
  }

  return template;
};

module.exports = {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  MESSAGES,
  resolveLang,
  t,
};