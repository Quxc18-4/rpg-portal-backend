# LO TRINH PHAT TRIEN RPG WEB COMPANION PORTAL

## Kien truc Repository
- `rpg-portal-backend`: Repository chinh (Node.js + Express Layered Architecture)
- `rpg-portal-frontend`: Repository doc lap cho React UI, nhung vao `rpg-portal-backend/frontend` qua **Git Subtree**

## Giai doan 1: Ha tang & Kien truc phan tang (Layered Architecture)
- [x] Khoi tao 2 repository rieng biet va cau hinh Git Subtree
- [ ] Cau hinh ket noi MongoDB (Read-only cho game collections, Read/Write cho web_accounts)
- [ ] Chuan hoa Response & Global Error Handler

## Giai doan 2: Core Utilities & Logic nghiep vu
- [ ] Quy doi tien te he co so 64 (64 Dong = 1 Bac, 64 Bac = 1 Vang)
- [ ] Port thuat toan tinh gia & du bao chot so 00:00 tu GlobalEconomyManager
- [ ] Xay dung bo giai ma BukkitObjectOutputStream Base64 (rO0ABX...) kem cache hash

## Giai doan 3: Xac thuc kep & Phan quyen 3 lop
- [ ] Dang nhap bang tai khoan In-game (username + password)
- [ ] Dang nhap & lien ket UUID qua Discord OAuth2
- [ ] Middleware phan quyen Public / Friend (allow_friend_teleport) / Owner

## Giai doan 4: RESTful API Endpoints (/api/v1)
- [ ] /auth (login, discord callback, link-account)
- [ ] /players (leaderboard, profile, inventory, private-assets)
- [ ] /market (prices, daily-forecast, licenses)
- [ ] /world (zones 2.5D, ecosystems, server-status)

## Giai doan 5: Giao dien React Frontend
- [ ] Leaderboard & Player Profile (Radar Chart 5 chi so + Web Armory tooltip)
- [ ] Tab Nghe phu (player_jobs), Thu cuoi (player_mounts), Vuon cay (Crop), Qua (PlayerReward)
- [ ] San Kinh Te (Global Economy & Xu huong gia)
- [ ] Ban do chien su 2.5D (Tach lop Mat dat y >= 50 va Long dat y < 50)

## Giai doan 6: Kiem thu & Trien khai
- [ ] Test API bang REST Client (api-test.http)
- [ ] Dong bo subtree & trien khai Production voi PM2 / Docker & Nginx
